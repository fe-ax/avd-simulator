/**
 * Run persistence. A `RunRecord` is the unit of storage: everything the debrief, the timeline
 * and the replay need is in it, so a saved run needs no engine to re-open.
 */
import type { RunRecord } from './types';

const KEY = 'avd-simulator.runs.v1';
const MAX_STORED = 20;

/**
 * Runs saved before a field was renamed are still perfectly good runs.
 *
 * Bumping the storage key would have been one character and would have thrown the student's
 * practice history away for a change that cost nothing to absorb here.
 */
function migrate(run: RunRecord & { turnCompletedAt?: number | null }): RunRecord {
  if (run.manoeuvreCompletedAt === undefined && run.turnCompletedAt !== undefined) {
    return { ...run, manoeuvreCompletedAt: run.turnCompletedAt };
  }
  return run;
}

export function listRuns(): RunRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RunRecord[];
    return Array.isArray(parsed) ? parsed.map(migrate) : [];
  } catch {
    return [];
  }
}

export function saveRun(record: RunRecord): RunRecord[] {
  const runs = [record, ...listRuns().filter((r) => r.id !== record.id)].slice(0, MAX_STORED);
  try {
    localStorage.setItem(KEY, JSON.stringify(runs));
  } catch {
    // Quota exceeded: keep only the newest few rather than losing the current run.
    try {
      localStorage.setItem(KEY, JSON.stringify(runs.slice(0, 3)));
    } catch {
      /* give up silently; the run is still in memory for this session */
    }
  }
  return runs;
}

export function deleteRun(id: string): RunRecord[] {
  const runs = listRuns().filter((r) => r.id !== id);
  localStorage.setItem(KEY, JSON.stringify(runs));
  return runs;
}

export function formatRunLabel(record: RunRecord): string {
  const d = new Date(record.startedAt);
  return d.toLocaleString('nl-NL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
