/**
 * Headless rider. Drives the engine through the same `dispatch` door the UI uses, with the
 * clock advanced by hand — so tests and the scenario-tuning harness exercise the real physics,
 * perception and scoring rather than a mock of them.
 */
import { SimEngine } from './engine';
import { GAZE_DURATION_S, isLookControl, LOOK_DIRECTIONS } from './perception';
import { scoreRun } from './scoring';
import type { RunRecord, Scenario } from './types';

export interface RidePlan {
  mirrors?: boolean;
  indicator?: boolean;
  eyes?: boolean;
  /** The preparation schouderblik, step 5 of the sequence. */
  shoulderPrep?: boolean;
  /** The decisive schouderblik just before turning in, step 7. */
  shoulder?: boolean;
  steer?: boolean;
  /** Announce before checking: tries the richtingaanwijzer before any schouderblik. */
  signalBeforeLooking?: boolean;
  /** Do the mirrors before the glances, so the reeks is complete but out of order. */
  swapLookOrder?: boolean;
  /** Fire the whole preparation reeks in the first metres, long before the junction is in sight. */
  rushSequenceAtStart?: boolean;
  /** Distance-to-conflict at which to do the opening blik links, to probe the early bound. */
  firstLookAtD?: number;
  /** Hammer the look controls, to exercise the kijkgedrag rules. */
  scanConstantly?: boolean;
  /** Check over the wrong shoulder, which should reveal nothing. */
  shoulderWrongSide?: boolean;
  /** Turn right past the blind spot to the road behind: still a schouderblik, sees nothing. */
  shoulderTooFarBack?: boolean;
  /** Stop and let the snorfiets pass. */
  yieldToActor?: boolean;
  gear?: boolean;
  slowDown?: boolean;
  indicatorOff?: 'direct' | 'laat' | 'nooit';
  /** Extra sloppiness: shift without pulling the clutch. */
  clutchless?: boolean;
  indicatorWrongSide?: boolean;
  /** Throttle-down presses at the very start: a deliberately cautious, slow approach. */
  startSlowPresses?: number;
  /** Training tempo. Affects only the real-time loop, never simulated time. */
  timeScale?: number;
  /** Let the bike take the turn by itself; the sturen controls do nothing. */
  autoSteer?: boolean;
  onSample?: (probe: Probe) => void;
}

export interface Probe {
  t: number;
  d: number;
  speedKmh: number;
  /** Metres the actor sits directly behind the rider, along the rider's heading. */
  gap: number;
  /** Actor bearing relative to the rider's heading, in degrees. */
  bearing: number;
  dist: number;
  mode: string;
  perceived: boolean;
}

const DEFAULTS: Required<Omit<RidePlan, 'onSample'>> = {
  mirrors: true,
  indicator: true,
  eyes: true,
  shoulderPrep: true,
  shoulder: true,
  signalBeforeLooking: false,
  swapLookOrder: false,
  shoulderWrongSide: false,
  shoulderTooFarBack: false,
  rushSequenceAtStart: false,
  firstLookAtD: 0,
  scanConstantly: false,
  steer: true,
  yieldToActor: true,
  gear: true,
  slowDown: true,
  indicatorOff: 'direct',
  clutchless: false,
  indicatorWrongSide: false,
  startSlowPresses: 0,
  timeScale: 1,
  autoSteer: false,
};

const DT = 1 / 60;
const MAX_FRAMES = 60 * 180;

/** Cycled through by `scanConstantly` to simulate a student hammering every look control. */
const SCAN_CYCLE = [
  'EYE_LEFT',
  'MIRROR_LEFT',
  'EYE_RIGHT',
  'MIRROR_RIGHT',
  'SHOULDER_RIGHT',
] as const;

function probe(engine: SimEngine): Probe {
  const actor = engine.actors[0];
  const pose = engine.bike.pose;
  const dx = actor.x - pose.x;
  const dy = actor.y - pose.y;
  let bearing = ((Math.atan2(dy, dx) - pose.heading) * 180) / Math.PI;
  while (bearing <= -180) bearing += 360;
  while (bearing > 180) bearing -= 360;
  const d = engine.distanceToConflict();
  return {
    t: engine.t,
    d,
    speedKmh: engine.bike.speed * 3.6,
    gap: engine.longitudinalGap(actor),
    bearing,
    dist: Math.hypot(dx, dy),
    mode: actor.mode,
    perceived: actor.perceived,
  };
}

