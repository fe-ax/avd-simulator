/**
 * Looking twice is good practice, and it used to fail the exercise.
 *
 * Reported by an instructor: *"I checked the shoulder 2 times because it's good habit to check more
 * often than once"* — and the debrief said **je keek niet in je rechterspiegel**, as a fout, about a
 * mirror they had demonstrably used.
 *
 * The cause was that every look breaking `maxInBurst` was deleted before anything was credited. That
 * closed a real loophole — mashing every control hits every window by accident — by a means that
 * also erased the evidence of ordinary, brisk, correct riding. The reeks is six looks; do it at half
 * a second apart instead of one and a quarter, which is a perfectly normal pace, and three of them
 * vanish.
 *
 * A remark about scanning became faults for not looking, which is the opposite of what the
 * discarding was for. The discard now follows the scenario's own declaration of where looking stops
 * and scanning starts — `faultAt` — rather than a second, hidden rule at every local burst.
 */
import { describe, expect, it } from 'vitest';
import { rechtsafFietspad } from '../scenario.rechtsaf-fietspad';
import { driveRun } from '../testDriver';
import { scoreRun } from '../scoring';
import type { ControlEvent, RunRecord } from '../types';

const LOOK = /EYE|MIRROR|SHOULDER/;
const REEKS = ['EYE_LEFT', 'MIRROR_LEFT', 'EYE_RIGHT', 'MIRROR_RIGHT', 'SHOULDER_RIGHT'] as const;

/**
 * The same correct reeks, ridden at a chosen pace, optionally checking the shoulder twice.
 *
 * Built from a real ride so everything but the looks is genuine; only the timing of the looks is
 * the variable under test. Every press sits inside its own window at every pace here, so any fault
 * that appears is the discipline rule and nothing else.
 */
function reeksAtPace(spacing: number, twice: boolean): RunRecord {
  const base = driveRun(rechtsafFietspad, {});
  const others = base.events.filter((e) => !(e.phase === 'press' && LOOK.test(e.control)));
  const seq = twice ? [...REEKS, 'SHOULDER_RIGHT' as const] : [...REEKS];
  const looks: ControlEvent[] = seq.map((control, i) => ({
    t: 4.49 + i * spacing,
    d: 90 - i * spacing * 8,
    s: 0,
    control,
    phase: 'press',
    source: 'gaze',
  }));
  // The looks the rider still does later, after the reeks and before the bend.
  const late = base.events.filter((e) => e.phase === 'press' && LOOK.test(e.control) && e.t > 12);
  return { ...base, events: [...others, ...looks, ...late].sort((a, b) => a.t - b.t) };
}

const scored = (rec: RunRecord) => scoreRun(rec, rechtsafFietspad);
const row = (rec: RunRecord, id: string) => scored(rec).results.find((r) => r.expectedId === id);

describe('vaker kijken dan nodig', () => {
  it.each([1.2, 0.5, 0.3])('op %ss blijft elke blik meetellen', (spacing) => {
    const sc = scored(reeksAtPace(spacing, true));
    // Not one of the look steps may report as missed: the rider did all of them, twice over for
    // the schouderblik. Before the fix, half a second apart cost two fouten.
    const missed = sc.results.filter((r) => r.group === 'kijken' && r.status === 'gemist');
    expect(missed.map((r) => r.expectedId)).toEqual([]);
  });

  it('en levert hooguit een opmerking op, geen fout', () => {
    const sc = scored(reeksAtPace(0.5, true));
    expect(sc.results.find((r) => r.expectedId === 'kijkgedrag')?.severity).toBe('opmerking');
    expect(sc.counts.fout).toBe(0);
    expect(sc.verdict).toBe('geslaagd');
  });

  it('en het tweede schouderblik telt voor de stap waar het eerste te vroeg voor was', () => {
    // The heart of the report. The first check lands before the window opens; the second is inside
    // it. Deleting the second as a repeat is what made a rider who looked *more* look like one who
    // had not looked at all.
    const base = driveRun(rechtsafFietspad, {});
    const others = base.events.filter((e) => !(e.phase === 'press' && e.control === 'SHOULDER_RIGHT'));
    // 90 m is outside the window (84–30, tolerance 8), so on its own it scores "te vroeg". The
    // second is a second later and 8 m on, squarely inside — and one second apart is exactly what
    // made it a discarded repeat.
    const early: ControlEvent = { t: 4.0, d: 90, s: 0, control: 'SHOULDER_RIGHT', phase: 'press', source: 'gaze' };
    const inside: ControlEvent = { ...early, t: 5.0, d: 82 };
    const late: ControlEvent = { ...early, t: 15.5, d: 14 };
    const rec: RunRecord = { ...base, events: [...others, early, inside, late].sort((a, b) => a.t - b.t) };
    expect(row(rec, 'schouderblik-voorbereiding')?.status).toBe('goed');
  });
});

describe('maar alleen maar scannen blijft niets waard', () => {
  it('levert geen enkele kijkactie op', () => {
    // The loophole the discarding exists for, and it must stay shut: mashing every control would
    // otherwise hit every window by accident. Above `faultAt` the run banks nothing.
    const record = driveRun(rechtsafFietspad, {
      scanConstantly: true,
      eyes: false,
      mirrors: false,
      shoulderPrep: false,
      shoulder: false,
    });
    for (const id of ['spiegel-rechts', 'schouderblik-voorbereiding', 'schouderblik-rechts']) {
      expect(record.results.find((r) => r.expectedId === id)?.status).toBe('gemist');
    }
    expect(record.verdict).toBe('gezakt');
  });

  it('en één blik twee keer voldoet niet aan twee verschillende stappen', () => {
    // The door left open by no longer discarding repeats: the Kerkstraat asks for a schouderblik
    // twice, at 84–30 m and again at 20–6 m. A double-tap must not answer both.
    const base = driveRun(rechtsafFietspad, {});
    const others = base.events.filter((e) => !(e.phase === 'press' && e.control === 'SHOULDER_RIGHT'));
    const first: ControlEvent = { t: 12.0, d: 21, s: 0, control: 'SHOULDER_RIGHT', phase: 'press', source: 'gaze' };
    const second: ControlEvent = { ...first, t: 12.9, d: 14 };
    const rec: RunRecord = { ...base, events: [...others, first, second].sort((a, b) => a.t - b.t) };
    const prep = row(rec, 'schouderblik-voorbereiding')?.status;
    const bend = row(rec, 'schouderblik-rechts')?.status;
    expect([prep, bend]).not.toEqual(['goed', 'goed']);
  });
});
