/**
 * Scoring. A pure function from `RunRecord` + `Scenario` to results, so it can be unit-tested
 * without a browser and re-run over a saved run without replaying it.
 *
 * The one idea that matters here: expected actions are authored in **metres before the conflict
 * point**, and converted to *this run's* seconds using its own recorded s(t). A student who
 * rides carefully arrives later and must not be marked down for it.
 */
import { isLookControl } from './perception';
import { conflictPointName } from './route';
import type {
  ActionResult,
  ActorSample,
  BikeSample,
  ControlEvent,
  ControlId,
  ExpectedAction,
  ExpectedKind,
  HeadwayBand,
  Outcome,
  RunRecord,
  Scenario,
  Severity,
  Verdict,
} from './types';

const HOLD_CONTROLS: ControlId[] = ['BRAKE', 'CLUTCH'];

/** First moment the rider was at or past `d` metres from the conflict. */
export function timeAtDistance(samples: BikeSample[], d: number): number | null {
  for (let i = 0; i < samples.length; i++) {
    if (samples[i].d <= d) {
      if (i === 0) return samples[0].t;
      const prev = samples[i - 1];
      const cur = samples[i];
      const span = prev.d - cur.d;
      const u = span === 0 ? 0 : (prev.d - d) / span;
      return prev.t + (cur.t - prev.t) * u;
    }
  }
  return null;
}

function sampleNearestDistance(samples: BikeSample[], d: number): BikeSample | null {
  let best: BikeSample | null = null;
  let bestDelta = Infinity;
  for (const s of samples) {
    const delta = Math.abs(s.d - d);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = s;
    }
  }
  return best;
}

function pressesOf(events: ControlEvent[], control: ControlId): ControlEvent[] {
  const wanted = HOLD_CONTROLS.includes(control) ? 'down' : 'press';
  // A rejected press never took effect, so it cannot satisfy an expected action either.
  return events.filter((e) => e.control === control && e.phase === wanted && !e.rejected);
}

/** Presses that were refused because a prerequisite had not been met. */
function scorePrerequisites(record: RunRecord, scenario: Scenario): ActionResult[] {
  return scenario.controlPrerequisites.flatMap((rule) => {
    const refused = record.events.filter(
      (e) => e.control === rule.control && e.rejected && e.phase !== 'up',
    );
    if (refused.length === 0) return [];
    return [
      {
        expectedId: `prerequisite-${rule.control}`,
        label: rule.label,
        group: 'richting' as const,
        status: 'ongewenst' as const,
        severity: rule.outcome.severity,
        explanation:
          refused.length === 1
            ? rule.outcome.explanation
            : `${rule.outcome.explanation} Je probeerde het ${refused.length} keer.`,
        windowT: null,
        windowD: null,
        actualT: refused[0].t,
        actualD: refused[0].d,
      },
    ];
  });
}

function outcomeOr(primary: Outcome | undefined, fallback: Outcome): Outcome {
  return primary ?? fallback;
}

function base(expected: ExpectedAction) {
  return { expectedId: expected.id, label: expected.label, group: expected.group };
}

// ---------------------------------------------------------------------------

