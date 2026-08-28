/**
 * Uitvoegen op de A12 — the fifth scenario, and the first built end to end in the browser builder
 * without a single edit to the exported file.
 *
 * What is worth pinning here is not that it can be ridden but that it is *about* something. The
 * exercise's whole claim is that blasting past three lorries and cutting into the strook halfway
 * down it is available, easy, and marked — so the tests that matter are the ones that ride badly
 * on purpose and check the band the rider lands in. A `laneChange` rule without bands would pass
 * every one of these, which is exactly why the bands exist.
 *
 * The reveal table is deliberately flat, and for scenario 3's reason rather than scenario 2's:
 * everything here is ahead of you, so the forward view finds it whatever you do with your head.
 * The mirrors do not change *when* you see the lorries; they change whether you are allowed to
 * move. That is what the reeks scores, and why this file leans on the bands and the discrimination
 * sweep instead of a timing table.
 */
import { describe, expect, it } from 'vitest';
import { uitvoegenSnelweg } from '../scenario.uitvoegen-snelweg';
import { analyseScenario, referenceRide } from '../referenceRide';
import { unscoredActors } from '../referenceRide';
import { findHiddenReveals, findOffRoad } from '../validate';
import { driveExit } from '../testDriver';
import { scoreRun } from '../scoring';
import type { ExitPlan } from '../testDriver';

const EXTENT = { minX: -60, maxX: 60, minY: -520, maxY: 420 };

/** Ride it with one thing deliberately wrong, and report what the uitvoegen rule made of it. */
function exitRule(plan: ExitPlan) {
  const record = driveExit(uitvoegenSnelweg, plan);
  const scored = scoreRun(record, uitvoegenSnelweg);
  const row = scored.results.find((r) => r.label.startsWith('4.'));
  return { severity: row?.severity ?? null, verdict: scored.verdict, counts: scored.counts };
}

describe('Uitvoegen op de A12', () => {
  it('wordt door een modelrijder foutloos gereden', () => {
    const { record, error } = referenceRide(uitvoegenSnelweg);
    expect(error).toBeNull();
    expect(record.counts).toEqual({ kritiek: 0, fout: 0, opmerking: 0 });
    expect(record.verdict).toBe('geslaagd');
  });

  it('heeft onder de hele rit asfalt', () => {
    const { record } = referenceRide(uitvoegenSnelweg);
    const path = record.samples.map((v) => ({ x: v.x, y: v.y }));
    expect(findOffRoad(uitvoegenSnelweg.world, path, EXTENT)).toEqual([]);
  });

  it('verstopt niets achter iets anders — het is een snelweg', () => {
    const { record } = referenceRide(uitvoegenSnelweg);
    const labels = Object.fromEntries(uitvoegenSnelweg.actors.map((a) => [a.id, a.label]));
    expect(findHiddenReveals(uitvoegenSnelweg.world, record, labels, EXTENT)).toEqual([]);
  });

  it('laat elke regel door een slordige rijder missen', () => {
    const open = analyseScenario(uitvoegenSnelweg)
      .discrimination.filter((r) => r.failedBy.length === 0)
      .map((r) => r.expectedId);
    expect(open).toEqual([]);
  });

  it('beoordeelt alleen de vrachtwagen waar je achter rijdt, en dat is de bedoeling', () => {
    // The front two are the wall, not the hazard: three lorries nose to tail is a thing you sit
    // behind, where two would be a gap to dive into. They carry the exercise without appearing in
    // a rule, so the unscored check names them here rather than being quietly widened to pass.
    expect(unscoredActors(uitvoegenSnelweg, referenceRide(uitvoegenSnelweg).record).map((a) => a.id))
      .toEqual(['weggebruiker-1', 'weggebruiker-2']);
  });
});

describe('waar je uitvoegt is de hele oefening', () => {
  it('meteen aan het begin van de strook is goed', () => {
    expect(exitRule({}).severity).toBeNull();
  });

  it('wie er met 130 langs blaast, voegt te laat uit en krijgt daar een fout voor', () => {
    // Not merely marked for speed: the point of the exercise is that the overtake *costs you the
    // exit*. If this ever comes back as an opmerking, the late band moved and the lesson went with
    // it — a rider who does the fun thing must land in `fout` on the rule that is about the exit.
    const r = exitRule({ blastPast: true });
    expect(r.severity).toBe('fout');
  });

  it('en wie gewoon wat treuzelt krijgt niet meer dan een opmerking', () => {
    // Eighty metres in: past the good band, still inside the strook's first half. The exercise is
    // graded, not pass-fail — a rider who is merely a bit slow off the mark should not read the
    // same debrief as one who overtook three lorries to get there.
    expect(exitRule({ exitAtM: 80 }).severity).toBe('opmerking');
  });

  it('en wie pas in de tweede helft van de strook gaat, krijgt een fout', () => {
    expect(exitRule({ exitAtM: 200 }).severity).toBe('fout');
  });

  it('wie nooit uitvoegt, voert de opdracht niet uit — dat is kritiek', () => {
    const r = exitRule({ neverExit: true });
    expect(r.severity).toBe('kritiek');
    expect(r.verdict).toBe('gezakt');
  });
});
