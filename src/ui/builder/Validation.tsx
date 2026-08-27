/**
 * What a model rider makes of the scenario you are editing, said out loud while you edit it.
 *
 * This is the reason the builder exists. The A12's first design put the truck ahead of the rider,
 * which inverts the exercise so thoroughly that the rider who never touches the throttle scores
 * best — and finding that took a standalone kinematics spike and a table of numbers in a terminal.
 * Here it is a red panel that appears while you are still holding the thing you moved.
 */
import type { Obstruction } from '../../sim/validate';
import type { ActorSpec, Vec2 } from '../../sim/types';
import type { Reveal, RuleDiscrimination } from '../../sim/referenceRide';
import type { RunRecord } from '../../sim/types';

export interface Validation {
  record: RunRecord | null;
  error: string | null;
  obstructions: Obstruction[];
  /** Points along the route with no road under them. */
  offRoad: Vec2[];
  /** Road users no rule measures anything about. */
  unscored: ActorSpec[];
  /** The scenario this one derives from, whose reeks it is still being judged by. */
  inheritedFrom: string | null;
  reveals: Reveal[];
  /** Which rules any deliberately sloppy rider actually missed. Empty when nothing could be ridden. */
  discrimination: RuleDiscrimination[];
}

function seconds(v: number | null): string {
  return v === null ? '—' : `${v.toFixed(1).replace('.', ',')}s`;
}

/**
 * What this row's three numbers actually say — read off them, not asserted at them.
 *
 * The note used to tell every scenario that equal mirror columns meant the traffic was in the wrong
 * place. That is true on a motorway, where the hazard comes up behind you and the mirror is the
 * only thing that can find it. It is nonsense at a crossroads: a car arriving from the right comes
 * in through the windscreen, the mirror columns *should* read the same, and the panel was telling
 * the author to fix a scenario that was correct. Worse, it stayed silent about the column that
 * matters there.
 *
 * The real warning is narrower and never wrong: when no way of riding changes when you see
 * somebody, no rule about looking at them can teach anything.
 */
function readRow(r: Reveal, allFlat: boolean): { tone: 'warn' | 'note'; text: string } | null {
  if (r.full === null) {
    return { tone: 'warn', text: 'komt nooit in beeld — ook niet als je alles goed doet.' };
  }
  const same = (a: number | null, b: number | null) => a !== null && b !== null && Math.abs(a - b) < 0.15;

  if (r.noLooks === null) {
    return { tone: 'note', text: 'zonder kijken zie je hem helemaal niet. Daar zit de les.' };
  }
  if (same(r.full, r.noMirrors) && same(r.full, r.noLooks)) {
    // One flat row among several that are not is a road user in the wrong place. *Every* row flat
    // is a fact about the road: on an open stretch everything is ahead of you or comes past you, so
    // nothing you do with your head changes when you first see it. Saying that once, calmly, beats
    // four warnings that push an author to fix a scenario that is right. It is said above instead.
    if (allFlat) return null;
    return {
      tone: 'warn',
      text: 'even vroeg gezien, hoe je ook rijdt — een kijkregel hierover leert dus niets.',
    };
  }
  const gain = r.noLooks - r.full;
  if (same(r.full, r.noMirrors)) {
    return {
      tone: 'note',
      text: `de spiegels voegen hier niets toe; hij komt door de voorruit binnen. Kijken levert ${gain
        .toFixed(1)
        .replace('.', ',')}s op.`,
    };
  }
  return {
    tone: 'note',
    text: `kijken levert ${gain.toFixed(1).replace('.', ',')}s op.`,
  };
}