function scoreExpected(
  expected: ExpectedAction,
  record: RunRecord,
  scenario: Scenario,
  events: ControlEvent[],
  samples: BikeSample[],
  /** Presses already credited to an earlier expectation; see `scoreRun`. */
  consumed: Set<ControlEvent>,
): ActionResult | null {
  // Hoisted so TypeScript keeps the narrowing inside the closures below.
  const kind = expected.kind;
  const ANCHORED = ['afterTurn', 'laneChange', 'beforeLaneChange'];
  if (!ANCHORED.includes(kind.type) && !expected.window) {
    throw new Error(`Verwachte handeling "${expected.id}" mist een venster.`);
  }
  const windowD: [number, number] | null = expected.window
    ? [expected.window.from, expected.window.to]
    : null;
  const windowT: [number, number] | null = expected.window
    ? [
        timeAtDistance(samples, expected.window.from) ?? 0,
        timeAtDistance(samples, expected.window.to) ?? record.durationS,
      ]
    : null;

  switch (kind.type) {
    case 'speedAtLeast': {
      // The mirror image of speedAtMost: you have to have *got up to* speed by the end of the
      // window, and the first sample that does it is what the timeline points at.
      const w = expected.window!;
      const reached = samples.find(
        (s) => s.d <= w.from && s.d >= w.to && s.speed * 3.6 >= kind.minKmh,
      );
      return {
        expectedId: expected.id,
        label: expected.label,
        group: expected.group,
        status: reached ? 'goed' : 'gemist',
        severity: reached ? null : expected.missed.severity,
        explanation: (reached ? expected.praise : expected.missed.explanation) ?? '',
        windowT,
        windowD,
        actualT: reached?.t ?? null,
        actualD: reached?.d ?? null,
      };
    }
    case 'headway':
      return scoreHeadway(expected, kind, record, scenario, samples, windowT, windowD);
    case 'laneChange': {
      const move = record.laneChanges.find((c) => c.direction === kind.direction);
      return outcomeRow(expected, move !== undefined, windowT, windowD, move?.completedAt ?? null);
    }
    case 'beforeLaneChange': {
      const move = record.laneChanges.find((c) => c.direction === kind.direction);
      // No manoeuvre means nothing to be late for. The missing manoeuvre is its own row, and
      // marking the rider twice for one omission reads as the debrief padding its case.
      if (!move) return null;
      const press = pressesOf(events, kind.control)
        .filter((e) => !consumed.has(e))
        .filter((e) => e.t <= move.startedAt && move.startedAt - e.t <= kind.withinSeconds)
        .pop();
      if (press) consumed.add(press);
      return outcomeRow(expected, press !== undefined, windowT, windowD, press?.t ?? null);
    }
    case 'speedBand':
      return scoreSpeedBand(expected, kind, samples, windowT, windowD);
    case 'control': {
      const presses = pressesOf(events, kind.control).filter((e) => !consumed.has(e));
      const w = expected.window!;
      const tol = expected.tolerance ?? 0;

      const inside = presses.find((p) => p.d <= w.from && p.d >= w.to);
      if (inside) {
        consumed.add(inside);
        return {
          ...base(expected),
          status: 'goed',
          severity: null,
          explanation: expected.praise ?? 'Op tijd uitgevoerd.',
          windowT,
          windowD,
          actualT: inside.t,
          actualD: inside.d,
        };
      }
      const early = presses.find((p) => p.d > w.from && p.d <= w.from + tol);
      if (early) {
        const o = outcomeOr(expected.early, expected.missed);
        return {
          ...base(expected),
          status: 'te vroeg',
          severity: o.severity,
          explanation: o.explanation,
          windowT,
          windowD,
          actualT: early.t,
          actualD: early.d,
        };
      }
      const late = presses.find((p) => p.d < w.to && p.d >= w.to - tol);
      if (late) {
        const o = outcomeOr(expected.late, expected.missed);
        return {
          ...base(expected),
          status: 'te laat',
          severity: o.severity,
          explanation: o.explanation,
          windowT,
          windowD,
          actualT: late.t,
          actualD: late.d,
        };
      }
      // A press far outside the tolerance counts as not having done it for this manoeuvre —
      // but say so, otherwise "gemist" next to a timestamp reads as a bug. Of several stray
      // presses, report the one that came closest to the window.
      const stray = presses.length
        ? presses.reduce((best, p) =>
            Math.abs(p.d - w.to) + Math.abs(p.d - w.from) <
            Math.abs(best.d - w.to) + Math.abs(best.d - w.from)
              ? p
              : best,
          )
        : null;
      const strayNote = stray
        ? ` Je drukte hier wel op, op ${stray.t.toFixed(1).replace('.', ',')}s en ` +
          `${Math.round(stray.d)} m vóór ${conflictPointName(scenario.world)}, maar dat valt ` +
          `buiten het venster voor ` +
          'deze handeling.'
        : '';
      return {
        ...base(expected),
        status: 'gemist',
        severity: expected.missed.severity,
        explanation: expected.missed.explanation + strayNote,
        windowT,
        windowD,
        actualT: stray?.t ?? null,
        actualD: stray?.d ?? null,
      };
    }

    case 'speedAtMost': {
      // The lowest speed the rider actually *held*, not the one they happened to be doing at a
      // single instant. Reading one sample was gameable in the obvious direction: keep 50 the
      // whole way, stab the brake at exactly the end of the window, and pass. Same hole the
      // headway rule closed, same fix, and deliberately the same helper.
      const max = kind.maxKmh;
      const w = expected.window!;
      const held = heldMinimum(
        samples
          .filter((s) => s.d <= w.from && s.d >= w.to)
          .map((s) => ({ t: s.t, value: s.speed * 3.6 })),
      );
      // A window too short to hold anything for half a second is an authoring choice, not a rule
      // that does not apply — so fall back to the reading at its end rather than dropping the row.
      const atEnd = sampleNearestDistance(samples, w.to);
      const speedKmh = held ?? (atEnd ? atEnd.speed * 3.6 : Infinity);
      const ok = speedKmh <= max + 0.5;
      const firstBelow = samples.find((s) => s.speed * 3.6 <= max) ?? null;
      return {
        ...base(expected),
        status: ok ? 'goed' : 'gemist',
        severity: ok ? null : expected.missed.severity,
        explanation: ok
          ? (expected.praise ?? 'Snelheid op tijd aangepast.')
          : `${expected.missed.explanation} Je reed daar ${Math.round(speedKmh)} km/u.`,
        windowT,
        windowD,
        actualT: firstBelow?.t ?? null,
        actualD: firstBelow?.d ?? null,
      };
    }

    case 'gearAtMost': {
      const maxGear = kind.maxGear;
      const atEnd = sampleNearestDistance(samples, expected.window!.to);
      const gear = atEnd ? atEnd.gear : 99;
      const ok = gear <= maxGear;
      const firstAtOrBelow = samples.find((s) => s.gear <= maxGear) ?? null;
      return {
        ...base(expected),
        status: ok ? 'goed' : 'gemist',
        severity: ok ? null : expected.missed.severity,
        explanation: ok
          ? (expected.praise ?? 'Tijdig teruggeschakeld.')
          : `${expected.missed.explanation} Je zat daar in versnelling ${gear}.`,
        windowT,
        windowD,
        actualT: firstAtOrBelow?.t ?? null,
        actualD: firstAtOrBelow?.d ?? null,
      };
    }

    case 'afterTurn': {
      // Only meaningful when the turn was actually made.
      if (record.manoeuvreCompletedAt === null) return null;
      const turnedAt = record.manoeuvreCompletedAt;
      const done = events.find(
        (e) =>
          e.control === kind.control &&
          e.phase === 'press' &&
          e.t >= turnedAt &&
          !consumed.has(e),
      );
      if (done) consumed.add(done);
      const limit = turnedAt + kind.withinSeconds;
      const wT: [number, number] = [turnedAt, limit];
      if (!done) {
        return {
          ...base(expected),
          status: 'gemist',
          severity: expected.missed.severity,
          explanation: expected.missed.explanation,
          windowT: wT,
          windowD: null,
          actualT: null,
          actualD: null,
        };
      }
      if (done.t <= limit) {
        return {
          ...base(expected),
          status: 'goed',
          severity: null,
          explanation: expected.praise ?? 'Op tijd uitgevoerd.',
          windowT: wT,
          windowD: null,
          actualT: done.t,
          actualD: done.d,
        };
      }
      const o = outcomeOr(expected.late, expected.missed);
      const seconds = (done.t - turnedAt).toFixed(1).replace('.', ',');
      return {
        ...base(expected),
        status: 'te laat',
        severity: o.severity,
        explanation: `${o.explanation} Het duurde ${seconds} seconde na de bocht.`,
        windowT: wT,
        windowD: null,
        actualT: done.t,
        actualD: done.d,
      };
    }
  }
}

