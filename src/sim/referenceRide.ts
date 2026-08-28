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
import { findHiddenReveals, type HiddenReveal } from './validate';
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

/**
 * How a model rider handles a junction.
 *
 * The crossroads driver was written for the Kerkstraat, where the manoeuvre is a right turn across
 * a fietspad — so it changes down, slows to a walking pace and gives way as a matter of course. On
 * a junction you have priority at and are riding straight through, all of that is wrong: slowing to
 * fifteen and staying there is not carefulness, it is dawdling, and a rule that says "get going
 * again afterwards" would mark the model rider for it.
 */
function crossingPlanFor(scenario: Scenario): RidePlan {
  if (scenario.world.kind !== 'junction') return {};
  const turning = scenario.world.manoeuvre !== 'straight';
  return {
    slowDown: turning,
    gear: turning,
    // Yielding is for a road user who has priority over you. Whether one does is what the
    // haaientanden say.
    yieldToActor: scenario.world.giveWay !== 'side',
    // Read the traffic even when it is the one that should be stopping. Having priority is not
    // the same as being given it, and that gap is what a hazard exercise is about.
    anticipate: true,
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
        ? driveRun(scenario, { ...crossingPlanFor(scenario), ...override })
        : scenario.world.stretch.kind === 'doorgaand'
          ? driveOvertake(scenario, { ...override, cruiseKmh: override.cruiseKmh ?? scenario.startSpeedKmh })
          : driveMerge(scenario, { ...mergePlanFor(scenario), ...override });
    return { record, error: null };
  } catch (e) {
    return { record: null as unknown as RunRecord, error: e instanceof Error ? e.message : String(e) };
  }
}

/** No mirrors, on any road: the two worlds spell the flag differently. */
const REVEAL_NO_MIRRORS: RidePlan & MergePlan & OvertakePlan = { mirrors: false, mirror: false };

const REVEAL_NO_LOOKS: RidePlan & MergePlan & OvertakePlan = {
  mirrors: false,
  mirror: false,
  eyes: false,
  shoulder: false,
  shoulderPrep: false,
};

/**
 * Rides bad enough to make the traffic react, for finding out whether a road user is scenery.
 *
 * Two of them, because one is self-defeating: a rider who checks nothing has their lane change
 * refused by the prerequisite, so they never pull out and never provoke the traffic they were
 * supposed to provoke. The second looks properly and then goes anyway.
 */
const PROVOKING_RIDES: Array<RidePlan & MergePlan & OvertakePlan> = [
  { ...REVEAL_NO_LOOKS, yieldToActor: false },
  { ignoreTraffic: true, yieldToActor: false },
];

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
  return revealsFrom(scenario, (plan) => referenceRide(scenario, plan));
}