export function ValidationPanel({
  record,
  error,
  obstructions,
  offRoad,
  unscored,
  inheritedFrom,
  reveals,
  discrimination,
}: Validation) {
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

  // Every road user seen at the same moment however you ride. A property of the road, not a fault.
  const allFlat =
    reveals.length > 0 &&
    reveals.every(
      (r) =>
        r.full !== null &&
        r.noMirrors !== null &&
        r.noLooks !== null &&
        Math.abs(r.full - r.noMirrors) < 0.15 &&
        Math.abs(r.full - r.noLooks) < 0.15,
    );

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
            {inheritedFrom && (
              <p className="builder-note">
                Let op: er wordt beoordeeld op de reeks van <strong>{inheritedFrom}</strong>, die je
                hier niet kunt aanpassen. "Geslaagd" betekent dus dat <em>díe</em> reeks nog klopt,
                niet dat jouw oefening werkt.
              </p>
            )}
          </>
        ) : (
          <p>Nog niet gereden.</p>
        )}
      </section>

      {offRoad.length > 0 && (
        <section className="builder-panel builder-panel-bad">
          <h3>De weg houdt op</h3>
          <p>
            Over {offRoad.length === 1 ? 'één punt' : `${offRoad.length} punten`} van de route ligt
            geen asfalt. Daar rijd je door de berm.
          </p>
          <p className="builder-note">
            Vanaf ({offRoad[0].x.toFixed(1)}, {offRoad[0].y.toFixed(1)}).
          </p>
        </section>
      )}

      {unscored.length > 0 && (
        <section className="builder-panel builder-panel-bad">
          <h3>Er wordt niets over ze beoordeeld</h3>
          <p>
            {unscored.length === 1 ? 'Deze weggebruiker doet' : 'Deze weggebruikers doen'} niets uit
            zichzelf, {unscored.length === 1 ? 'komt' : 'komen'} in geen enkele regel voor, en
            {unscored.length === 1 ? ' hoeft' : ' hoeven'} ook nooit voor de rijder te remmen — hoe
            slecht die ook rijdt:
          </p>
          <ul className="builder-faults">
            {unscored.map((a) => (
              <li key={a.id}>
                <strong>{a.label}</strong>
                <span>staat er wel, maar doet niet mee</span>
              </li>
            ))}
          </ul>
          <p className="builder-note">
            Decor mag, maar als dit je gevaar is, meet de oefening het niet.
          </p>
        </section>
      )}

      {discrimination.length > 0 && (() => {
        // Two different complaints, and telling them apart is the point. A rule some sloppy rider
        // was measured against and still passed is soft. A rule nobody was measured against at all
        // is one whose mistake removes the rider from its scope — no lane change, so no rule about
        // the lane change — and no amount of sharpening the threshold would change that.
        const soft = discrimination.filter((r) => r.failedBy.length === 0 && r.testedBy.length > 0);
        const untested = discrimination.filter((r) => r.testedBy.length === 0);
        const toothless = [...soft, ...untested];
        if (toothless.length === 0) {
          return (
            <section className="builder-panel builder-panel-good">
              <h3>Elke regel vangt iets</h3>
              <p className="builder-note">
                Voor elke regel is er een slordige rit die hem mist. De oefening meet dus echt wat
                je erin gestopt hebt.
              </p>
              <ul className="builder-reeks-check">
                {discrimination.map((r) => (
                  <li key={r.expectedId}>
                    <strong>{r.label}</strong>
                    <span>gemist door {r.failedBy.join(', ')}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        }
        return (
          <section className="builder-panel builder-panel-bad">
            <h3>{toothless.length === 1 ? 'Deze regel onderscheidt niets' : 'Deze regels onderscheiden niets'}</h3>
            <ul className="builder-faults">
              {soft.map((r) => (
                <li key={r.expectedId}>
                  <strong>{r.label}</strong>
                  <span>ook een slordige rijder haalt dit — de grens of het venster is te ruim</span>
                </li>
              ))}
              {untested.map((r) => (
                <li key={r.expectedId}>
                  <strong>{r.label}</strong>
                  <span>
                    geen enkele slordige rit werd hierop gemeten — wie de fout maakt, komt niet eens
                    aan deze regel toe
                  </span>
                </li>
              ))}
            </ul>
            {soft.length > 0 && (
              <p className="builder-note">
                Een regel die iedereen haalt, leert niemand iets — hij kleurt groen en zegt niets.
                Verscherp het venster of de grens, of haal hem weg.
              </p>
            )}
            {untested.length > 0 && (
              <p className="builder-note">
                Bij de tweede soort is er niets mis met de grens: de fout die je zou willen vangen,
                haalt de rijder uit de regel weg. Vaak wordt hij ergens anders al afgestraft — en
                dan is deze regel dubbelop.
              </p>
            )}
          </section>
        );
      })()}

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
        <p className="builder-note">Het verschil tussen de kolommen ís de les.</p>
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
        {allFlat && (
          <p className="builder-note">
            Hier verschilt geen enkele kolom: alles rijdt vóór je of komt langs je heen, dus wanneer
            je het ziet hangt niet van je hoofd af. Niet fout — maar de les zit dan in de manoeuvre,
            niet in het kijken, en de regels moeten daarover gaan.
          </p>
        )}
        <ul className="builder-reveal-notes">
          {reveals.map((r) => {
            const read = readRow(r, allFlat);
            if (!read) return null;
            return (
              <li key={r.actorId} className={read.tone === 'warn' ? 'warn' : undefined}>
                <strong>{r.label}</strong> {read.text}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