/** Shifting without the koppeling: a technique habit, never a blocker. */
function scoreClutchTechnique(record: RunRecord): ActionResult | null {
  let clutchDown = false;
  let sloppy = 0;
  let firstT: number | null = null;
  let firstD: number | null = null;
  for (const e of record.events) {
    if (e.control === 'CLUTCH') clutchDown = e.phase !== 'up';
    if ((e.control === 'GEAR_UP' || e.control === 'GEAR_DOWN') && !clutchDown) {
      sloppy++;
      if (firstT === null) {
        firstT = e.t;
        firstD = e.d;
      }
    }
  }
  if (sloppy === 0) return null;
  return {
    expectedId: 'koppeling-techniek',
    label: 'Schakelen zonder koppeling',
    group: 'aandrijving',
    status: 'ongewenst',
    severity: 'opmerking',
    explanation:
      `Je schakelde ${sloppy} keer zonder de koppeling in te knijpen. De motor schakelt hier ` +
      'toch, maar op straat kost dat je bak en je stabiliteit in de bocht.',
    windowT: null,
    windowD: null,
    actualT: firstT,
    actualD: firstD,
  };
}

/**
 * The sequence is the logic: the side you are leaving, the side you are going to, the dode hoek,
 * and only then the announcement. Doing every step but in the wrong order still gets said.
 */
