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
 *
 * Since scenarios can also be *made*, a lookup has two places to look. **The shipped ones win.**
 * That ordering is a guarantee rather than a convention: a saved scenario claiming
 * `rechtsaf-fietspad-v1` cannot change what a run recorded against the real Kerkstraat replays
 * against, however it got into storage. `library.ts` refuses to save such an id in the first place,
 * but a file somebody hand-edited does not have to go through that door.
 */
import { listSaved } from './library';
import { autoVanRechts } from './scenario.auto-van-rechts';
import { inhalenSnelweg } from './scenario.inhalen-snelweg';
import { invoegenSnelweg } from './scenario.invoegen-snelweg';
import { rechtsafFietspad } from './scenario.rechtsaf-fietspad';
import { uitvoegenSnelweg } from './scenario.uitvoegen-snelweg';
import type { Scenario } from './types';

/** The ones that ship, in the order they are offered to the student, easiest first. */
export const ALL_SCENARIOS: readonly Scenario[] = [
  rechtsafFietspad,
  autoVanRechts,
  invoegenSnelweg,
  inhalenSnelweg,
  uitvoegenSnelweg,
];

/** What a fresh session starts on, and the fallback for an id that is no longer in the registry. */
export const DEFAULT_SCENARIO: Scenario = ALL_SCENARIOS[0];

export const SCENARIOS: Readonly<Record<string, Scenario>> = Object.fromEntries(
  ALL_SCENARIOS.map((s) => [s.id, s]),
);

/** Every id this build ships, which nothing saved may claim. */
export const RESERVED_IDS: ReadonlySet<string> = new Set(ALL_SCENARIOS.map((s) => s.id));

/**
 * The shipped exercises plus whatever this browser has saved.
 *
 * A function rather than a constant because the answer changes while the app is running — somebody
 * saves one in the builder and expects it in the picker without a reload.
 */
export function allScenarios(): Scenario[] {
  // Saved entries claiming a shipped id are dropped rather than listed. `scenarioById` already
  // resolves such an id to the shipped scenario, so listing the impostor puts a second button in
  // the picker with the same name that selects the first one — a row that looks like a choice and
  // is not. Same rule in both places, or they disagree about what exists.
  return [
    ...ALL_SCENARIOS,
    ...listSaved().map((s) => s.scenario).filter((s) => !RESERVED_IDS.has(s.id)),
  ];
}

/** Null rather than undefined or a throw: "this run's scenario is gone" is a state to show. */
export function scenarioById(id: string): Scenario | null {
  return SCENARIOS[id] ?? listSaved().find((s) => s.scenario.id === id)?.scenario ?? null;
}
