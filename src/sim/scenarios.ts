/**
 * Every scenario there is, in one place, keyed by the id a `RunRecord` stores.
 *
 * A saved run outlives the code that produced it — twenty of them sit in localStorage — so this
 * lookup has to be able to answer "no such scenario" instead of handing back a plausible wrong
 * one. Replaying a run against another scenario does not fail loudly: the wrong road is drawn,
 * and `ReplayPlayer` has no `ActorSpec` for actor ids it does not know, so it drops those actors
 * from the scene. A motorway run would replay as an empty Kerkstraat and look like a clean ride.
 *
 * Pure data, like the scenarios themselves. The registry is derived from `scenario.id` rather
 * than written out as a literal, so a key and the scenario it points at cannot drift apart.
 */
import { invoegenSnelweg } from './scenario.invoegen-snelweg';
import { rechtsafFietspad } from './scenario.rechtsaf-fietspad';
import type { Scenario } from './types';

/** In the order they are offered to the student, easiest first. */
export const ALL_SCENARIOS: readonly Scenario[] = [
  rechtsafFietspad,
  invoegenSnelweg,
];

/** What a fresh session starts on, and the fallback for an id that is no longer in the registry. */
export const DEFAULT_SCENARIO: Scenario = ALL_SCENARIOS[0];

export const SCENARIOS: Readonly<Record<string, Scenario>> = Object.fromEntries(
  ALL_SCENARIOS.map((s) => [s.id, s]),
);

/** Null rather than undefined or a throw: "this run's scenario is gone" is a state to show. */
export function scenarioById(id: string): Scenario | null {
  return SCENARIOS[id] ?? null;
}
