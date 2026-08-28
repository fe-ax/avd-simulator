/**
 * The scenario builder.
 *
 * You start from a scenario that ships, change the road's numbers and drag the traffic about, and
 * a model rider rides it after every change and tells you what it made of it. What comes out is a
 * TypeScript file that derives from the one you started with.
 *
 * The preview is not a special editor renderer: it is the same `drawScene` the replay uses, given
 * an orthographic camera and a `WorldView` from a `ReplayPlayer` over the reference ride. Which
 * means the thing you are editing is drawn by exactly the code that will draw it when it is
 * ridden, and the two cannot drift.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildRoutes, poseAt } from '../../sim/route';
import { ReplayPlayer } from '../../sim/replay';
import { ALL_SCENARIOS, RESERVED_IDS, scenarioById } from '../../sim/scenarios';
import { deleteScenario, freeId, listSaved, saveScenario, type SavedScenario } from '../../sim/library';
import { readScenarioFile, scenarioFileFor, scenarioFilename } from '../../sim/scenarioFile';
import { downloadText, pickTextFile } from '../files';
import { STARTERS } from '../../sim/starters';
import { analyseScenario } from '../../sim/referenceRide';
import { findObstructions, findOffRoad, riddenPath } from '../../sim/validate';
import { exportScenario } from '../../sim/scenarioExport';
import { clearDraft, loadDraft, saveDraft } from '../../sim/drafts';
import type { Handle } from '../../render/builderOverlay';
import type { ActorSpec, Scenario, Vec2 } from '../../sim/types';
import { BuilderView, type BuilderScene } from './BuilderView';
import { ValidationPanel, type Validation } from './Validation';
import { WorldForm } from './WorldForm';
import { ActorList, defaultsFor } from './ActorList';
import { ReeksEditor } from './ReeksEditor';
import { BriefingEditor } from './BriefingEditor';

/** How long to wait after the last change before riding it. Long enough to drag through. */
const SETTLE_MS = 220;

const EMPTY: Validation = {
  record: null,
  error: null,
  obstructions: [],
  offRoad: [],
  unscored: [],
  inheritedFrom: null,
  reveals: [],
  discrimination: [],
  hidden: [],
};

/** Which module each shipped scenario lives in, so an export can import its base. */
const BASE_MODULE: Record<string, { module: string; binding: string }> = {
  'rechtsaf-fietspad-v1': { module: 'scenario.rechtsaf-fietspad', binding: 'rechtsafFietspad' },
  'invoegen-snelweg-v1': { module: 'scenario.invoegen-snelweg', binding: 'invoegenSnelweg' },
};

/** How much road to show around the conflict point, in metres either side along the route. */
const FRAME_M = 85;

/** How far outside everything else an actor's end point may be and still be worth framing. */
const FAR_M = 60;

/**
 * What to frame: the stretch around the conflict point, not the whole route.
 *
 * Fitting everything sounds right and looks useless. Scenario 2's route is three hundred metres
 * long and fifteen wide, so framing all of it puts the entire road in a strip thirty pixels
 * across — and every number worth editing lives in the last eighty metres anyway. An actor's `to`
 * is worse still: on the A12 it is nine hundred metres up the road, meaning "and then it carries
 * on". Where someone comes from is a placement; where they end up is not.
 */
