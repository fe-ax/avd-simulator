import type { ActionResult, RunRecord, Severity } from '../sim/types';
import { conflictPointName } from '../sim/route';
import { scenarioById } from '../sim/scenarios';
import { formatTempo } from './RideSettings';

interface Props {
  record: RunRecord;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onSeek: (t: number) => void;
}

const SEVERITY_TITLE: Record<Severity, string> = {
  kritiek: 'Kritieke fouten',
  fout: 'Fouten',
  opmerking: 'Opmerkingen',
};

const SEVERITY_BLURB: Record<Severity, string> = {
  kritiek:
    'Gevaarzetting: een andere weggebruiker moest ingrijpen, of een opdracht is niet uitgevoerd. ' +
    'Op het examen betekent dit direct afbreken.',
  fout: 'Duidelijke fouten. Drie hiervan betekent zakken.',
  opmerking: 'Aandachtspunten. Deze kosten je het examen niet, maar ze vallen wel op.',
};

const ORDER: Severity[] = ['kritiek', 'fout', 'opmerking'];

function formatT(t: number | null): string {
  return t === null ? '—' : `${t.toFixed(1).replace('.', ',')}s`;
}

/**
 * A window in metres, as something a student can read.
 *
 * Windows are stored as distance-to-go, so a window that ends past the conflict point is negative
 * — and printing that straight out gave "-15–-45 m vóór het kruispunt", which asks the reader to
 * work out that minus-before means after. Say "ná" and drop the signs.
 */
function formatWindowD([from, to]: [number, number], anchor: string): string {
  const m = (v: number) => Math.abs(Math.round(v));
  if (from <= 0 && to <= 0) return `${m(from)}–${m(to)} m ná ${anchor}`;
  if (from > 0 && to > 0) return `${m(from)}–${m(to)} m vóór ${anchor}`;
  // Straddles the point: it starts before and ends after, so both halves have to be said.
  return `${m(from)} m vóór tot ${m(to)} m ná ${anchor}`;
}

function ResultRow({
  r,
  selected,
  onSelect,
  onSeek,
  anchorName,
}: {
  r: ActionResult;
  selected: boolean;
  onSelect: () => void;
  onSeek: (t: number) => void;
  /** What the window is measured back from. Never empty: a bare "vóór" reads as a typo. */
  anchorName: string;
}) {
  return (
    <li className={`result${selected ? ' selected' : ''} sev-${r.severity ?? 'none'}`}>
      <button
        type="button"
        onClick={() => {
          onSelect();
          const t = r.actualT ?? r.windowT?.[1] ?? null;
          if (t !== null) onSeek(t);
        }}
      >
        <div className="result-head">
          <span className="result-label">{r.label}</span>
          <span className={`result-status status-${r.status.replace(' ', '-')}`}>{r.status}</span>
        </div>
        <p className="result-explanation">{r.explanation}</p>
        <div className="result-meta">
          {r.windowT && (
            <span>
              verwacht {formatT(r.windowT[0])}–{formatT(r.windowT[1])}
              {r.windowD ? ` (${formatWindowD(r.windowD, anchorName)})` : ''}
            </span>
          )}
          <span>jij: {formatT(r.actualT)}</span>
        </div>
      </button>
    </li>
  );
}

export function Debrief({ record, selectedId, onSelect, onSeek }: Props) {
  const passed = record.verdict === 'geslaagd';
  const good = record.results.filter((r) => r.severity === null);
  // Resolved from the run's own scenario id, never from whatever is on screen — a debrief can be
  // reopened long after the session moved on. A run whose scenario has been deleted still has a
  // debrief worth reading, so it falls back to a name rather than to nothing: the alternative was
  // dropping the word and printing "60–20 m vóór)", which reads as a bug.
  const owner = scenarioById(record.scenarioId);
  const anchorName = owner ? conflictPointName(owner.world) : 'het meetpunt';

  return (
    <div className="debrief">
      <div className={`verdict ${record.verdict}`}>
        <span className="verdict-word">{passed ? 'Geslaagd' : 'Gezakt'}</span>
        <div className="verdict-counts">
          <span className="count kritiek">{record.counts.kritiek} kritiek</span>
          <span className="count fout">{record.counts.fout} fout</span>
          <span className="count opmerking">{record.counts.opmerking} opmerking</span>
        </div>
        {record.timeScale < 1 && (
          <p className="verdict-note tempo-note">
            Gereden op oefentempo {formatTempo(record.timeScale)} — je had{' '}
            {(1 / record.timeScale).toFixed(1).replace('.0', '').replace('.', ',')}× zo veel tijd
            om te reageren als op het examen.
          </p>
        )}
        {record.autoSteer && (
          <p className="verdict-note tempo-note">
            Auto-sturen stond aan: de motor nam de bocht zelf, dus het insturen is niet
            beoordeeld.
          </p>
        )}
        {record.branch === 'straight' && (
          <p className="verdict-note">
            Je bent rechtdoor gereden. De opdracht was rechtsaf de Kerkstraat in.
          </p>
        )}
      </div>

      {ORDER.map((severity) => {
        const items = record.results.filter((r) => r.severity === severity);
        if (items.length === 0) return null;
        return (
          <section key={severity} className={`result-section sev-${severity}`}>
            <h3>
              {SEVERITY_TITLE[severity]} <span className="badge">{items.length}</span>
            </h3>
            <p className="section-blurb">{SEVERITY_BLURB[severity]}</p>
            <ul>
              {items.map((r) => (
                <ResultRow
                  key={r.expectedId}
                  r={r}
                  selected={selectedId === r.expectedId}
                  onSelect={() => onSelect(selectedId === r.expectedId ? null : r.expectedId)}
                  onSeek={onSeek}
                  anchorName={anchorName}
                />
              ))}
            </ul>
          </section>
        );
      })}

      {good.length > 0 && (
        <section className="result-section sev-good">
          <h3>
            Goed gedaan <span className="badge">{good.length}</span>
          </h3>
          <ul>
            {good.map((r) => (
              <ResultRow
                key={r.expectedId}
                r={r}
                selected={selectedId === r.expectedId}
                onSelect={() => onSelect(selectedId === r.expectedId ? null : r.expectedId)}
                onSeek={onSeek}
                anchorName={anchorName}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
