/**
 * What the sturen controls mean, in one place.
 *
 * On a crossroads they arm a branch — you choose between turning and going straight — and
 * auto-sturen can make that choice for you, because forgetting to steer is not a mistake real
 * riders make. On a motorway one press is one whole rijstrook, and auto-sturen must not apply at
 * all: timing that move is the entire exercise.
 *
 * This lives here rather than in the UI because `src/sim` may not import from a renderer, and it
 * lives in exactly one function because the alternative was four independent `&&` conditions —
 * in the engine, the key handler, the control panel and the settings — that would have drifted
 * apart the first time anything changed.
 */
import type { Scenario } from './types';

/** Only `steering` is ever read, so a stub is as good as the real thing. */
export type SteeringScenario = Pick<Scenario, 'steering'>;

/** True when a sturen press would do nothing, so nothing should offer it. */
export function steeringIsInert(scenario: SteeringScenario, autoSteer: boolean): boolean {
  return scenario.steering === 'branch' && autoSteer;
}

/**
 * True when the machine took the bend by itself and the rider is not judged on steering.
 *
 * The same fact as `steeringIsInert` today, and deliberately not an alias: this is what gets
 * *recorded* on a run, and the debrief says "de motor nam de bocht zelf" on the strength of it.
 * Recording the raw setting instead would have a motorway run — where the checkbox is hidden and
 * nothing was ever automatic — claim the machine steered for you.
 */
export function steeringIsAutomatic(scenario: SteeringScenario, autoSteer: boolean): boolean {
  return steeringIsInert(scenario, autoSteer);
}
