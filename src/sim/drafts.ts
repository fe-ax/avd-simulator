/**
 * Scenario drafts in localStorage.
 *
 * A scratchpad, not the product: what you keep is what you press Bewaar on, which goes to
 * `library.ts`. This is the one draft in progress, so that closing the tab halfway through moving
 * a truck is not a reason to start again.
 */
import { isRideable } from './validate';
import type { Scenario } from './types';

const KEY = 'avd-simulator.draft.v1';

export interface Draft {
  scenario: Scenario;
  /** Which shipped scenario this was derived from, so export can spread it. */
  baseId: string;
  savedAt: string;
}

export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Draft;
    if (!parsed?.scenario?.id || !isRideable(parsed.scenario)) return null;
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
