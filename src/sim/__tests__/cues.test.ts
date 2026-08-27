/**
 * A road user doing something of its own accord.
 *
 * The point of anchoring a cue to distance along its own path is that the hazard is the *other*
 * driver's mistake: it happens in the same place whether the rider arrives early, late, or not at
 * all. These are the tests that say so.
 */
import { describe, expect, test } from 'vitest';
import { SimEngine } from '../engine';
import { rechtsafFietspad } from '../scenario.rechtsaf-fietspad';
import type { ActorCue, Scenario } from '../types';

/** Scenario 1 with its snorfiets moved onto the side road, given cues, and nothing else changed. */
function withCues(cues: ActorCue[], speedKmh = 70): Scenario {
  return {
    ...rechtsafFietspad,
    actors: [
      {
        ...rechtsafFietspad.actors[0],
        from: { x: 90, y: 1.5 },
        to: { x: -60, y: 1.5 },
        speed: speedKmh / 3.6,
        cues,
        keepInBlindSpot: { enabled: false, minSpeed: 0, maxSpeed: 0, targetGap: 0, releaseAt: 0 },
      },
    ],
  };
}

/** Run without touching a single control: whatever happens is the actor's own doing. */
function ride(scenario: Scenario, seconds: number) {
  const engine = new SimEngine(scenario);
  engine.arm(() => {}, '2026-01-01T12:00:00.000Z');
  engine.paused = true;
  engine.advance(3.2);
  const trace: { t: number; speed: number; dist: number }[] = [];
  for (let i = 0; i < seconds * 10; i++) {
    engine.advance(0.1);
    const a = engine.actors[0];
    trace.push({ t: +engine.t.toFixed(1), speed: +(a.speed * 3.6).toFixed(1), dist: +a.dist.toFixed(1) });
  }
  return trace;
}

describe('een weggebruiker met eigen aanwijzingen', () => {
  test('remt waar de aanwijzing staat, niet waar de rijder is', () => {
    const trace = ride(withCues([{ atDist: 40, action: 'brake', forSeconds: 2 }]), 8);
    // Up to the cue it is doing exactly what it was told to do, and not a bit less.
    for (const s of trace.filter((x) => x.dist < 40)) expect(s.speed).toBeCloseTo(70, 0);
    // Then it stands on them. Two seconds at the actor brake rate is about thirty-six km/h.
    const braked = Math.min(...trace.filter((x) => x.dist >= 40).map((x) => x.speed));
    expect(braked).toBeLessThan(40);
  });

  test('en laat daarna weer los', () => {
    const trace = ride(withCues([{ atDist: 30, action: 'brake', forSeconds: 1.5 }]), 12);
    const slowest = Math.min(...trace.map((s) => s.speed));
    expect(slowest).toBeLessThan(50);
    // Back up to its cruising speed once the cue has run out.
    expect(trace[trace.length - 1].speed).toBeGreaterThan(65);
  });

  test('stoppen betekent stoppen, en blijven staan', () => {
    const trace = ride(withCues([{ atDist: 25, action: 'stop' }]), 14);
    expect(Math.min(...trace.map((s) => s.speed))).toBe(0);
    expect(trace[trace.length - 1].speed).toBe(0);
  });

  test('en een resume-aanwijzing zet hem weer in beweging', () => {
    const trace = ride(
      withCues([
        { atDist: 25, action: 'stop' },
        { atDist: 25.0001, action: 'resume' },
      ]),
      14,
    );
    // The second cue fires as soon as the first has, so it never actually comes to rest.
    expect(trace[trace.length - 1].speed).toBeGreaterThan(60);
  });

  test('elke aanwijzing gaat precies één keer af', () => {
    const trace = ride(withCues([{ atDist: 20, action: 'brake', forSeconds: 1 }]), 16);
    // Slowed once, recovered once, and did not sit down again at the same spot on the way past.
    const recovered = trace.filter((s, i) => i > 0 && s.speed > 68 && trace[i - 1].speed <= 68);
    expect(recovered.length).toBe(1);
  });

  test('zonder aanwijzingen verandert er niets aan het oude gedrag', () => {
    const trace = ride(withCues([]), 8);
    for (const s of trace) expect(s.speed).toBeCloseTo(70, 0);
  });
});
