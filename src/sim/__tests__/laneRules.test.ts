/**
 * The three rules an overtake needs, tested on hand-built runs before any scenario leans on them.
 *
 * All three exist because an overtake has no conflict point: it happens wherever the rider decides,
 * so the reeks is judged against the manoeuvre rather than against a milepost.
 */
import { describe, expect, test } from 'vitest';
import { scoreRun } from '../scoring';
import { rechtsafFietspad } from '../scenario.rechtsaf-fietspad';
import type { BikeSample, ControlEvent, ExpectedAction, LaneChange, RunRecord, Scenario } from '../types';

function sample(t: number, d: number, speedKmh: number): BikeSample {
  return {
    t, s: 0, d, x: 0, y: 0, heading: Math.PI / 2,
    speed: speedKmh / 3.6, gear: 5, clutch: false, brake: false,
    indicator: 'off', branch: 'approach', headYaw: 0, headPitch: 0,
    laneOffset: 0, targetSpeedKmh: speedKmh,
  };
}

function press(t: number, control: ControlEvent['control']): ControlEvent {
  return { t, s: 0, d: 0, control, phase: 'press', source: 'gaze' };
}

/** A run carrying only what these rules read, scored by the real `scoreRun`. */
function run(over: Partial<RunRecord>, expected: ExpectedAction[]): RunRecord {
  const record: RunRecord = {
    id: 'x', scenarioId: 'x', scenarioTitle: 'x', startedAt: '2026-01-01T00:00:00.000Z',
    durationS: 20, timeScale: 1, autoSteer: false, branch: 'approach',
    manoeuvreCompletedAt: null, laneChanges: [],
    samples: [], actorTracks: {}, events: [], incidents: [],
    results: [], faults: [], counts: { opmerking: 0, fout: 0, kritiek: 0 }, verdict: 'geslaagd',
    ...over,
  };
  const scenario: Scenario = {
    ...rechtsafFietspad,
    expected,
    sequence: { ...rechtsafFietspad.sequence, ids: [] },
    unwanted: [],
    controlPrerequisites: [],
  };
  return { ...record, ...scoreRun(record, scenario) };
}

const missed = { severity: 'fout' as const, explanation: 'gemist' };

const change = (o: Partial<LaneChange>): LaneChange => ({
  startedAt: 5, completedAt: 7, direction: 'left', fromLane: 0, toLane: 1, ...o,
});

describe('laneChange', () => {
  const expected: ExpectedAction[] = [
    { id: 'uit', label: 'Uitvoegen', group: 'sturen', kind: { type: 'laneChange', direction: 'left' }, missed, praise: 'ok' },
  ];

  test('is goed zodra de motor die kant op is gegaan', () => {
    const r = run({ laneChanges: [change({})] }, expected);
    expect(r.results[0].status).toBe('goed');
    expect(r.results[0].actualT).toBe(7);
  });

  test('en gemist als hij dat nooit deed', () => {
    expect(run({ laneChanges: [] }, expected).results[0].status).toBe('gemist');
  });

  test('een wissel de andere kant op telt niet mee', () => {
    expect(run({ laneChanges: [change({ direction: 'right' })] }, expected).results[0].status).toBe('gemist');
  });
});

describe('beforeLaneChange', () => {
  const expected: ExpectedAction[] = [
    {
      id: 'spiegel', label: 'Spiegel links', group: 'kijken',
      kind: { type: 'beforeLaneChange', control: 'MIRROR_LEFT', direction: 'left', withinSeconds: 6 },
      missed, praise: 'ok',
    },
  ];
  const moved = { laneChanges: [change({ startedAt: 10, completedAt: 12 })] };

  test('telt een blik kort vóór het insturen', () => {
    const r = run({ ...moved, events: [press(6, 'MIRROR_LEFT')] }, expected);
    expect(r.results[0].status).toBe('goed');
  });

  test('maar niet een die veel te vroeg kwam', () => {
    const r = run({ ...moved, events: [press(1, 'MIRROR_LEFT')] }, expected);
    expect(r.results[0].status).toBe('gemist');
  });

  test('en niet een die pas ná het insturen kwam', () => {
    const r = run({ ...moved, events: [press(11, 'MIRROR_LEFT')] }, expected);
    expect(r.results[0].status).toBe('gemist');
  });

  test('zonder manoeuvre valt er niets te laat te zijn: geen rij', () => {
    // The missing manoeuvre is its own row; marking the rider twice for one omission reads as
    // the debrief padding its case.
    const r = run({ laneChanges: [], events: [] }, expected);
    expect(r.results.find((x) => x.expectedId === 'spiegel')).toBeUndefined();
  });
});

describe('speedBand', () => {
  const expected: ExpectedAction[] = [
    {
      id: 'tempo', label: 'Tempo', group: 'snelheid',
      window: { from: 100, to: 0 },
      kind: {
        type: 'speedBand',
        bands: [
          { fromKmh: 100, toKmh: 130, outcome: { praise: 'Goed tempo.' } },
          { fromKmh: 95, toKmh: 100, outcome: { severity: 'opmerking', explanation: 'Iets traag.' } },
        ],
      },
      missed: { severity: 'fout', explanation: 'Verkeerd tempo.' },
    },
  ];
  const ride = (kmh: number[]) =>
    run({ samples: kmh.map((v, i) => sample(i * 0.5, 100 - i * 5, v)) }, expected);

  test('binnen de band is goed', () => {
    expect(ride([105, 106, 104, 105, 107, 105, 106, 105]).results[0].status).toBe('goed');
  });

  test('een tijdje net te traag is een opmerking', () => {
    const r = ride([97, 97, 96, 97, 98, 97, 97, 97]);
    expect(r.results[0].severity).toBe('opmerking');
    expect(r.results[0].explanation).toMatch(/km\/u/);
  });

  test('buiten alle banden is een fout', () => {
    expect(ride([80, 81, 80, 79, 80, 80, 81, 80]).results[0].severity).toBe('fout');
  });

  test('de slechtste band die je écht vasthield telt, niet een enkele uitschieter', () => {
    // One sample of 80 in an otherwise good ride is a wobble, not a speed you rode at.
    const r = ride([105, 105, 105, 80, 105, 105, 105, 105]);
    expect(r.results[0].status).toBe('goed');
  });
});
