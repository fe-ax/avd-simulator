/**
 * Scoring. A pure function from `RunRecord` + `Scenario` to results, so it can be unit-tested
 * without a browser and re-run over a saved run without replaying it.
 *
 * The one idea that matters here: expected actions are authored in **metres before the conflict
 * point**, and converted to *this run's* seconds using its own recorded s(t). A student who
 * rides carefully arrives later and must not be marked down for it.
 */
import { isLookControl } from './perception';
import type {
  ActionResult,
  BikeSample,
  ControlEvent,
  ControlId,
  ExpectedAction,
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
  events: ControlEvent[],
  samples: BikeSample[],
  /** Presses already credited to an earlier expectation; see `scoreRun`. */
  consumed: Set<ControlEvent>,
): ActionResult | null {
  // Hoisted so TypeScript keeps the narrowing inside the closures below.
  const kind = expected.kind;
  if (kind.type !== 'afterTurn' && !expected.window) {
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
      // Needs the lane-change mechanic to know when the rider is in the target lane at all.
      throw new Error(
        `Verwachte handeling "${expected.id}": de volgafstandsregel is nog niet aangesloten.`,
      );
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
          `${Math.round(stray.d)} m vóór het fietspad, maar dat valt buiten het venster voor ` +
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
      const max = kind.maxKmh;
      const atEnd = sampleNearestDistance(samples, expected.window!.to);
      const speedKmh = atEnd ? atEnd.speed * 3.6 : Infinity;
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
      if (record.turnCompletedAt === null) return null;
      const turnedAt = record.turnCompletedAt;
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
    const result = scoreExpected(expected, record, credited, samples, consumed);
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
