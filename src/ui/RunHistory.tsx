import { deleteRun, formatRunLabel, saveRun } from '../sim/recorder';
import { RESERVED_IDS, scenarioById } from '../sim/scenarios';
import { freeId, listSaved, saveScenario } from '../sim/library';
import { readRunFile, runFileFor, runFilename } from '../sim/scenarioFile';
import { downloadText, pickTextFile } from './files';
import type { RunRecord } from '../sim/types';

interface Props {
  runs: RunRecord[];
  currentId: string | null;
  onOpen: (record: RunRecord) => void;
  onChange: (runs: RunRecord[]) => void;
  /** What reading a file did or why it failed, in Dutch, for the session to show. Null clears. */
  onNotice?: (text: string | null) => void;
}

/**
 * A ride leaves with its scenario attached.
 *
 * The record itself stores only `scenarioId`, and a receiver who does not have that scenario
 * replays an empty road rather than an error — which is the whole point of sending it, since they
 * were not there. So the file carries both, and opening one puts the scenario back if it is
 * missing. A run of a scenario that ships still resolves to the shipped one: `scenarioById` looks
 * there first, so nothing arriving in a file can redefine the Kerkstraat.
 */
function shareRun(run: RunRecord) {
  const scenario = scenarioById(run.scenarioId);
  if (!scenario) return;
  // Compact, unlike the scenario file. A scenario is 1.5 kB and somebody might open it in a text
  // editor; a ride is three hundred samples of floats that nobody will ever read, and indenting
  // them nearly doubles the file — 250 kB against 140 kB for one twenty-second ride.
  downloadText(runFilename(run), JSON.stringify(runFileFor(run, scenario)));
}

export function RunHistory({ runs, currentId, onOpen, onChange, onNotice }: Props) {
  const openFile = async () => {
    onNotice?.(null);
    const text = await pickTextFile();
    if (text === null) return;
    const parsed = readRunFile(text);
    if (!parsed.ok) {
      onNotice?.(parsed.reason);
      return;
    }
    const { run, scenario } = parsed.value;
    if (!scenarioById(run.scenarioId)) {
      const taken = new Set([...RESERVED_IDS, ...listSaved().map((s) => s.scenario.id)]);
      const id = freeId(scenario.id, taken);
      // Keeping the run pointed at whatever id the scenario ends up under, or the row it lands in
      // says "onbekend" and cannot be replayed — which is exactly what this feature is for.
      const result = saveScenario({ ...scenario, id }, RESERVED_IDS);
      if (!result.ok) {
        onNotice?.(result.reason);
        return;
      }
      onChange(saveRun({ ...run, scenarioId: id }));
      onNotice?.(`Rit ingelezen, samen met het scenario "${scenario.title}".`);
      return;
    }
    onChange(saveRun(run));
    onNotice?.('Rit ingelezen.');
  };

  if (runs.length === 0) {
    return (
      <>
        <p className="history-empty">Nog geen ritten opgeslagen.</p>
        <button type="button" className="ghost-btn tiny" onClick={openFile}>
          Open een rit uit een bestand
        </button>
      </>
    );
  }
  return (
    <>
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
              onClick={() => shareRun(run)}
              title="Download deze rit, met het scenario erbij"
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
    <button type="button" className="ghost-btn tiny" onClick={openFile}>
      Open een rit uit een bestand
    </button>
    </>
  );
}
