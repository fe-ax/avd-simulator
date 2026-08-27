/**
 * A scenario, or a ride, as a file you can email somebody.
 *
 * The unit of sharing between two instructors who each have the simulator open in a browser and
 * neither of whom has a checkout. `scenarioExport.ts` next door emits TypeScript, which is how a
 * scenario graduates into the repo; this is how one gets from a laptop to a laptop.
 *
 * **A ride carries its scenario with it.** A `RunRecord` stores only `scenarioId`, and resolving it
 * against a registry that does not have it replays as an empty road rather than as an error — the
 * failure `CLAUDE.md` rule 7 exists to warn about. Somebody sending their instructor a ride would
 * hit that every time, because the whole reason to send it is that the other person was not there.
 * So the envelope holds both, and importing one can put the scenario back.
 *
 * Envelopes are tagged and versioned because these files will outlive this build, and a JSON blob
 * with no name on it is indistinguishable from any other JSON blob when somebody picks the wrong
 * file.
 */
import { isRideable } from './validate';
import type { RunRecord, Scenario } from './types';

const SCENARIO_FORMAT = 'avd-scenario';
const RUN_FORMAT = 'avd-run';
const VERSION = 1;

export interface ScenarioFile {
  format: typeof SCENARIO_FORMAT;
  version: number;
  scenario: Scenario;
}

export interface RunFile {
  format: typeof RUN_FORMAT;
  version: number;
  run: RunRecord;
  /** The scenario it was ridden on, so the receiver can replay it without already having it. */
  scenario: Scenario;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; reason: string };

export function scenarioFileFor(scenario: Scenario): ScenarioFile {
  return { format: SCENARIO_FORMAT, version: VERSION, scenario };
}

export function runFileFor(run: RunRecord, scenario: Scenario): RunFile {
  return { format: RUN_FORMAT, version: VERSION, run, scenario };
}

/** `kruispunt-v1.avd.json` — the extension says which of the two it is at a glance. */
export function scenarioFilename(scenario: Scenario): string {
  return `${scenario.id}.avd.json`;
}

export function runFilename(run: RunRecord): string {
  return `rit-${run.scenarioId}-${run.id.slice(0, 6)}.avdrit.json`;
}

function parse(text: string): Parsed<Record<string, unknown>> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'Dit is geen geldig JSON-bestand.' };
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, reason: 'Dit bestand bevat geen scenario.' };
  }
  return { ok: true, value: value as Record<string, unknown> };
}

/**
 * A scenario out of a file, or the reason it is not one.
 *
 * Rideability is checked here rather than at the point of use, because a file is the one place a
 * scenario arrives from somewhere this build has never controlled: an older version of the tool, a
 * newer one, or a well-meaning person who opened it in a text editor.
 */
export function readScenarioFile(text: string): Parsed<Scenario> {
  const outer = parse(text);
  if (!outer.ok) return outer;
  const body = outer.value;

  if (body.format !== SCENARIO_FORMAT) {
    return {
      ok: false,
      reason:
        body.format === RUN_FORMAT
          ? 'Dit is een opgeslagen rit, geen scenario. Open hem bij "Eerdere ritten".'
          : 'Dit bestand komt niet uit de scenario-bouwer.',
    };
  }
  const scenario = body.scenario as Scenario | undefined;
  if (!scenario?.id) return { ok: false, reason: 'Er zit geen scenario in dit bestand.' };
  if (!isRideable(scenario)) {
    return {
      ok: false,
      reason: 'Dit scenario is niet te rijden met deze versie van de simulator.',
    };
  }
  return { ok: true, value: scenario };
}

export function readRunFile(text: string): Parsed<{ run: RunRecord; scenario: Scenario }> {
  const outer = parse(text);
  if (!outer.ok) return outer;
  const body = outer.value;

  if (body.format !== RUN_FORMAT) {
    return {
      ok: false,
      reason:
        body.format === SCENARIO_FORMAT
          ? 'Dit is een scenario, geen rit. Open hem in de scenario-bouwer.'
          : 'Dit bestand komt niet uit de simulator.',
    };
  }
  const run = body.run as RunRecord | undefined;
  const scenario = body.scenario as Scenario | undefined;
  if (!run?.id || !Array.isArray(run.samples)) {
    return { ok: false, reason: 'Er zit geen rit in dit bestand.' };
  }
  if (!scenario?.id) return { ok: false, reason: 'Bij deze rit zit geen scenario.' };
  if (!isRideable(scenario)) {
    return { ok: false, reason: 'Het scenario bij deze rit is niet te rijden met deze versie.' };
  }
  return { ok: true, value: { run, scenario } };
}