function scoreSequence(
  scenario: Scenario,
  results: ActionResult[],
): ActionResult | null {
  const rule = scenario.sequence;
  const done = rule.ids
    .map((id) => results.find((r) => r.expectedId === id))
    .filter(
      (r): r is ActionResult =>
        r !== undefined && r.actualT !== null && r.status !== 'gemist',
    );

  for (let i = 0; i < done.length - 1; i++) {
    for (let j = i + 1; j < done.length; j++) {
      if (done[j].actualT! >= done[i].actualT!) continue;
      return {
        expectedId: 'volgorde',
        label: rule.label,
        group: 'kijken',
        status: 'ongewenst',
        severity: rule.outcome.severity,
        explanation:
          `${rule.outcome.explanation} Bij jou kwam "${done[j].label}" vóór "${done[i].label}".`,
        windowT: null,
        windowD: null,
        actualT: done[j].actualT,
        actualD: done[j].actualD,
      };
    }
  }
  return null;
}

interface LookAudit {
  total: number;
  offending: Set<ControlEvent>;
}

/**
 * Kijkgedrag as a habit rather than a tic: see `LookDiscipline`.
 *
 * The offending presses are returned as well as counted, because they do not merely cost a mark
 * — they stop counting as looking at all. Without that, a student could hold down every look
 * control and hit every window by accident, and the exercise would reward the one habit it is
 * meant to break.
 */
function auditLooks(events: ControlEvent[], scenario: Scenario): LookAudit {
  const rules = scenario.lookDiscipline;
  const looks = events.filter((e) => e.phase === 'press' && isLookControl(e.control));

  const lastOfControl = new Map<ControlId, number>();
  const recent: number[] = [];
  const offending = new Set<ControlEvent>();

  for (const look of looks) {
    let bad = false;

    const previous = lastOfControl.get(look.control);
    if (previous !== undefined && look.t - previous < rules.minRepeatSeconds) bad = true;
    lastOfControl.set(look.control, look.t);

    while (recent.length > 0 && look.t - recent[0] > rules.burstSeconds) recent.shift();
    recent.push(look.t);
    if (recent.length > rules.maxInBurst) bad = true;

    if (bad) offending.add(look);
  }

  return { total: looks.length, offending };
}

function reportLookDiscipline(audit: LookAudit, scenario: Scenario): ActionResult | null {
  const rules = scenario.lookDiscipline;
  const violations = audit.offending.size;
  if (violations < rules.warnAt) return null;

  const outcome = violations >= rules.faultAt ? rules.fault : rules.warning;
  const first = [...audit.offending][0];
  return {
    expectedId: 'kijkgedrag',
    label: 'Kijkgedrag — te vaak of te snel achter elkaar',
    group: 'kijken',
    status: 'ongewenst',
    severity: outcome.severity,
    explanation:
      `${outcome.explanation} Je deed ${audit.total} kijkacties, waarvan ${violations} te snel ` +
      'op een vorige volgden. Die tellen niet mee als kijken.',
    windowT: null,
    windowD: null,
    actualT: first?.t ?? null,
    actualD: first?.d ?? null,
  };
}

/**
 * Seconds of clear road between two vehicles, from whoever is behind.
 *
 * Bumper to bumper, not centre to centre. The old gap measure assumed a snorfiets at both ends;
 * a trekker-oplegger is seven metres longer than that, which is about a third of a second at
 * motorway speed — enough on its own to move a verdict a whole band.
 */
/**
 * How far off the rider's own line another vehicle has to be before its distance stops being a
 * following distance. Half a lane: closer than that you are behind it, further and you are beside
 * it on a different piece of road.
 */
const SAME_LANE_M = 2;

