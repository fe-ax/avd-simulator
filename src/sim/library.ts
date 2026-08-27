/**
 * Scenarios somebody made, kept in the browser.
 *
 * Until this existed the builder ended by telling you to put a TypeScript file in `src/sim/` and
 * add a line to `ALL_SCENARIOS`. That is a fine instruction for whoever has the repo checked out
 * and no instruction at all for a riding instructor, which is who the tool is for now. A scenario
 * you build has to be one you can keep, ride, and hand to a colleague, without any of it involving
 * a compiler.
 *
 * Scenarios have been pure serialisable data from the start — a rule in `CLAUDE.md` that cost
 * something to hold to and pays for itself here, because storing one is `JSON.stringify` and
 * nothing else.
 *
 * **The ids that ship are reserved.** `scenarioById` looks in `ALL_SCENARIOS` first, so nothing
 * saved here can shadow a shipped exercise even if it claims that id — but a saved scenario that
 * claimed one would then be unreachable and unexplainable, so saving refuses it outright instead.
 */
import { isRideable } from './validate';
import type { Scenario } from './types';

const KEY = 'avd-simulator.scenarios.v1';

/**
 * Is there a browser under us?
 *
 * `scenarioById` consults this store, and the headless driver and every test in `src/sim` call
 * `scenarioById`. Without the guard those all reach a `ReferenceError` and rely on a `catch` to
 * turn it into an empty list, which works and reads like an accident — and pays for a thrown
 * exception on a path that runs thousands of times a suite.
 */
const hasStorage = () => typeof localStorage !== 'undefined';

export interface SavedScenario {
  scenario: Scenario;
  savedAt: string;
}

/**
 * Everything saved here that this build can still ride.
 *
 * Unrideable entries are dropped from the answer and left in storage. Dropping them from storage
 * too would be tidier and would throw away somebody's work over a shape change we might yet
 * migrate — the same reasoning that kept the run store's key stable through a rename.
 */
export function listSaved(): SavedScenario[] {
  if (!hasStorage()) return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedScenario[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s) => s?.scenario?.id && isRideable(s.scenario));
  } catch {
    return [];
  }
}

function writeAll(list: SavedScenario[]): boolean {
  if (!hasStorage()) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export type SaveResult =
  | { ok: true; saved: SavedScenario[] }
  /** Dutch, because it is shown to whoever pressed the button. */
  | { ok: false; reason: string };

/**
 * Keep a scenario, replacing any earlier one with the same id.
 *
 * Replacing rather than accumulating versions: the builder autosaves a draft continuously and this
 * is the deliberate "keep this one" press, so two entries with one id would be a bug the author
 * cannot see and cannot fix.
 */
export function saveScenario(scenario: Scenario, reservedIds: ReadonlySet<string>): SaveResult {
  if (!scenario.id.trim()) return { ok: false, reason: 'Dit scenario heeft geen id.' };
  if (reservedIds.has(scenario.id)) {
    return {
      ok: false,
      reason: `"${scenario.id}" is de id van een scenario dat al met de simulator meekomt. Kies een andere id.`,
    };
  }
  if (!isRideable(scenario)) {
    return { ok: false, reason: 'Dit scenario is niet te rijden; de weg of de route klopt niet.' };
  }

  const next: SavedScenario[] = [
    { scenario, savedAt: new Date().toISOString() },
    ...listSaved().filter((s) => s.scenario.id !== scenario.id),
  ];
  if (!writeAll(next)) {
    return {
      ok: false,
      reason: 'De opslag van je browser zit vol. Verwijder een opgeslagen scenario of een oude rit.',
    };
  }
  return { ok: true, saved: next };
}

export function deleteScenario(id: string): SavedScenario[] {
  const next = listSaved().filter((s) => s.scenario.id !== id);
  writeAll(next);
  return next;
}

/**
 * An id like `kruispunt-v1` that nothing is using yet.
 *
 * For importing a file whose id is already taken and which the importer chose to keep alongside
 * rather than replace. It suffixes rather than randomises so the result is still something a
 * person can read out to somebody else.
 */
export function freeId(wanted: string, taken: ReadonlySet<string>): string {
  if (!taken.has(wanted)) return wanted;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${wanted}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${wanted}-${taken.size + 1}`;
}