export function driveRun(scenario: Scenario, plan: RidePlan = {}): RunRecord {
  const p = { ...DEFAULTS, ...plan };
  const engine = new SimEngine(scenario);
  engine.timeScale = p.timeScale;
  engine.autoSteer = p.autoSteer;
  let record: RunRecord | null = null;
  engine.arm((r) => {
    record = r;
  }, '2026-01-01T12:00:00.000Z');

  const done = new Set<string>();
  let lastScan = -99;
  let scanIndex = 0;
  // Headless stand-in for the gaze system: a look turns the head, and perception follows from
  // where the head is pointing exactly as it does in the renderer. Without this a driven ride
  // would see nothing at all, and every perception test would pass for the wrong reason.
  let headHold = 0;
  const once = (key: string, fn: () => void) => {
    if (done.has(key)) return;
    done.add(key);
    fn();
  };
  const dispatch = (
    control: Parameters<SimEngine['dispatch']>[0],
    phase: 'press' | 'down' | 'up' = 'press',
  ) => {
    if (isLookControl(control) && phase === 'press') {
      const aim = LOOK_DIRECTIONS[control];
      const overshoot = p.shoulderTooFarBack && control === 'SHOULDER_RIGHT';
      engine.headPose.yaw = ((overshoot ? -138 : aim.yaw) * Math.PI) / 180;
      engine.headPose.pitch = (aim.pitch * Math.PI) / 180;
      headHold = GAZE_DURATION_S;
    }
    engine.dispatch(control, phase, isLookControl(control) ? 'gaze' : 'keyboard');
  };

  let braking = false;

  for (let frame = 0; frame < MAX_FRAMES && record === null; frame++) {
    engine.advance(DT);
    if (engine.phase !== 'riding') continue;

    if (headHold > 0) {
      headHold -= DT;
      if (headHold <= 0) {
        engine.headPose.yaw = 0;
        engine.headPose.pitch = 0;
      }
    }

    const d = engine.distanceToConflict();
    const actor = engine.actors[0];
    plan.onSample?.(probe(engine));

    once('startSlow', () => {
      for (let i = 0; i < p.startSlowPresses; i++) dispatch('THROTTLE_DOWN');
    });

    // The prescribed sequence: leave-side, go-side, dode hoek, then announce.
    // Swapping puts each mirror before its matching glance: every step still lands inside its
    // own window, so only the order is wrong.
    // `rushSequenceAtStart` pulls every threshold up to the first few metres of the ride.
    const rush = p.rushSequenceAtStart;
    const at = (normal: number, swapped: number) =>
      rush ? 126 : p.swapLookOrder ? swapped : normal;
    if (p.eyes && d <= (p.firstLookAtD || at(90, 80))) {
      once('eyeL', () => dispatch('EYE_LEFT'));
    }
    if (p.mirrors && d <= at(80, 90)) once('mirrorL', () => dispatch('MIRROR_LEFT'));
    if (p.eyes && d <= at(70, 60)) once('eyeR', () => dispatch('EYE_RIGHT'));
    if (p.mirrors && d <= at(60, 70)) once('mirrorR', () => dispatch('MIRROR_RIGHT'));
    // Announcing first and checking afterwards: both steps land inside their own window, so
    // only the order is wrong.
    if (p.signalBeforeLooking && d <= 58) once('indEarly', () => dispatch('INDICATOR_RIGHT'));
    if (p.shoulderPrep && d <= (rush ? 122 : 50)) {
      once('shoulderPrep', () => dispatch('SHOULDER_RIGHT'));
    }
    if (p.indicatorWrongSide && d <= 44) once('indL', () => dispatch('INDICATOR_LEFT'));
    if (p.indicator && d <= 40) once('ind', () => dispatch('INDICATOR_RIGHT'));

    if (p.scanConstantly && engine.t - lastScan > 0.25) {
      lastScan = engine.t;
      dispatch(SCAN_CYCLE[scanIndex % SCAN_CYCLE.length]);
      scanIndex++;
    }

    if (p.slowDown && d <= 44) {
      once('throttle', () => {
        // Aim for the scenario's 15 km/h rather than a fixed number of presses, so a rider who
        // already set off slowly does not throttle themselves to a standstill.
        let guard = 0;
        while (engine.bike.targetSpeed * 3.6 > 15.5 && guard++ < 20) dispatch('THROTTLE_DOWN');
      });
    }
    if (p.gear && d <= 32) {
      once('gear', () => {
        if (!p.clutchless) dispatch('CLUTCH', 'down');
        dispatch('GEAR_DOWN');
        if (!p.clutchless) dispatch('CLUTCH', 'up');
      });
    }
    if (p.eyes && d <= 24) once('eyeLFinal', () => dispatch('EYE_LEFT'));
    if (p.shoulderWrongSide && d <= 14) once('wrongShoulder', () => dispatch('SHOULDER_LEFT'));
    if (p.shoulder && d <= 14) once('shoulder', () => dispatch('SHOULDER_RIGHT'));
    if (p.steer && d <= 11) once('steer', () => dispatch('STEER_RIGHT'));

    const actorPast =
      engine.routes.kind === 'urbanCrossing' && actor.y > engine.routes.crossYSpan[1] + 1.5;
    const wantStop = p.yieldToActor && d <= 12 && !actorPast;
    if (wantStop !== braking) {
      braking = wantStop;
      dispatch('BRAKE', wantStop ? 'down' : 'up');
    }

    const turnedAt = engine.getTurnCompletedAt();
    if (turnedAt !== null) {
      if (p.indicatorOff === 'direct') once('off', () => dispatch('INDICATOR_OFF'));
      else if (p.indicatorOff === 'laat' && engine.t > turnedAt + 4.5) {
        once('off', () => dispatch('INDICATOR_OFF'));
      }
      once('accelerate', () => {
        dispatch('THROTTLE_UP');
        dispatch('THROTTLE_UP');
      });
    }
  }

  if (record === null) throw new Error('Run did not finish within the frame budget');
  const scored = scoreRun(record, scenario);
  return { ...(record as RunRecord), ...scored };
}
