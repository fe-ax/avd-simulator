/**
 * Scenario drafts in localStorage.
 *
 * A scratchpad, not the product: the deliverable is the file the builder exports. This exists so
 * that closing the tab halfway through moving a truck is not a reason to start again.
 */
import { buildRoutes } from './route';
import { roadSurfaces } from './roadSurfaces';
import type { Scenario } from './types';

const KEY = 'avd-simulator.draft.v1';

export interface Draft {
  scenario: Scenario;
  /** Which shipped scenario this was derived from, so export can spread it. */
  baseId: string;
  savedAt: string;
}

/**
 * Is this draft still something this build can use?
 *
 * Answered by *using* it — build its route and its road — rather than by checking it against a
 * schema. A schema is a second description of the shape and goes stale the moment the first one
 * moves; actually running the thing cannot.
 *
 * This exists because a draft saved before `world.stretch` was introduced took the whole builder
 * down to a white screen. Nothing rendered, so nothing could clear it, and the only way back was
 * devtools. A saved draft outlives the code that made it exactly as a saved run does, and runs
 * have had a migration since the day one was renamed.
 */
function usable(scenario: Scenario): boolean {
  try {
    buildRoutes(scenario);
    roadSurfaces(scenario.world, { minX: -50, maxX: 50, minY: -50, maxY: 50 });
    return true;
  } catch {
    return false;
  }
}

export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Draft;
    if (!parsed?.scenario?.id || !usable(parsed.scenario)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveDraft(scenario: Scenario, baseId: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ scenario, baseId, savedAt: new Date().toISOString() }));
  } catch {
    /* a full quota costs you the autosave, not the session */
  }
}

export function clearDraft() {
  localStorage.removeItem(KEY);
}