function extentOf(scenario: Scenario) {
  const xs: number[] = [];
  const ys: number[] = [];
  try {
    const routes = buildRoutes(scenario);
    const from = Math.max(0, routes.conflictS - FRAME_M);
    const to = Math.min(routes.turn.total, routes.conflictS + FRAME_M);
    for (let s = from; s <= to; s += 4) {
      const p = poseAt(routes.turn, s);
      xs.push(p.x);
      ys.push(p.y);
    }
  } catch {
    // A draft that will not build a route is still worth looking at; its traffic frames it.
  }
  // Every actor's starting point, wherever it is: that is a placement you chose and have to be
  // able to see. These used to be dropped unless they fell inside the framed stretch, which was
  // exactly backwards — scenario 1's snorfiets begins a hundred and thirty metres back, so both of
  // its handles opened off-screen while the sidebar told you to drag them.
  for (const a of scenario.actors) {
    xs.push(a.from.x);
    ys.push(a.from.y);
  }
  if (xs.length === 0) return { minX: -20, maxX: 20, minY: -20, maxY: 20 };

  // End points only if they are somewhere near. An actor's `to` is usually just "and then it
  // carries on" — on the A12 it is nine hundred metres away, and framing that squeezes the whole
  // exercise into a strip a few pixels wide. But on a junction it is forty metres past the
  // conflict, and leaving it out puts the second of its two handles off the top of the screen.
  const near = {
    minX: Math.min(...xs) - FAR_M,
    maxX: Math.max(...xs) + FAR_M,
    minY: Math.min(...ys) - FAR_M,
    maxY: Math.max(...ys) + FAR_M,
  };
  for (const a of scenario.actors) {
    if (a.to.x < near.minX || a.to.x > near.maxX) continue;
    if (a.to.y < near.minY || a.to.y > near.maxY) continue;
    xs.push(a.to.x);
    ys.push(a.to.y);
  }
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

export function Builder({ onExit, onRide }: { onExit: () => void; onRide: (id: string) => void }) {
  const [baseId, setBaseId] = useState(() => loadDraft()?.baseId ?? ALL_SCENARIOS[0].id);
  const [draft, setDraft] = useState<Scenario>(() => loadDraft()?.scenario ?? ALL_SCENARIOS[0]);
  const [validation, setValidation] = useState<Validation>(EMPTY);
  const [time, setTime] = useState(0);
  const [fitKey, setFitKey] = useState(0);
  const [exported, setExported] = useState<string | null>(null);
  const [hoveredActor, setHoveredActor] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedScenario[]>(() => listSaved());
  /** What the last save, import or delete did. Dutch; shown next to the buttons. */
  const [notice, setNotice] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);

  // A starter is a road to build on, not an exercise to derive from — so a draft based on one
  // exports as a whole file rather than as a spread that would owe its parent nothing.
  const starter = STARTERS.find((s) => s.id === baseId) ?? null;
  const base = starter ?? scenarioById(baseId) ?? ALL_SCENARIOS[0];

  const routes = useMemo(() => {
    try {
      return buildRoutes(draft);
    } catch {
      return null;
    }
  }, [draft]);

  // Ride it after every change, once the changes stop. A full run is a few milliseconds, so this
  // is a courtesy to the drag rather than a necessity.
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        analyse();
      } catch (err) {
        // A draft that throws is still a draft somebody is holding. `referenceRide` catches its own
        // failures and reports them as `error`, but everything downstream of it — the sloppy rides,
        // the sight lines, the road under the ride — can still throw on geometry that is halfway
        // through being typed. Unguarded, that unmounts the builder and takes the author's work off
        // the screen. Saying "onrijdbaar" is the same thing this panel says about a scenario the
        // model rider cannot finish, and it keeps the form and the drag handles alive.
        setValidation({ ...EMPTY, error: err instanceof Error ? err.message : String(err) });
      }
    }, SETTLE_MS);
    return () => clearTimeout(id);

    function analyse() {
      const { model, reveals, unscored, discrimination, hidden } = analyseScenario(draft);
      const { record, error } = model;
      if (error) {
        setValidation({ ...EMPTY, error });
        return;
      }
      // Bounds for the *questions*, not for the picture.
      //
      // extentOf frames what you look at: the conflict point and a stretch either side of it. Ask
      // "is there road under the whole ride?" with those and any ride longer than the frame reports
      // its own tail as verge — a blank motorway, whose ride is nine hundred metres and whose
      // frame is a hundred and seventy, opened with "de weg houdt op, 383 punten". The traffic on
      // the shipped motorways happens to stretch the frame far enough to hide it, which is why it
      // only ever showed on the empty starter somebody would begin from.
      //
      // So the road is generated over everywhere the machine actually went, plus room around it.
      const framed = extentOf(draft);
      const margin = 120;
      const ridden = riddenPath(record.samples);
      const bounds = {
        minX: Math.min(framed.minX, ...ridden.map((p) => p.x)) - margin,
        maxX: Math.max(framed.maxX, ...ridden.map((p) => p.x)) + margin,
        minY: Math.min(framed.minY, ...ridden.map((p) => p.y)) - margin,
        maxY: Math.max(framed.maxY, ...ridden.map((p) => p.y)) + margin,
      };
      setValidation({
        record,
        error: null,
        obstructions: routes ? findObstructions(draft.world, routes, bounds) : [],
        offRoad: findOffRoad(draft.world, riddenPath(record.samples), bounds),
        unscored,
        // Only when there is genuinely somebody else's reeks in play. A starter brings none, and
        // warning about an inherited reeks that does not exist is its own kind of lying.
        inheritedFrom: starter ? null : base.title,
        reveals,
        discrimination,
        hidden,
      });
    }
  }, [draft, routes, base.title, starter]);

  useEffect(() => {
    const id = setTimeout(() => saveDraft(draft, baseId), 500);
    return () => clearTimeout(id);
  }, [draft, baseId]);

  const player = useMemo(
    () => (validation.record ? new ReplayPlayer(validation.record, draft) : null),
    [validation.record, draft],
  );

  const duration = validation.record?.durationS ?? 0;
  useEffect(() => {
    if (time > duration) setTime(0);
  }, [duration, time]);

  const handles = useMemo<Handle[]>(
    () =>
      draft.actors.flatMap((a) => [
        { id: `${a.id}:from`, at: a.from, label: a.label, active: a.id === hoveredActor },
        { id: `${a.id}:to`, at: a.to, active: a.id === hoveredActor },
      ]),
    [draft.actors, hoveredActor],
  );

  const getScene = useCallback((): BuilderScene | null => {
    if (!player) return null;
    player.seek(time);
    return {
      world: player.scene(),
      opts: {
        time,
        // The builder is the god view by definition: you are looking at the exercise, not riding it.
        revealAll: true,
        highlightUnseen: false,
        showConflictMarker: false,
      },
      routes,
      actors: draft.actors,
      handles,
    };
  }, [player, time, routes, draft.actors, handles]);

  const dragHandle = useCallback((id: string, to: Vec2) => {
    const [actorId, which] = id.split(':') as [string, 'from' | 'to'];
    const round = (v: number) => Math.round(v * 10) / 10;
    setDraft((d) => ({
      ...d,
      actors: d.actors.map((a) =>
        a.id === actorId ? { ...a, [which]: { x: round(to.x), y: round(to.y) } } : a,
      ),
    }));
  }, []);

  const changeBase = useCallback((id: string) => {
    const next = scenarioById(id) ?? STARTERS.find((s) => s.id === id) ?? null;
    if (!next) return;
    setBaseId(id);
    setDraft(next);
    setFitKey((k) => k + 1);
    setExported(null);
  }, []);

  const patchActor = useCallback((actorId: string, patch: Partial<ActorSpec>) => {
    setDraft((d) => ({
      ...d,
      actors: d.actors.map((a) => (a.id === actorId ? { ...a, ...patch } : a)),
    }));
  }, []);

  /**
   * A new road user, dropped somewhere you can see and reach.
   *
   * Placed across the conflict point rather than at the origin: a vehicle that appears in a corner
   * of the world is a vehicle you have to go and find before you can do anything with it, and the
   * whole point of the plan view is that the thing you are editing is in front of you.
   */
  const addActor = useCallback(() => {
    setDraft((d) => {
      const kind = defaultsFor('auto');
      const n = d.actors.length + 1;
      let at = { x: 0, y: 0 };
      let heading = { x: 1, y: 0 };
      try {
        const r = buildRoutes(d);
        const p = poseAt(r.turn, r.conflictS);
        at = { x: p.x, y: p.y };
        // Across the rider's path, which is where traffic that matters tends to come from.
        heading = { x: Math.cos(p.heading + Math.PI / 2), y: Math.sin(p.heading + Math.PI / 2) };
      } catch {
        // An unbuildable draft still gets its actor; it lands at the origin and can be dragged.
      }
      const reach = 60;
      return {
        ...d,
        actors: [
          ...d.actors,
          {
            id: `weggebruiker-${n}`,
            kind: kind.id,
            label: `${kind.label} ${n}`,
            from: {
              x: Math.round((at.x - heading.x * reach) * 10) / 10,
              y: Math.round((at.y - heading.y * reach) * 10) / 10,
            },
            to: {
              x: Math.round((at.x + heading.x * reach) * 10) / 10,
              y: Math.round((at.y + heading.y * reach) * 10) / 10,
            },
            speed: kind.speedKmh / 3.6,
            length: kind.length,
            // No keepInBlindSpot at all rather than a disabled one. The field is optional, and a
            // block of numbers that does nothing still travels into the exported file, where it
            // reads like a setting somebody chose.
          },
        ],
      };
    });
  }, []);

  const removeActor = useCallback((actorId: string) => {
    setDraft((d) => ({
      ...d,
      actors: d.actors.filter((a) => a.id !== actorId),
      // A rule pointed at a road user that is gone would score nothing and say nothing about why.
      expected: d.expected.filter(
        (e) => !(e.kind.type === 'headway' && e.kind.actorId === actorId),
      ),
    }));
  }, []);

  const takenIds = useCallback(
    () => new Set([...RESERVED_IDS, ...listSaved().map((s) => s.scenario.id)]),
    [],
  );

  const doSave = useCallback(() => {
    const result = saveScenario(draft, RESERVED_IDS);
    if (!result.ok) {
      setNotice({ tone: 'bad', text: result.reason });
      return;
    }
    setSaved(result.saved);
    setNotice({ tone: 'good', text: `"${draft.title}" is bewaard. Je vindt hem nu ook bij het rijden.` });
  }, [draft]);

  const doDownload = useCallback(() => {
    downloadText(scenarioFilename(draft), JSON.stringify(scenarioFileFor(draft), null, 2));
  }, [draft]);

  const doImport = useCallback(async () => {
    const text = await pickTextFile();
    if (text === null) return;
    const parsed = readScenarioFile(text);
    if (!parsed.ok) {
      setNotice({ tone: 'bad', text: parsed.reason });
      return;
    }
    // An id that is already ours would silently replace somebody's work, and one that is shipped
    // cannot be saved at all. Both become a new id rather than a refusal: the file is fine, and
    // whoever opened it wants to look at what is in it.
    const taken = takenIds();
    const id = freeId(parsed.value.id, taken);
    const scenario = id === parsed.value.id ? parsed.value : { ...parsed.value, id };
    setDraft(scenario);
    setBaseId(scenario.id);
    setFitKey((k) => k + 1);
    setNotice(
      id === parsed.value.id
        ? { tone: 'good', text: `"${scenario.title}" is ingelezen. Druk op Bewaar om hem te houden.` }
        : {
            tone: 'good',
            text: `"${scenario.title}" is ingelezen als ${id}, want ${parsed.value.id} was al in gebruik.`,
          },
    );
  }, [takenIds]);

  const doDelete = useCallback((id: string) => {
    setSaved(deleteScenario(id));
    setNotice({ tone: 'good', text: 'Verwijderd.' });
  }, []);

  const doExport = useCallback(() => {
    const meta = BASE_MODULE[base.id];
    setExported(
      meta
        ? exportScenario(draft, base, meta.module, meta.binding).source
        : exportScenario(draft, null).source,
    );
  }, [draft, base]);

  const dirty = draft !== base;

  return (
    <div className="app builder">
      <div className="stage">
        <div className="builder-topbar">
          <button type="button" className="ghost-btn" onClick={onExit}>
            ← Terug naar rijden
          </button>
          <span className="builder-bases">
            {[...ALL_SCENARIOS, ...STARTERS].map((s) => (
              <button
                key={s.id}
                type="button"
                className={`replay-btn tiny${s.id === baseId ? ' active' : ''}`}
                onClick={() => changeBase(s.id)}
              >
                {s.title}
              </button>
            ))}
          </span>
          <button type="button" className="replay-btn tiny" onClick={() => setFitKey((k) => k + 1)}>
            Pas in beeld
          </button>
          {dirty && (
            <button
              type="button"
              className="replay-btn tiny"
              onClick={() => {
                clearDraft();
                changeBase(baseId);
              }}
            >
              Begin opnieuw
            </button>
          )}
        </div>

        <div className="map-wrap">
          <BuilderView
            getScene={getScene}
            onDragHandle={dragHandle}
            fitKey={`${baseId}-${fitKey}`}
            fitBounds={extentOf(draft)}
          />
        </div>

        <div className="builder-scrub">
          <label>
            Tijd
            <input
              type="range"
              min={0}
              max={Math.max(duration, 0.1)}
              step={0.05}
              value={Math.min(time, duration)}
              onChange={(e) => setTime(Number(e.target.value))}
            />
          </label>
          <span className="replay-time">
            {time.toFixed(1).replace('.', ',')}s / {duration.toFixed(1).replace('.', ',')}s
          </span>
          <span className="builder-note">
            Schuif door de ontmoeting: hier zie je waar het verkeer écht zit op het moment dat telt.
          </span>
        </div>
      </div>

      <aside className="sidebar">
        <header className="sidebar-header">
          <h2>Scenario bouwen</h2>
          <p>
            Afgeleid van <strong>{base.title}</strong>. De reeks, de vensters en de uitleg komen
            daarvandaan; hier verzet je de weg en het verkeer.
          </p>
        </header>

        <WorldForm draft={draft} onChange={setDraft} />

        <ActorList
          actors={draft.actors}
          onPatch={patchActor}
          onAdd={addActor}
          onRemove={removeActor}
          selected={hoveredActor}
          onSelect={setHoveredActor}
        />

        <ReeksEditor
          expected={draft.expected}
          actors={draft.actors}
          manoeuvre={draft.world.kind === 'junction' ? draft.world.manoeuvre : null}
          onChange={(expected) =>
            setDraft((d) => ({
              ...d,
              expected,
              // The order rule points at rule ids; one naming a step that has been deleted would
              // silently never fire again.
              sequence: { ...d.sequence, ids: d.sequence.ids.filter((id) => expected.some((e) => e.id === id)) },
            }))
          }
        />

        <BriefingEditor
          briefing={draft.briefing}
          onChange={(briefing) => setDraft((d) => ({ ...d, briefing }))}
        />

        <ValidationPanel {...validation} />

        <section className="sidebar-section">
          <h3>Bewaren en delen</h3>
          <p className="builder-note">
            Bewaarde scenario's staan in deze browser en verschijnen bij het rijden, naast de
            scenario's die meegeleverd worden. Wil je er een aan iemand anders geven, download hem
            dan als bestand.
          </p>
          <div className="builder-actions">
            <button type="button" className="primary-btn" onClick={doSave}>
              Bewaar
            </button>
            <button type="button" className="ghost-btn" onClick={doDownload}>
              Download
            </button>
            <button type="button" className="ghost-btn" onClick={doImport}>
              Open bestand
            </button>
          </div>
          {notice && (
            <p className={`builder-note builder-notice ${notice.tone}`}>{notice.text}</p>
          )}

          {saved.length > 0 && (
            <ul className="builder-saved">
              {saved.map((s) => (
                <li key={s.scenario.id}>
                  <span className="builder-saved-title">{s.scenario.title}</span>
                  <button
                    type="button"
                    className="replay-btn tiny"
                    onClick={() => onRide(s.scenario.id)}
                  >
                    Rijd
                  </button>
                  <button
                    type="button"
                    className="replay-btn tiny"
                    onClick={() => {
                      setDraft(s.scenario);
                      setBaseId(s.scenario.id);
                      setFitKey((k) => k + 1);
                      setNotice(null);
                    }}
                  >
                    Bewerk
                  </button>
                  <button
                    type="button"
                    className="ghost-btn tiny"
                    onClick={() => doDelete(s.scenario.id)}
                  >
                    Weg
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="sidebar-section">
          <h3>Naar de broncode</h3>
          <p className="builder-note">
            Voor wie het scenario in de simulator zelf wil opnemen, in plaats van alleen in deze
            browser. Hier komt TypeScript uit; je hebt de repository nodig om er iets mee te doen.
          </p>
          <button type="button" className="ghost-btn" onClick={doExport}>
            Maak er een bestand van
          </button>
          {exported && (
            <>
              <p className="builder-note">
                Zet dit in <code>src/sim/</code> en voeg één regel toe aan{' '}
                <code>ALL_SCENARIOS</code>.
              </p>
              <textarea className="builder-export" readOnly value={exported} rows={16} />
              <button
                type="button"
                className="ghost-btn"
                onClick={() => navigator.clipboard?.writeText(exported)}
              >
                Kopieer
              </button>
            </>
          )}
        </section>
      </aside>
    </div>
  );
}
