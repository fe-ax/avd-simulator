/**
 * The set speed: a cruise control, not a wrist.
 */
import { describe, expect, test } from 'vitest';
import { SimEngine } from '../engine';
import { rechtsafFietspad } from '../scenario.rechtsaf-fietspad';

describe('een gezette snelheid', () => {
  test('loopt lineair naar de gevraagde waarde in een vaste tijd', () => {
    const engine = new SimEngine(rechtsafFietspad);
    engine.arm(() => {}, '2026-01-01T12:00:00.000Z');
    engine.paused = true;
    engine.advance(3.2); // past the countdown

    const start = engine.world(false).bike.speed * 3.6;
    engine.dispatch('SET_SPEED', 'press', 'pointer', 50);

    // Linear means the halfway point in time is the halfway point in speed. A constant
    // acceleration would be there already; a first-order lag would not be there yet.
    engine.advance(2);
    const half = engine.world(false).bike.speed * 3.6;
    expect(half).toBeCloseTo((start + 50) / 2, 0);

    engine.advance(2.1);
    expect(engine.world(false).bike.speed * 3.6).toBeCloseTo(50, 1);
  });

  test('duurt even lang, hoe groot de sprong ook is', () => {
    const times: number[] = [];
    for (const target of [35, 50, 60]) {
      const engine = new SimEngine(rechtsafFietspad);
      engine.arm(() => {}, '2026-01-01T12:00:00.000Z');
      engine.paused = true;
      engine.advance(3.2);
      const t0 = engine.t;
      engine.dispatch('SET_SPEED', 'press', 'pointer', target);
      for (let i = 0; i < 200; i++) {
        engine.advance(0.05);
        if (Math.abs(engine.world(false).bike.speed * 3.6 - target) < 0.05) break;
      }
      times.push(engine.t - t0);
    }
    // A fixed timespan, deliberately: a rider planning a merge wants to know when they will be
    // at speed without first working out how far away it is.
    for (const t of times) expect(t).toBeCloseTo(times[0], 1);
  });

  test('wordt losgelaten zodra de rijder zelf iets doet', () => {
    const ride = (interrupt: 'BRAKE' | 'THROTTLE_DOWN' | null) => {
      const engine = new SimEngine(rechtsafFietspad);
      engine.arm(() => {}, '2026-01-01T12:00:00.000Z');
      engine.paused = true;
      engine.advance(3.2);
      engine.dispatch('SET_SPEED', 'press', 'pointer', 60);
      engine.advance(1);
      if (interrupt) engine.dispatch(interrupt, interrupt === 'BRAKE' ? 'down' : 'press', 'keyboard');
      engine.advance(6);
      return engine.world(false).bike.speed * 3.6;
    };

    // Left alone it arrives at sixty.
    expect(ride(null)).toBeCloseTo(60, 1);
    // The brake wins outright.
    expect(ride('BRAKE')).toBeLessThan(20);
    // And a hand on the throttle takes it back: one step under the sixty that was asked for,
    // reached by ordinary acceleration rather than by the ramp carrying on regardless.
    expect(ride('THROTTLE_DOWN')).toBeCloseTo(60 - rechtsafFietspad.throttleStepKmh, 1);
  });
});
