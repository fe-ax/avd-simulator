/**
 * What a model rider makes of a scenario.
 *
 * This is the check the second scenario needed and did not have. Its first design put the truck
 * ahead of the rider, which quietly inverts the whole exercise — at 100 km/h behind an 80 km/h
 * truck you close continuously, so "get up to speed" and "keep two seconds" cannot both hold, and
 * the rider who never touches the throttle scores best of all. Finding that took a standalone
 * kinematics spike and a table of numbers in a terminal. It is one function call.
 *
 * **A scenario that a model rider fails is a broken scenario.** Not always — a deliberately
 * impossible exercise is a thing someone might want — but it is never what you meant by accident,
 * and it should be said out loud while you are still dragging the thing that caused it.
 *
 * Everything here runs the real engine, perception and scoring. A full twenty-second ride costs a
 * few milliseconds, which is well inside the budget for re-running on every edit.
 */
import { buildRoutes } from './route';
import {
  driveMerge,
  driveOvertake,
  driveRun,
  type MergePlan,
  type OvertakePlan,
  type RidePlan,
} from './testDriver';
import type { ActorSpec, RunRecord, Scenario } from './types';

export interface ReferenceRide {
  record: RunRecord;
  /** Null when the scenario could not be ridden at all; `error` says why. */
  error: string | null;
}

/**
 * How a model rider handles this particular motorway.
 *
 * Derived from the scenario rather than fixed, because the builder edits exactly the numbers a
 * fixed plan would assume: shorten the invoegstrook with a hardcoded "first throttle press at 148
 * metres" and the model rider simply never presses it, and the panel blames the scenario for the
 * harness's mistake.
 */
function mergePlanFor(scenario: Scenario): MergePlan {
  const routes = buildRoutes(scenario);
  const entry =
    scenario.world.kind === 'motorway' && scenario.world.stretch.kind === 'oprit'
      ? scenario.world.stretch
      : null;
  const strook = entry ? entry.mergeEndY - entry.ramp.strookStartY : 100;
  const needed = Math.max(
    0,
    Math.ceil((scenario.speedLimitKmh - scenario.startSpeedKmh) / scenario.throttleStepKmh),
  );
  return {
    throttlePresses: needed,
    // Start on the first frame: the whole point is to arrive matched to the traffic.
    throttleFromD: routes.conflictS,
    throttleEveryM: Math.max(4, strook / Math.max(needed, 1) / 4),
    // Two fifths of the way down the strook — room used, room still in hand.
    mergeAtD: strook * 0.4,
  };
}

/** Ride it the way it is meant to be ridden. */
export function referenceRide(
  scenario: Scenario,
  override: RidePlan & MergePlan & OvertakePlan = {},
): ReferenceRide {
  try {
    // Which model rider fits is a question about the road, not about the scenario's name: an open
    // stretch has nothing to merge onto, so the only manoeuvre available is an overtake.
    const record =
      scenario.world.kind !== 'motorway'
        ? driveRun(scenario, override)
        : scenario.world.stretch.kind === 'doorgaand'
          ? driveOvertake(scenario, { ...override, cruiseKmh: override.cruiseKmh ?? scenario.startSpeedKmh })
          : driveMerge(scenario, { ...mergePlanFor(scenario), ...override });
    return { record, error: null };
  } catch (e) {
    return { record: null as unknown as RunRecord, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface Reveal {
  actorId: string;
  label: string;
  /** Seconds at which this actor was first seen, or null if never. */
  full: number | null;
  noMirrors: number | null;
  noLooks: number | null;
}

/**
 * When each road user first becomes visible, under three ways of riding.
 *
 * The difference between the columns is the lesson: if a hazard is spotted at the same moment
 * whether or not the rider checked their mirrors, the mirrors are not teaching anything and the
 * traffic is in the wrong place. This is the measurement that showed the schouderblik cannot
 * reach the truck on the A12 — which is a fact about that geometry, and one worth knowing before
 * writing a briefing that claims otherwise.
 */
export function revealTimeline(scenario: Scenario): Reveal[] {
  const plans: Array<[keyof Omit<Reveal, 'actorId' | 'label'>, RidePlan & MergePlan & OvertakePlan]> = [
    ['full', {}],
    ['noMirrors', { mirrors: false, mirror: false }],
    ['noLooks', { mirrors: false, mirror: false, eyes: false, shoulder: false, shoulderPrep: false }],
  ];

  const rows = new Map<string, Reveal>(
    scenario.actors.map((a) => [a.id, { actorId: a.id, label: a.label, full: null, noMirrors: null, noLooks: null }]),
  );

  for (const [column, plan] of plans) {
    const { record, error } = referenceRide(scenario, plan);
    if (error) continue;
    for (const [id, track] of Object.entries(record.actorTracks)) {
      const row = rows.get(id);
      if (!row) continue;
      row[column] = track.find((a) => a.perceived)?.t ?? null;
    }
  }
  return [...rows.values()];
}

/**
 * Road users the scenario never actually judges anything about.
 *
 * "A model rider passes" is a true answer to the wrong question when the exercise no longer tests
 * what you think it does. Moving a hazard somewhere it plays no part still leaves the inherited
 * reeks passing, and the panel goes green on a scenario that measures nothing — which is the worst
 * thing a validator can do, because being trusted is the whole job.
 *
 * An actor counts as involved if some rule names it, or if it ever has to react to the rider. The
 * second half needs a deliberately bad ride to find out: a hazard nobody can provoke is scenery.
 */
export function unscoredActors(scenario: Scenario, record: RunRecord): ActorSpec[] {
  const involved = new Set<string>();

  for (const expected of scenario.expected) {
    if (expected.kind.type === 'headway') involved.add(expected.kind.actorId);
  }
  for (const incident of record.incidents) involved.add(incident.actorId);

  // Ride it badly on purpose, more than one way. Anything that brakes for a bad rider is part of
  // the exercise even when a clean ride never disturbs it.
  //
  // Two rides, because one is self-defeating: a rider who checks nothing has their lane change
  // refused by the prerequisite, so they never pull out and never provoke the traffic they were
  // supposed to provoke. The second looks properly and then goes anyway.
  const badRides: Array<RidePlan & MergePlan & OvertakePlan> = [
    { mirrors: false, mirror: false, eyes: false, shoulder: false, shoulderPrep: false, yieldToActor: false },
    { ignoreTraffic: true, yieldToActor: false },
  ];
  for (const plan of badRides) {
    const bad = referenceRide(scenario, plan);
    if (bad.error) continue;
    for (const incident of bad.record.incidents) involved.add(incident.actorId);
  }

  return scenario.actors.filter((a) => !involved.has(a.id));
}