function headwaySeconds(
  bike: BikeSample,
  actor: ActorSample,
  actorLength: number,
): { seconds: number; side: 'ahead' | 'behind' } | null {
  // Alongside is not behind.
  //
  // Overtaking means spending several seconds level with a lorry, where the distance measured
  // along the heading is nearly nothing. Without this, the rule marks every successful overtake as
  // tailgating — and the better the overtake, the closer the "gap" it reports.
  const lateral =
    -(actor.x - bike.x) * Math.sin(bike.heading) + (actor.y - bike.y) * Math.cos(bike.heading);
  if (Math.abs(lateral) > SAME_LANE_M) return null;
  const along = (actor.y - bike.y) * Math.sin(bike.heading) + (actor.x - bike.x) * Math.cos(bike.heading);
  const riderAhead = along < 0;
  const clear = Math.abs(along) - actorLength / 2 - BIKE_LENGTH / 2;
  // Whoever is behind is the one who needs the room, so it is their speed that turns metres
  // into seconds.
  const follower = riderAhead ? actor.speed : bike.speed;
  return {
    seconds: clear <= 0 ? 0 : clear / Math.max(follower, 0.1),
    side: riderAhead ? 'ahead' : 'behind',
  };
}

const BIKE_LENGTH = 2.3;

/** Seconds a headway has to persist before it counts as a distance the rider was holding. */
const HELD_FOR_S = 0.5;

/**
 * The lowest value the rider actually *held*, as opposed to touched.
 *
 * A single sample proves nothing — at 20 Hz and 100 km/h one sample is 1.4 m — so this takes the
 * best value inside each half-second and then the worst of those. A momentary dip is forgiven; a
 * dip you sat in is not. Sampling one instant instead (say, the moment the lane change finished)
 * would have been gameable in the obvious direction: drop in three seconds clear, bank the
 * credit, then close right up and never be measured again.
 *
 * Written for headway and now used for speed as well, which is why the series carries a bare
 * `value`. The two rules are the same shape of question — *what did you sustain?* — and the
 * gameable ride they refuse is the same ride.
 */
function heldMinimum(series: { t: number; value: number }[]): number | null {
  if (series.length === 0) return null;
  let worst = Infinity;
  for (let i = 0; i < series.length; i++) {
    let best = -Infinity;
    let j = i;
    for (; j < series.length && series[j].t - series[i].t <= HELD_FOR_S; j++) {
      best = Math.max(best, series[j].value);
    }
    // Only score full half-seconds, or the tail of the run scores itself on one sample.
    if (j >= series.length && series[series.length - 1].t - series[i].t < HELD_FOR_S) break;
    worst = Math.min(worst, best);
  }
  return Number.isFinite(worst) ? worst : null;
}

function scoreHeadway(
  expected: ExpectedAction,
  kind: Extract<ExpectedKind, { type: 'headway' }>,
  record: RunRecord,
  scenario: Scenario,
  samples: BikeSample[],
  windowT: [number, number] | null,
  windowD: [number, number] | null,
): ActionResult | null {
  const w = expected.window!;
  const track = record.actorTracks[kind.actorId] ?? [];
  const actorLength = scenario.actors.find((a) => a.id === kind.actorId)?.length ?? 1.8;
  const byT = new Map(track.map((a) => [Math.round(a.t * 20), a]));

  // Every sample in the window, from the first one.
  //
  // This used to start at `manoeuvreCompletedAt` — measure only once the rider is in the lane,
  // because before that "the gap is not a following distance, it is just two vehicles on different
  // bits of road". The intent was right and the mechanism was redundant: `headwaySeconds` already
  // returns null for anything more than half a lane off your line, which is what being on the
  // oprit *is*. The two gates were saying the same thing, and the temporal one said it too broadly.
  //
  // What it cost was the approach. On an open motorway there is no manoeuvre to wait for and the
  // rider is behind the lorry from the first frame, so sitting on its bumper while waiting for a
  // gap — a real fault, and one the exam looks for — was never measured at all. Dropping the gate
  // leaves the merge scenario's rows identical, which is the proof it was doing nothing there.
  const series: { t: number; value: number }[] = [];
  let side: 'ahead' | 'behind' = 'behind';
  for (const s of samples) {
    if (s.d > w.from || s.d < w.to) continue;
    const actor = byT.get(Math.round(s.t * 20));
    if (!actor) continue;
    const h = headwaySeconds(s, actor, actorLength);
    if (!h) continue;
    side = h.side;
    series.push({ t: s.t, value: h.seconds });
  }

  const held = heldMinimum(series);
  // Nothing to measure is not a fault, it is not applicable — the rider never spent time in the
  // same lane as this vehicle. Whatever went wrong instead (no merge, no return to the right) has
  // a row of its own, and marking the same omission twice reads as the debrief padding its case.
  // Still reachable without the temporal gate: a rider who never leaves the oprit is never within
  // half a lane of the carriageway, so the series stays empty on the lateral test alone.
  if (held === null) return null;

  // Bands are ordered generous-first in the scenario data; the first one that fits, wins.
  const band = kind.bands.find(
    (b: HeadwayBand) => held >= b.atLeastSeconds && (b.side === undefined || b.side === side),
  );
  const outcome = band?.outcome;
  const praise = outcome && 'praise' in outcome ? outcome.praise : null;
  const fault: Outcome | null = outcome && !('praise' in outcome) ? outcome : null;
  const rounded = held.toFixed(1).replace('.', ',');
  const where = side === 'ahead' ? 'vóór' : 'achter';
  return {
    expectedId: expected.id,
    label: expected.label,
    group: expected.group,
    status: praise ? 'goed' : 'ongewenst',
    severity: praise ? null : (fault?.severity ?? expected.missed.severity),
    explanation:
      (praise ?? fault?.explanation ?? expected.missed.explanation) +
      ` Je kortste volgafstand ${where} de vrachtwagen was ${rounded} seconde.`,
    windowT,
    windowD,
    actualT: series[0]?.t ?? null,
    actualD: null,
  };
}

