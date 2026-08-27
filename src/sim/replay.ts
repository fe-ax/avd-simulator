/**
 * Replay. Plays back the recorded samples rather than re-simulating, so a replay is bit-for-bit
 * what happened — no determinism traps — and so a run loaded from localStorage replays without
 * an engine. This is also the data path the future record-and-edit feature will hook into.
 */

import type {
  ActorSample,
  ActorSpec,
  ActorState,
  BikeSample,
  RunRecord,
  Scenario,
  WorldView,
} from './types';

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function lerpAngle(a: number, b: number, u: number): number {
  let delta = b - a;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  return a + delta * u;
}

/** Index of the last sample at or before `t`. */
function indexAt<T extends { t: number }>(samples: T[], t: number): number {
  let lo = 0;
  let hi = samples.length - 1;
  if (hi < 0) return -1;
  if (t <= samples[0].t) return 0;
  if (t >= samples[hi].t) return hi;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t <= t) lo = mid;
    else hi = mid;
  }
  return lo;
}

export class ReplayPlayer {
  readonly record: RunRecord;
  readonly scenario: Scenario;
  readonly duration: number;
  t = 0;
  playing = false;
  rate = 1;

  private specById: Record<string, ActorSpec>;

  constructor(record: RunRecord, scenario: Scenario) {
    this.record = record;
    this.scenario = scenario;
    this.duration = record.durationS;
    this.specById = Object.fromEntries(scenario.actors.map((a) => [a.id, a]));
  }

  play() {
    if (this.t >= this.duration - 1e-3) this.t = 0;
    this.playing = true;
  }

  pause() {
    this.playing = false;
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(t: number) {
    this.t = Math.max(0, Math.min(this.duration, t));
  }

  step(seconds: number) {
    this.playing = false;
    this.seek(this.t + seconds);
  }

  tick(dt: number) {
    if (!this.playing) return;
    this.t += dt * this.rate;
    if (this.t >= this.duration) {
      this.t = this.duration;
      this.playing = false;
    }
  }

  bikeAt(t: number): BikeSample {
    const samples = this.record.samples;
    const i = indexAt(samples, t);
    const a = samples[i];
    const b = samples[Math.min(i + 1, samples.length - 1)];
    const span = b.t - a.t;
    const u = span <= 0 ? 0 : Math.max(0, Math.min(1, (t - a.t) / span));
    return {
      ...a,
      t,
      s: lerp(a.s, b.s, u),
      d: lerp(a.d, b.d, u),
      x: lerp(a.x, b.x, u),
      y: lerp(a.y, b.y, u),
      heading: lerpAngle(a.heading, b.heading, u),
      speed: lerp(a.speed, b.speed, u),
      headYaw: lerpAngle(a.headYaw, b.headYaw, u),
      headPitch: lerp(a.headPitch, b.headPitch, u),
    };
  }

  private actorAt(id: string, t: number): ActorState | null {
    const track = this.record.actorTracks[id];
    const spec = this.specById[id];
    if (!track?.length || !spec) return null;
    const i = indexAt(track, t);
    const a: ActorSample = track[i];
    const b: ActorSample = track[Math.min(i + 1, track.length - 1)];
    const span = b.t - a.t;
    const u = span <= 0 ? 0 : Math.max(0, Math.min(1, (t - a.t) / span));
    return {
      spec,
      dist: 0,
      x: lerp(a.x, b.x, u),
      y: lerp(a.y, b.y, u),
      heading: lerpAngle(a.heading, b.heading, u),
      speed: lerp(a.speed, b.speed, u),
      mode: a.mode,
      perceived: a.perceived,
      perceivedAt: null,
      emergencyBraked: false,
      emergencyBrakedAt: null,
    };
  }

  scene(): WorldView {
    const bike = this.bikeAt(this.t);
    const actors = Object.keys(this.record.actorTracks)
      .map((id) => this.actorAt(id, this.t))
      .filter((a): a is ActorState => a !== null);
    return {
      world: this.scenario.world,
      time: this.t,
      pose: { x: bike.x, y: bike.y, heading: bike.heading },
      speedFactor: bike.speed / Math.max(1, this.scenario.speedLimitKmh / 3.6),
      speedKmh: bike.speed * 3.6,
      gear: bike.gear,
      targetSpeedKmh: bike.targetSpeedKmh ?? Math.round(bike.speed * 3.6),
      indicator: bike.indicator,
      braking: bike.brake,
      actors,
      head: { yaw: bike.headYaw, pitch: bike.headPitch },
    };
  }
}