/** The three reveal columns, given some way of getting a ride for a plan. */
function revealsFrom(
  scenario: Scenario,
  ride: (plan: RidePlan & MergePlan & OvertakePlan) => ReferenceRide,
): Reveal[] {
  const plans: Array<[keyof Omit<Reveal, 'actorId' | 'label'>, RidePlan & MergePlan & OvertakePlan]> = [
    ['full', {}],
    ['noMirrors', REVEAL_NO_MIRRORS],
    ['noLooks', REVEAL_NO_LOOKS],
  ];

  const rows = new Map<string, Reveal>(
    scenario.actors.map((a) => [a.id, { actorId: a.id, label: a.label, full: null, noMirrors: null, noLooks: null }]),
  );

  for (const [column, plan] of plans) {
    const { record, error } = ride(plan);
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
export function unscoredActors(
  scenario: Scenario,
  record: RunRecord,
  ride: (plan: RidePlan & MergePlan & OvertakePlan) => ReferenceRide = (plan) =>
    referenceRide(scenario, plan),
): ActorSpec[] {
  const involved = new Set<string>();

  for (const expected of scenario.expected) {
    if (expected.kind.type === 'headway') involved.add(expected.kind.actorId);
  }
  for (const incident of record.incidents) involved.add(incident.actorId);

  // A road user with cues of its own is deliberate by definition. Strictly it may still be
  // unmeasured — the rules in a hazard exercise judge the *rider's* speed, not the car's — but
  // somebody sat down and told this one to stand on its brakes at a particular spot, and calling
  // that decor would be the check crying wolf at exactly the scenario it exists to help build.
  for (const actor of scenario.actors) {
    if (actor.cues?.length) involved.add(actor.id);
  }

  // Ride it badly on purpose, more than one way. Anything that brakes for a bad rider is part of
  // the exercise even when a clean ride never disturbs it.
  for (const plan of PROVOKING_RIDES) {
    const bad = ride(plan);
    if (bad.error) continue;
    for (const incident of bad.record.incidents) involved.add(incident.actorId);
  }

  return scenario.actors.filter((a) => !involved.has(a.id));
}

/**
 * A rider who gets one thing wrong on purpose.
 *
 * Named in Dutch because the name appears in the panel an instructor reads, and one mistake at a
 * time on purpose: a rider who is careless in every dimension at once fails nearly everything, and
 * a report where every rule is missed says no more than one where none is.
 */
interface SloppyRider {
  label: string;
  plan: RidePlan & MergePlan & OvertakePlan;
}

/**
 * The ways there are to ride this particular road badly.
 *
 * Every one of these is flags the headless driver already has. That is the point: if a world needs
 * a mistake the driver cannot make, the honest answer is that this check has a blind spot there,
 * not that the rule is fine.
 */
function sloppyRiders(scenario: Scenario): SloppyRider[] {
  if (scenario.world.kind === 'motorway') {
    // The mirror and the schouderblik are deliberately *separate* riders. Turned off together the
    // richtingaanwijzer prerequisite refuses the manoeuvre, so the rider never changes lane at all
    // and every rule about how they did it produces no row — the two mistakes mask each other, and
    // the reeks reads as un-missable when it is nothing of the kind. One mistake at a time.
    return scenario.world.stretch.kind === 'doorgaand'
      ? [
          { label: 'wie niet inhaalt', plan: { neverOvertake: true } },
          { label: 'wie ertussen duikt', plan: { cutInEarly: true } },
          { label: 'wie links blijft hangen', plan: { stayLeft: true } },
          { label: 'wie niet in de spiegel kijkt', plan: { mirror: false } },
          { label: 'wie geen schouderblik doet', plan: { shoulder: false } },
          { label: 'wie niet aangeeft', plan: { indicator: false } },
          { label: 'wie te langzaam aankomt', plan: { cruiseKmh: 80 } },
          { label: 'wie te dicht op zijn voorganger zit', plan: { tailgate: true } },
          { label: 'wie te vroeg kijkt en dan wacht', plan: { lookEarly: true } },
        ]
      : [
          { label: 'wie niet in de spiegel kijkt', plan: { mirror: false } },
          { label: 'wie geen schouderblik doet', plan: { shoulder: false } },
          { label: 'wie niet op snelheid komt', plan: { throttlePresses: 0 } },
          { label: 'wie erop gaat plakken', plan: { chaseAfterMerge: true } },
          { label: 'wie niet aangeeft', plan: { indicator: false } },
          { label: 'wie de richtingaanwijzer laat staan', plan: { cancelIndicator: false } },
          { label: 'wie te dicht op zijn voorganger zit', plan: { tailgate: true } },
        ];
  }
  return [
    { label: 'wie niet anticipeert', plan: { anticipate: false } },
    { label: 'wie niet kijkt', plan: REVEAL_NO_LOOKS },
    { label: 'wie niet afremt', plan: { slowDown: false, gear: false } },
    { label: 'wie geen voorrang geeft', plan: { yieldToActor: false } },
    // Rides straight on past the turn. Nothing on a scenario whose opdracht *is* straight on —
    // which is right: there the manoeuvre is not a thing you can get wrong.
    { label: 'wie de bocht mist', plan: { steer: false } },
    { label: 'wie de richtingaanwijzer laat staan', plan: { indicatorOff: 'nooit' } },
    { label: 'wie blijft treuzelen', plan: { pullAway: false } },
  ];
}

export interface RuleDiscrimination {
  expectedId: string;
  label: string;
  modelPasses: boolean;
  /** Names of the sloppy riders that missed this rule. */
  failedBy: string[];
  /**
   * Riders this rule actually produced a row for.
   *
   * Not the same question as `failedBy`, and conflating them cost an afternoon. A rule nobody
   * *failed* is soft — the window is wide or the threshold is kind. A rule nobody was *measured
   * against* is one whose mistake takes the rider outside its scope entirely: skip the schouderblik
   * on the overtake and the prerequisite refuses the manoeuvre, so there is no lane change, and
   * every rule about how you changed lane returns no row rather than a miss. The first wants
   * sharpening; the second cannot be judged from here at all, and saying so is the honest answer.
   */
  testedBy: string[];
}

/**
 * Which rules would actually catch somebody — mutation testing, pointed at an exercise.
 *
 * The model rider answers "is this possible?" and stops there. It cannot answer the question that
 * matters, which is whether the reeks is *about* anything: a rule with a window wide enough or a
 * threshold soft enough that no rider can miss it goes green exactly like a rule that teaches the
 * lesson, and the panel cannot tell you which one you built.
 *
 * So ride it wrong, one mistake at a time, and ask of each rule which of those mistakes it caught.
 * A rule nothing catches is a rule to sharpen or to delete.
 */
function discriminationOf(
  scenario: Scenario,
  model: ReferenceRide,
  ride: (plan: RidePlan & MergePlan & OvertakePlan) => ReferenceRide,
): RuleDiscrimination[] {
  const missedBy = new Map<string, string[]>(scenario.expected.map((e) => [e.id, []]));
  const testedBy = new Map<string, string[]>(scenario.expected.map((e) => [e.id, []]));
  let anyRode = false;

  for (const rider of sloppyRiders(scenario)) {
    const { record, error } = ride(rider.plan);
    if (error) continue;
    anyRode = true;
    for (const result of record.results) {
      testedBy.get(result.expectedId)?.push(rider.label);
      // Anything that is not 'goed' is a rider who did not satisfy the rule — missed it, was late,
      // was early. All of those are the rule doing its job.
      if (result.status === 'goed') continue;
      missedBy.get(result.expectedId)?.push(rider.label);
    }
  }

  // With nothing to compare against, saying "no sloppy rider fails this" would be an accusation
  // made out of an absence. Report nothing instead.
  if (!anyRode) return [];

  return scenario.expected.map((e) => ({
    expectedId: e.id,
    label: e.label,
    modelPasses: model.error === null && model.record.results.find((r) => r.expectedId === e.id)?.status === 'goed',
    failedBy: missedBy.get(e.id) ?? [],
    testedBy: testedBy.get(e.id) ?? [],
  }));
}

/**
 * Where the model and the screen disagree about what was visible.
 *
 * The extent is taken from the ride rather than from a frame, for the same reason the road check
 * is: ask about the picture and a long ride reports its own tail as missing.
 */
function hiddenOf(scenario: Scenario, record: RunRecord): HiddenReveal[] {
  const path = record.samples;
  if (path.length === 0) return [];
  const margin = 80;
  const xs = path.map((p) => p.x);
  const ys = path.map((p) => p.y);
  const actorXs = Object.values(record.actorTracks).flatMap((t) => t.map((a) => a.x));
  const actorYs = Object.values(record.actorTracks).flatMap((t) => t.map((a) => a.y));
  const extent = {
    minX: Math.min(...xs, ...actorXs) - margin,
    maxX: Math.max(...xs, ...actorXs) + margin,
    minY: Math.min(...ys, ...actorYs) - margin,
    maxY: Math.max(...ys, ...actorYs) + margin,
  };
  const labels = Object.fromEntries(scenario.actors.map((a) => [a.id, a.label]));
  return findHiddenReveals(scenario.world, record, labels, extent);
}

export interface ScenarioAnalysis {
  model: ReferenceRide;
  reveals: Reveal[];
  unscored: ActorSpec[];
  discrimination: RuleDiscrimination[];
  /** Road users the model credits as seen while a building is in the way. */
  hidden: HiddenReveal[];
}

/**
 * Everything the builder wants to know, riding each way exactly once.
 *
 * The three questions overlap heavily — the model ride is the reveal table's first column, and the
 * rides that provoke the traffic are two of the sloppy riders — so asking them separately rode the
 * same scenario the same way several times per keystroke. Here one cache serves all of them.
 */
export function analyseScenario(scenario: Scenario): ScenarioAnalysis {
  const cache = new Map<string, ReferenceRide>();
  const ride = (plan: RidePlan & MergePlan & OvertakePlan): ReferenceRide => {
    const key = JSON.stringify(plan);
    let hit = cache.get(key);
    if (!hit) {
      hit = referenceRide(scenario, plan);
      cache.set(key, hit);
    }
    return hit;
  };

  const model = ride({});
  return {
    model,
    reveals: revealsFrom(scenario, ride),
    unscored: model.error ? [] : unscoredActors(scenario, model.record, ride),
    discrimination: model.error ? [] : discriminationOf(scenario, model, ride),
    hidden: model.error ? [] : hiddenOf(scenario, model.record),
  };
}