/** The plain good/missed row, for rules whose only question is whether it happened. */
function outcomeRow(
  expected: ExpectedAction,
  ok: boolean,
  windowT: [number, number] | null,
  windowD: [number, number] | null,
  actualT: number | null,
): ActionResult {
  return {
    expectedId: expected.id,
    label: expected.label,
    group: expected.group,
    status: ok ? 'goed' : 'gemist',
    severity: ok ? null : expected.missed.severity,
    explanation: (ok ? expected.praise : expected.missed.explanation) ?? '',
    windowT,
    windowD,
    actualT,
    actualD: null,
  };
}

/**
 * The speed actually held, judged against ordered bands.
 *
 * Held, not touched: the same `heldMinimum` idea as following distance, but two-sided, because a
 * speed has a floor and a ceiling and drifting through one for a fraction of a second is not
 * riding at it. Reported as the worst band the rider spent real time in.
 */
function scoreSpeedBand(
  expected: ExpectedAction,
  kind: Extract<ExpectedKind, { type: 'speedBand' }>,
  samples: BikeSample[],
  windowT: [number, number] | null,
  windowD: [number, number] | null,
): ActionResult | null {
  const w = expected.window!;
  const inWindow = samples.filter((s) => s.d <= w.from && s.d >= w.to);
  if (inWindow.length === 0) return null;

  const bandOf = (kmh: number) => kind.bands.findIndex((b) => kmh >= b.fromKmh && kmh <= b.toKmh);
  // Anything outside every band is worse than the worst band there is.
  const rank = (kmh: number) => {
    const i = bandOf(kmh);
    return i < 0 ? kind.bands.length : i;
  };

  // Sustained, so one sample dipping through a boundary cannot decide a verdict.
  let worst = 0;
  let worstAt: BikeSample | null = null;
  for (let i = 0; i < inWindow.length; i++) {
    let best = kind.bands.length;
    let j = i;
    for (; j < inWindow.length && inWindow[j].t - inWindow[i].t <= HELD_FOR_S; j++) {
      best = Math.min(best, rank(inWindow[j].speed * 3.6));
    }
    if (j >= inWindow.length && inWindow[inWindow.length - 1].t - inWindow[i].t < HELD_FOR_S) break;
    if (best > worst) {
      worst = best;
      worstAt = inWindow[i];
    }
  }

  const band = kind.bands[worst];
  const outcome = band?.outcome;
  const praise = outcome && 'praise' in outcome ? outcome.praise : null;
  const fault: Outcome | null = outcome && !('praise' in outcome) ? outcome : null;
  const held = worstAt ? Math.round(worstAt.speed * 3.6) : Math.round((inWindow[0]?.speed ?? 0) * 3.6);
  return {
    expectedId: expected.id,
    label: expected.label,
    group: expected.group,
    status: praise ? 'goed' : 'ongewenst',
    severity: praise ? null : (fault?.severity ?? expected.missed.severity),
    explanation:
      (praise ?? fault?.explanation ?? expected.missed.explanation) +
      (praise ? '' : ` Je reed daar ${held} km/u.`),
    windowT,
    windowD,
    actualT: worstAt?.t ?? null,
    actualD: worstAt?.d ?? null,
  };
}

