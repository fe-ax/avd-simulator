/**
 * What a model rider makes of the scenario you are editing, said out loud while you edit it.
 *
 * This is the reason the builder exists. The A12's first design put the truck ahead of the rider,
 * which inverts the exercise so thoroughly that the rider who never touches the throttle scores
 * best — and finding that took a standalone kinematics spike and a table of numbers in a terminal.
 * Here it is a red panel that appears while you are still holding the thing you moved.
 */
import type { Obstruction } from '../../sim/validate';
import type { Reveal } from '../../sim/referenceRide';
import type { RunRecord } from '../../sim/types';

export interface Validation {
  record: RunRecord | null;
  error: string | null;
  obstructions: Obstruction[];
  reveals: Reveal[];
}

function seconds(v: number | null): string {
  return v === null ? '—' : `${v.toFixed(1).replace('.', ',')}s`;
}

export function ValidationPanel({ record, error, obstructions, reveals }: Validation) {
  if (error) {
    return (
      <section className="builder-panel builder-panel-bad">
        <h3>Onrijdbaar</h3>
        <p>Dit scenario kan niet gereden worden, dus er valt ook niets aan te meten.</p>
        <pre className="builder-error">{error}</pre>
      </section>
    );
  }

  const passed = record?.verdict === 'geslaagd' && record.counts.fout === 0 && record.counts.kritiek === 0;

  return (
    <>
      <section className={`builder-panel ${passed ? 'builder-panel-good' : 'builder-panel-bad'}`}>
        <h3>De modelrit</h3>
        {record ? (
          <>
            <p className="builder-verdict">
              {passed
                ? 'Een rijder die alles goed doet, haalt dit.'
                : 'Een rijder die alles goed doet, haalt dit niet.'}
              <span className="builder-counts">
                {record.counts.kritiek}/{record.counts.fout}/{record.counts.opmerking}
              </span>
            </p>
            {!passed && (
              <ul className="builder-faults">
                {record.faults.map((f) => (
                  <li key={f.expectedId}>
                    <strong>{f.label}</strong>
                    <span>{f.explanation}</span>
                  </li>
                ))}
              </ul>
            )}
            {!passed && (
              <p className="builder-note">
                Dat hoeft geen fout in je scenario te zijn — een oefening mág te moeilijk zijn —
                maar het is zelden wat je bedoelde.
              </p>
            )}
          </>
        ) : (
          <p>Nog niet gereden.</p>
        )}
      </section>

      {obstructions.length > 0 && (
        <section className="builder-panel builder-panel-bad">
          <h3>Er staat iets in de weg</h3>
          <p>De motor zou hier dwars doorheen rijden:</p>
          <ul className="builder-faults">
            {obstructions.map((o) => (
              <li key={`${o.kind}-${o.s}`}>
                <strong>{o.kind}</strong>
                <span>op {o.s.toFixed(0)} m langs de route</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="builder-panel">
        <h3>Wanneer zie je ze?</h3>
        <p className="builder-note">
          Het verschil tussen de kolommen ís de les. Wordt iemand even vroeg gezien mét en zónder
          spiegels, dan leert die spiegel niets en staat het verkeer op de verkeerde plek.
        </p>
        <table className="builder-reveals">
          <thead>
            <tr>
              <th />
              <th>hele reeks</th>
              <th>geen spiegel</th>
              <th>niet kijken</th>
            </tr>
          </thead>
          <tbody>
            {reveals.map((r) => (
              <tr key={r.actorId}>
                <th scope="row">{r.label}</th>
                <td>{seconds(r.full)}</td>
                <td>{seconds(r.noMirrors)}</td>
                <td>{seconds(r.noLooks)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
