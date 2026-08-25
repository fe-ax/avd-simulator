/**
 * Run persistence. A `RunRecord` is the unit of storage: everything the debrief, the timeline
 * and the replay need is in it, so a saved run needs no engine to re-open.
 */
import type { RunRecord } from './types';

const KEY = 'avd-simulator.runs.v1';
const MAX_STORED = 20;

export function listRuns(): RunRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RunRecord[];
    return Array.isArray(parsed) ? parsed : [];
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

export function exportRun(record: RunRecord) {
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `avd-rit-${record.startedAt.replace(/[:.]/g, '-')}.json`;
  a.click();
  URL.revokeObjectURL(url);
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