function scoreIncidents(
  record: RunRecord,
  scenario: Scenario,
  credited: ControlEvent[],
): ActionResult[] {
  return record.incidents.map((incident) => {
    const reason = scenario.actors.find((a) => a.id === incident.actorId)?.priorityReason;
    // A schouderblik is credited for turning round; how far you turned decides what you saw.
    // Being told "you never saw it" right after being marked correct for looking would read as a
    // contradiction, so say which of the two happened.
    const lookedButMissed =
      !incident.wasPerceived &&
      credited.some(
        (e) => e.control === 'SHOULDER_RIGHT' && e.phase === 'press' && e.t <= incident.t,
      );
    return {
      expectedId: `incident-${incident.actorId}`,
      label: `${incident.actorLabel} moest remmen`,
      group: 'kijken' as const,
      status: 'ongewenst' as const,
      severity: 'kritiek' as Severity,
      explanation:
        (reason ? `${reason} ` : '') +
        'Er is geen aanrijding gebeurd omdat de ander vol remde — dat is precies wat ' +
        '"gevaarzetting" betekent: de situatie werd voor jou opgelost. ' +
        (incident.wasPerceived
          ? 'Je had hem gezien en bent toch doorgereden.'
          : lookedButMissed
            ? 'Je hebt wél over je schouder gekeken, maar niet naar de plek waar hij reed — te ' +
              'ver door is net zo blind als niet ver genoeg. De blik telt; het zien is waar je ' +
              'iets aan hebt.'
            : 'Je had hem op dat moment nog niet eens gezien.'),
      windowT: null,
      windowD: null,
      actualT: incident.t,
      actualD: null,
    };
  });
}

// ---------------------------------------------------------------------------

export interface ScoredRun {
  results: ActionResult[];
  faults: ActionResult[];
  counts: { opmerking: number; fout: number; kritiek: number };
  verdict: Verdict;
}

export function scoreRun(record: RunRecord, scenario: Scenario): ScoredRun {
  const samples = record.samples;
  const results: ActionResult[] = [];

  // A look that breaks the discipline rules is discarded before anything is credited.
  const audit = auditLooks(record.events, scenario);
  const credited = record.events.filter((e) => !audit.offending.has(e));

  // Expectations are walked in scenario order and each claims its press, so two steps that share
  // a control — the two schouderblikken rechts — can never be satisfied by the same look, and a
  // missed step cannot report an earlier step's press as a stray.
  const consumed = new Set<ControlEvent>();
  for (const expected of scenario.expected) {
    if (expected.onlyWhenManualSteering && record.autoSteer) continue;
    const result = scoreExpected(expected, record, scenario, credited, samples, consumed);
    if (result) results.push(result);
  }

  for (const rule of scenario.unwanted) {
    const hits = pressesOf(credited, rule.control);
    if (hits.length === 0) continue;
    results.push({
      expectedId: rule.id,
      label: rule.label,
      group: rule.group,
      status: 'ongewenst',
      severity: rule.outcome.severity,
      explanation: rule.outcome.explanation,
      windowT: null,
      windowD: null,
      actualT: hits[0].t,
      actualD: hits[0].d,
    });
  }

  // Order is judged on the expected actions, so it has to run after they are all scored.
  const sequence = scoreSequence(scenario, results);
  if (sequence) results.push(sequence);

  const discipline = reportLookDiscipline(audit, scenario);
  if (discipline) results.push(discipline);

  const clutch = scoreClutchTechnique(record);
  if (clutch) results.push(clutch);
  results.push(...scorePrerequisites(record, scenario));
  results.push(...scoreIncidents(record, scenario, credited));

  // Deliberately NOT sorted by time. The rows are the prescribed reeks, and the whole point of
  // the timeline is to read down it in that order; sorting by when things actually happened
  // reshuffles the numbered steps exactly on the runs where the order went wrong. A step done
  // out of order should show up as a marker out of line, not as a row that moved.

  const faults = results.filter((r) => r.severity !== null);
  const counts = {
    opmerking: faults.filter((f) => f.severity === 'opmerking').length,
    fout: faults.filter((f) => f.severity === 'fout').length,
    kritiek: faults.filter((f) => f.severity === 'kritiek').length,
  };
  const verdict: Verdict =
    counts.kritiek > 0 || counts.fout >= scenario.verdictRule.faultLimit ? 'gezakt' : 'geslaagd';

  return { results, faults, counts, verdict };
}
