import { deleteRun, exportRun, formatRunLabel } from '../sim/recorder';
import { scenarioById } from '../sim/scenarios';
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
      {runs.map((run) => {
        // The list mixes scenarios, so each row has to say which one it is. The live title wins
        // over the recorded one so a renamed scenario reads the same everywhere; the recorded
        // title is the fallback for a run whose scenario is no longer in the registry, and that
        // row says so rather than looking like any other.
        const owner = scenarioById(run.scenarioId);
        return (
          <li key={run.id} className={run.id === currentId ? 'current' : ''}>
            <button type="button" className="history-open" onClick={() => onOpen(run)}>
              <span className={`history-verdict ${run.verdict}`}>
                {run.verdict === 'geslaagd' ? 'G' : 'Z'}
              </span>
              <span className="history-main">
                <span
                  className={`history-scenario${owner ? '' : ' unknown'}`}
                  title={
                    owner
                      ? owner.title
                      : `Scenario ${run.scenarioId} bestaat niet meer — herhaling is niet mogelijk`
                  }
                >
                  {owner ? owner.title : `${run.scenarioTitle} · onbekend`}
                </span>
                <span className="history-time">{formatRunLabel(run)}</span>
              </span>
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
        );
      })}
    </ul>
  );
}
