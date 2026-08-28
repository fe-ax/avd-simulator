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
import { roadSurfaces } from '../roadSurfaces';
import { motorwayLanes } from '../surfaces/motorway';
import { scoreRun } from '../scoring';
import type { ExitPlan } from '../testDriver';

/**
 * Bounds derived from where the machine actually went, not typed in.
 *
 * A hardcoded frame is the bug this project has already had twice: lengthen the approach and the
 * first sixty metres of the ride fall outside the extent, so the road is never generated there and
 * `findOffRoad` reports its own blind spot as verge. It said 69 points the moment the exercise grew.
 */
function extentOfRide(path: readonly { x: number; y: number }[]) {
  const xs = path.map((p) => p.x);
  const ys = path.map((p) => p.y);
  const margin = 120;
  return {
    minX: Math.min(...xs) - margin, maxX: Math.max(...xs) + margin,
    minY: Math.min(...ys) - margin, maxY: Math.max(...ys) + margin,
  };
}

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
    expect(findOffRoad(uitvoegenSnelweg.world, path, extentOfRide(path))).toEqual([]);
  });

  it('verstopt niets achter iets anders — het is een snelweg', () => {
    const { record } = referenceRide(uitvoegenSnelweg);
    const labels = Object.fromEntries(uitvoegenSnelweg.actors.map((a) => [a.id, a.label]));
    const path = record.samples.map((v) => ({ x: v.x, y: v.y }));
    expect(findHiddenReveals(uitvoegenSnelweg.world, record, labels, extentOfRide(path))).toEqual([]);
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

describe('hoe de afrit er ligt', () => {
  const EXT = { minX: -80, maxX: 120, minY: -760, maxY: 480 };
  const strook = { mouth: 0, end: 300 };
  const lanes = motorwayLanes(
    (uitvoegenSnelweg.world as Extract<typeof uitvoegenSnelweg.world, { kind: 'motorway' }>).road,
  );

  it('buigt vooruit en naar rechts, niet terug langs de weg', () => {
    // Both ends of the arc sit near pi, and which side of it they fall on is the entire difference
    // between an exit and a spur pointing back down the carriageway. Sweeping *up* from pi drives
    // sin negative, which drew the ramp 56 m behind where the strook ends — it read as an inverted
    // corner from the saddle and as a slip road going the wrong way in plan view.
    const ramp = roadSurfaces(uitvoegenSnelweg.world, EXT).filter(
      (s) => s.kind === 'asphalt' && s.height === 0 && s.points.every((p) => p.x > lanes.mergeTo - 0.01),
    );
    expect(ramp.length).toBeGreaterThan(0);
    const ys = ramp.flatMap((s) => s.points.map((p) => p.y));
    expect(Math.min(...ys)).toBeGreaterThan(strook.end);
  });

  it('en de blokmarkering begint waar de weg begint te splitsen', () => {
    // Not where the strook reaches full width. Between the two sat a widening wedge of bare tarmac,
    // which from the saddle reads as a shoulder rather than as a lane you may cross into.
    const band = roadSurfaces(uitvoegenSnelweg.world, EXT)
      .filter((s) => s.kind === 'paint' && s.height === 0)
      .filter((s) => {
        const w = Math.max(...s.points.map((p) => p.x)) - Math.min(...s.points.map((p) => p.x));
        return Math.abs(w - lanes.blockTo + lanes.blockFrom) < 0.01;
      });
    expect(band.length).toBeGreaterThan(0);
    const first = Math.min(...band.map((b) => Math.min(...b.points.map((p) => p.y))));
    expect(first).toBeLessThan(strook.mouth);
  });
});

describe('je moet wel achter ze gaan hangen', () => {
  /** Clear space between the rider's nose and the rearmost lorry's tail, over the whole ride. */
  function gapToConvoy(record: ReturnType<typeof driveExit>) {
    const track = record.actorTracks['weggebruiker-3'];
    const half = (uitvoegenSnelweg.actors.find((a) => a.id === 'weggebruiker-3')?.length ?? 0) / 2;
    return record.samples.map((s) => {
      const a = track.find((x) => Math.abs(x.t - s.t) < 0.03);
      return a ? { t: s.t, d: s.d, gap: a.y - s.y - half } : null;
    }).filter((x): x is { t: number; d: number; gap: number } => x !== null);
  }

  it('wie 105 blijft rijden, rijdt achterop de vrachtwagen vóór de afrit', () => {
    // The whole exercise, in one assertion. The first build of this scenario put the convoy far
    // enough ahead that holding 105 reached the exit with room to spare and scored *geslaagd* — you
    // could ignore the lesson entirely and pass. The approach is now long enough that the road runs
    // out first: contact comes before the mouth, not somewhere down the strook.
    const record = driveExit(uitvoegenSnelweg, { holdSpeed: true });
    const contact = gapToConvoy(record).find((s) => s.gap <= 0);
    expect(contact).toBeDefined();
    expect(contact!.d).toBeGreaterThan(0); // still short of the strook, so there is no exit to take
    expect(scoreRun(record, uitvoegenSnelweg).verdict).toBe('gezakt');
  });

  it('en wie wél terugvalt, hangt er een flinke tijd achter voordat de afrit komt', () => {
    // "Slow down and sit behind them for a while" is the thing being taught, so it has to be a
    // stretch of the ride rather than a moment. Fifteen seconds is most of the approach.
    const record = driveExit(uitvoegenSnelweg);
    const behind = record.samples.filter((s) => s.d > 0 && s.speed * 3.6 < 95).length / 20;
    expect(behind).toBeGreaterThan(15);
  });

  it('zonder dat de modelrijder ooit te dicht komt', () => {
    const record = driveExit(uitvoegenSnelweg);
    const inWindow = gapToConvoy(record).filter((s) => s.d <= 200 && s.d >= -100);
    expect(Math.min(...inWindow.map((s) => s.gap))).toBeGreaterThan(40);
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
