/**
 * `speedAtMost` scores a speed you *held*, not one you touched.
 *
 * Reading a single sample — the one nearest the window's end — was gameable in the obvious
 * direction: keep 50 the whole way, stab the brake at exactly that point, pass. The second test
 * below passed before this changed, which is the entire reason it exists. It is the same hole the
 * headway rule closed, and it is closed the same way and with the same helper.
 *
 * Hand-built records rather than a driven ride, because the point is to construct a ride no model
 * rider would produce: the numbers here are the shape of the cheat, stated exactly.
 */
import { describe, expect, test } from 'vitest';
import { scoreRun } from '../scoring';
import type { BikeSample, RunRecord, Scenario } from '../types';
import { blankJunction } from '../starters';

const HZ = 20;

/** A ride down the approach at whatever speed the caller says it was doing at that distance. */
function rideWhere(speedKmhAt: (d: number) => number): RunRecord {
  const samples: BikeSample[] = [];
  let s = 0;
  for (let i = 0; i < 400; i++) {
    const t = i / HZ;
    const d = 117 - s;
    const speed = speedKmhAt(d) / 3.6;
    samples.push({
      t,
      s,
      d,
      x: 1.5,
      y: -120 + s,
      heading: Math.PI / 2,
      speed,
      gear: 3,
      clutch: false,
      brake: false,
      indicator: 'off',
      branch: 'straight',
      headYaw: 0,
      headPitch: 0,
      laneOffset: 0,
      targetSpeedKmh: 50,
    });
    s += speed / HZ;
  }
  return {
    id: 'test',
    scenarioId: 'nieuw-kruispunt-v1',
    scenarioTitle: 'test',
    startedAt: '',
    durationS: samples[samples.length - 1].t,
    timeScale: 1,
    autoSteer: false,
    branch: 'straight',
    manoeuvreCompletedAt: null,
    laneChanges: [],
    samples,
    actorTracks: {},
    events: [],
    incidents: [],
    results: [],
    faults: [],
    counts: { opmerking: 0, fout: 0, kritiek: 0 },
    verdict: 'geslaagd',
  };
}

/** One rule: be at or under 25 between 60 m and 20 m before the junction. */
const scenario: Scenario = {
  ...blankJunction,
  expected: [
    {
      id: 'afremmen',
      label: 'Afremmen',
      group: 'snelheid',
      kind: { type: 'speedAtMost', maxKmh: 25 },
      window: { from: 60, to: 20 },
      praise: 'ok',
      missed: { severity: 'fout', explanation: 'te hard' },
    },
  ],
};

const statusOf = (record: RunRecord) => scoreRun(record, scenario).results[0].status;

describe('speedAtMost', () => {
  test('een rijder die echt langzaam rijdt, haalt het', () => {
    expect(statusOf(rideWhere((d) => (d < 70 ? 20 : 50)))).toBe('goed');
  });

  test('wie te hard blijft rijden, haalt het niet', () => {
    expect(statusOf(rideWhere(() => 50))).toBe('gemist');
  });

  test('en wie alleen op de rand van het venster even remt, ook niet', () => {
    // Fifty all the way, dropping to 20 across the window's edge only — three metres, and barely
    // half of that inside the window at all. The old rule read the single sample nearest the
    // window's end, which lands squarely in that dip, so this ride scored 'goed'. It is the exact
    // cheat the held minimum exists to refuse: brake where you are measured, not where it matters.
    expect(statusOf(rideWhere((d) => (d <= 22 && d >= 19 ? 20 : 50)))).toBe('gemist');
  });

  test('de grens telt in de goede richting: precies op de grens is goed', () => {
    expect(statusOf(rideWhere((d) => (d < 70 ? 25 : 50)))).toBe('goed');
  });
});
