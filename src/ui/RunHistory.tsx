import { deleteRun, exportRun, formatRunLabel } from '../sim/recorder';
import type { RunRecord } from '../sim/types';

interface Props {
  runs: RunRecord[];
  currentId: string | null;
  onOpen: (record: RunRecord) => void;
  onChange: (runs: RunRecord[]) => void;
}

export function RunHistory({ runs, currentId, onOpen, onChange }: Props) {
  if (runs.length === 0) {
    return <p className="history-empty">Nog geen ritten opgeslagen.</p>;
  }
  return (
    <ul className="history">
      {runs.map((run) => (
        <li key={run.id} className={run.id === currentId ? 'current' : ''}>
          <button type="button" className="history-open" onClick={() => onOpen(run)}>
            <span className={`history-verdict ${run.verdict}`}>
              {run.verdict === 'geslaagd' ? 'G' : 'Z'}
            </span>
            <span className="history-time">{formatRunLabel(run)}</span>
            <span className="history-counts">
              {run.counts.kritiek}/{run.counts.fout}/{run.counts.opmerking}
            </span>
          </button>
          <button
            type="button"
            className="history-action"
            onClick={() => exportRun(run)}
            title="Exporteer als JSON"
          >
            ⭳
          </button>
          <button
            type="button"
            className="history-action"
            onClick={() => onChange(deleteRun(run.id))}
            title="Verwijder"
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}
