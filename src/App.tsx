import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useControls } from './hooks/useControls';
import { useEngine } from './hooks/useEngine';
import { poseAt } from './sim/route';
import { listRuns, saveRun } from './sim/recorder';
import { ReplayPlayer } from './sim/replay';
import { ALL_SCENARIOS, DEFAULT_SCENARIO, scenarioById } from './sim/scenarios';
import { scoreRun } from './sim/scoring';
import type { RunRecord, Scenario, WorldView } from './sim/types';
import { HeadController } from './scene/head';
import type { SceneOptions } from './render/drawScene';
import { BriefingModal } from './ui/BriefingModal';
import { ControlPanel } from './ui/ControlPanel';
import { Debrief } from './ui/Debrief';
import { Hud } from './ui/Hud';
import { MapView } from './ui/MapView';
import { RideView } from './ui/RideView';
import type { CheckState } from './ui/CheckStrip';
import { RunHistory } from './ui/RunHistory';
import { RideSettings } from './ui/RideSettings';
import { Builder } from './ui/builder/Builder';
import { Timeline } from './ui/Timeline';

/** How often the replay playhead is pushed into React while playing. */
const PLAYHEAD_INTERVAL_MS = 50;

/**
 * A request to open a saved run, handed down to the session that will show it.
 *
 * `seq` is what makes opening the same run a second time a new request. Without it, re-opening
 * the run you just closed would be indistinguishable from the one already open, and nothing
 * would happen.
 */
interface OpenRequest {
  run: RunRecord;
  seq: number;
}

/**
 * Which scenario is being ridden lives here, and the session below is keyed by it.
 *
 * The engine, the head controller and the three.js stage are each built once from the scenario
 * they belong to, so switching scenario is a remount rather than a reset: an armed countdown, a
 * half-played replay, a camera still easing toward the old road — none of it can leak across,
 * because none of it exists afterwards. Only the two settings the student chose are lifted out,
 * since those say how they want to practise, not which exercise they are practising.
 */
export default function App() {
  // The builder is a different job, not a different mode of the same screen — so it is a sibling
  // of the session rather than a flag inside it. The hash makes it linkable and survives a reload,
  // which matters when you are iterating on a scenario and reloading constantly.
  const [building, setBuilding] = useState(() => window.location.hash === '#bouwen');
  const [scenarioId, setScenarioId] = useState(DEFAULT_SCENARIO.id);
  const [timeScale, setTimeScale] = useState(1);
  const [autoSteer, setAutoSteer] = useState(true);
  const [openRequest, setOpenRequest] = useState<OpenRequest | null>(null);
  const seq = useRef(0);

  // An id that is not in the registry can only come from a stale one; ride something rather
  // than render nothing.
  const scenario = scenarioById(scenarioId) ?? DEFAULT_SCENARIO;

  const chooseScenario = useCallback((id: string) => {
    setScenarioId(id);
    // Any pending run belongs to the session that is about to be thrown away.
    setOpenRequest(null);
  }, []);

  const openRun = useCallback((run: RunRecord) => {
    // A saved run is replayed against the scenario it was recorded in, so opening one that
    // belongs elsewhere moves the whole session there. Otherwise "Opnieuw rijden", sitting right
    // under the debrief, would start a different exercise than the one being discussed.
    const owner = scenarioById(run.scenarioId);
    if (owner) setScenarioId(owner.id);
    seq.current += 1;
    setOpenRequest({ run, seq: seq.current });
  }, []);

  const setMode = useCallback((next: boolean) => {
    setBuilding(next);
    window.location.hash = next ? '#bouwen' : '';
  }, []);

  useEffect(() => {
    const onHash = () => setBuilding(window.location.hash === '#bouwen');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (building) return <Builder onExit={() => setMode(false)} />;

  return (
    <Session
      key={scenario.id}
      onBuild={() => setMode(true)}
      scenario={scenario}
      onScenarioChange={chooseScenario}
      openRequest={openRequest}
      onOpenRun={openRun}
      timeScale={timeScale}
      onTimeScaleChange={setTimeScale}
      autoSteer={autoSteer}
      onAutoSteerChange={setAutoSteer}
    />
  );
}

interface SessionProps {
  scenario: Scenario;
  onBuild: () => void;
  onScenarioChange: (id: string) => void;
  openRequest: OpenRequest | null;
  onOpenRun: (run: RunRecord) => void;
  timeScale: number;
  onTimeScaleChange: (value: number) => void;
  autoSteer: boolean;
  onAutoSteerChange: (value: boolean) => void;
}

/** One scenario, from its briefing to the debrief of a run in it. */
function Session({
  scenario,
  onBuild,
  onScenarioChange,
  openRequest,
  onOpenRun,
  timeScale,
  onTimeScaleChange,
  autoSteer,
  onAutoSteerChange,
}: SessionProps) {
  const { engine, snapshot, start, toBriefing } = useEngine(scenario);

  const [record, setRecord] = useState<RunRecord | null>(null);
  /**
   * The scenario the open record was recorded in, resolved from its id — not the scenario being
   * ridden. Null when nothing is open, and null for a run whose scenario has since been removed
   * from the registry, which is a state the screen has to keep showing rather than paper over.
   */
  const [replayScenario, setReplayScenario] = useState<Scenario | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>(() => listRuns());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replayTime, setReplayTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [debug, setDebug] = useState(false);
  const [replayRate, setReplayRate] = useState(1);
  const [replayView, setReplayView] = useState<'top' | 'first'>('top');
  const [resetKey, setResetKey] = useState(0);

  const playerRef = useRef<ReplayPlayer | null>(null);
  const headRef = useRef<HeadController | null>(null);
  if (headRef.current === null) headRef.current = new HeadController();
  const head = headRef.current;
  // The engine reads the pose by reference, so perception always sees where the rider is looking
  // without anything having to push it in every frame.
  engine.headPose = head.pose;
  const [looking, setLooking] = useState(false);
  const [checks, setChecks] = useState<CheckState[]>([]);
  const lastPlayheadPush = useRef(0);

  const conflictPoint = useMemo(
    () => poseAt(engine.routes.turn, engine.routes.conflictS),
    [engine],
  );

  const riding = record === null && snapshot.phase !== 'briefing';
  /** An open run whose scenario is gone: everything in the record still reads, the world cannot. */
  const orphan = record !== null && replayScenario === null ? record : null;

  // -------------------------------------------------------------------------

  const handleStart = useCallback(() => {
    setRecord(null);
    setReplayScenario(null);
    setSelectedId(null);
    setReplayTime(0);
    setPlaying(false);
    playerRef.current = null;
    setReplayView('top');
    setResetKey((k) => k + 1);
    head.reset();
    engine.debugEnabled = debug;
    engine.timeScale = timeScale;
    engine.autoSteer = autoSteer;
    start((raw) => {
      const scored = scoreRun(raw, scenario);
      const full: RunRecord = { ...raw, ...scored };
      const player = new ReplayPlayer(full, scenario);
      player.rate = replayRate;
      playerRef.current = player;
      setRecord(full);
      setReplayScenario(scenario);
      setRuns(saveRun(full));
    });
  }, [autoSteer, debug, engine, head, replayRate, scenario, start, timeScale]);

  const handleNewRun = useCallback(() => {
    playerRef.current = null;
    setRecord(null);
    setReplayScenario(null);
    setSelectedId(null);
    setPlaying(false);
    setResetKey((k) => k + 1);
    toBriefing();
  }, [toBriefing]);

  const openRun = useCallback(
    (run: RunRecord) => {
      // Resolved from the record, never from the scenario on screen. A ReplayPlayer built on the
      // wrong scenario draws the wrong road and, because it looks its actor specs up by id,
      // quietly leaves out every road user the other scenario never defined — which replays as a
      // clean ride rather than as a broken one.
      const owner = scenarioById(run.scenarioId);
      const player = owner ? new ReplayPlayer(run, owner) : null;
      if (player) player.rate = replayRate;
      playerRef.current = player;
      setReplayScenario(owner);
      setRecord(run);
      setReplayTime(0);
      setPlaying(false);
      setSelectedId(null);
      setReplayView('top');
      setResetKey((k) => k + 1);
    },
    [replayRate],
  );

  // Opening is driven from above so that a run from another scenario can remount this session
  // into its scenario first. Held in a ref because the request is the trigger: re-running this
  // on a replay-rate change would rewind the replay the student is halfway through.
  const openRunRef = useRef(openRun);
  openRunRef.current = openRun;
  useEffect(() => {
    if (openRequest) openRunRef.current(openRequest.run);
  }, [openRequest]);

  const seek = useCallback((t: number) => {
    const player = playerRef.current;
    if (!player) return;
    player.pause();
    player.seek(t);
    setPlaying(false);
    setReplayTime(player.t);
  }, []);

  const changeReplayRate = useCallback((rate: number) => {
    setReplayRate(rate);
    if (playerRef.current) playerRef.current.rate = rate;
  }, []);

  const togglePlay = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    player.toggle();
    setPlaying(player.playing);
  }, []);

  useControls(engine, riding);

  // Dev handle: lets a scripted run drive the exact same dispatch path the UI uses, which is
  // how the scenario windows get tuned without clicking through a 20-second ride by hand.
  // `player.scenario` next to `scenario` is what makes "is this run being replayed against its
  // own world?" answerable from the console.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    Object.assign(window, {
      __avd: {
        engine,
        scenario,
        start: handleStart,
        record,
        routes: engine.routes,
        player: playerRef.current,
        replayScenario,
        scenarios: ALL_SCENARIOS,
        scenarioById,
      },
    });
  }, [engine, handleStart, record, replayScenario, scenario]);

  // -------------------------------------------------------------------------

  const onFrame = useCallback((dt: number) => {
    const player = playerRef.current;
    if (!player?.playing) return;
    player.tick(dt);
    const now = performance.now();
    if (now - lastPlayheadPush.current > PLAYHEAD_INTERVAL_MS || !player.playing) {
      lastPlayheadPush.current = now;
      setReplayTime(player.t);
      setPlaying(player.playing);
    }
  }, []);

  /** The live world, as both views want it. */
  const getLiveView = useCallback((): WorldView => {
    const world = engine.world(false);
    return {
      world: world.scenario.world,
      time: engine.t,
      pose: world.bike.pose,
      speedFactor: world.bike.speed / (scenario.speedLimitKmh / 3.6),
      speedKmh: world.bike.speed * 3.6,
      gear: world.bike.gear,
      targetSpeedKmh: Math.round(world.bike.targetSpeed * 3.6),
      indicator: world.bike.indicator,
      braking: world.bike.brake,
      actors: world.actors,
      head: world.head,
    };
  }, [engine, scenario.speedLimitKmh]);

  const getScene = useCallback((): { world: WorldView; opts: SceneOptions } | null => {
    const player = playerRef.current;
    if (player) {
      return {
        world: player.scene(),
        opts: {
          time: player.t,
          // Replay is the god view: this is where the student sees what they never looked at.
          revealAll: true,
          highlightUnseen: true,
          showConflictMarker: debug,
          conflictPoint,
        },
      };
    }
    // A record with no player is a run whose world is gone. Falling through to the live view
    // would draw this scenario's road under that run's name.
    if (record !== null) return null;
    return {
      world: getLiveView(),
      opts: {
        time: engine.t,
        revealAll: false,
        highlightUnseen: false,
        showConflictMarker: debug,
        conflictPoint,
      },
    };
  }, [conflictPoint, debug, engine, getLiveView, record]);

  // -------------------------------------------------------------------------

  return (
    <div className="app">
      <div className="stage">
        <div className="map-wrap">
          {record === null ? (
            <RideView
              scenario={scenario}
              getView={getLiveView}
              head={head}
              onLook={(control) => engine.dispatch(control, 'press', 'gaze')}
              onChecks={setChecks}
              onLockChange={setLooking}
            />
          ) : orphan ? (
            <div className="replay-missing">
              <strong>Herhaling niet beschikbaar</strong>
              <p>
                Deze rit is gereden in <em>{orphan.scenarioTitle}</em> ({orphan.scenarioId}). Dat
                scenario zit niet meer in deze versie van de simulator, en zonder de weg en de
                weggebruikers die erbij horen valt er niets te tonen.
              </p>
              <p className="replay-missing-note">
                De nabespreking hiernaast klopt wel: die zit volledig in de opname zelf.
              </p>
            </div>
          ) : replayView === 'first' && replayScenario ? (
            <RideView
              scenario={replayScenario}
              getView={() => playerRef.current?.scene() ?? null}
              onFrame={onFrame}
            />
          ) : (
            <MapView getScene={getScene} resetKey={resetKey} onFrame={onFrame} />
          )}
          {riding && (
            <Hud
              snapshot={snapshot}
              onTogglePause={() => {
                engine.paused = !engine.paused;
              }}
              onStep={(seconds) => engine.advance(seconds)}
            />
          )}
          {riding && !looking && (
            <div className="look-prompt">
              <strong>Klik om rond te kijken</strong>
              <span>Daarna draait de muis je hoofd · Esc laat weer los · slepen werkt ook</span>
            </div>
          )}
          {record === null && snapshot.phase !== 'riding' && (
            <BriefingModal
              scenario={scenario}
              scenarios={ALL_SCENARIOS}
              onScenarioChange={onScenarioChange}
              onStart={handleStart}
              countdown={snapshot.phase === 'countdown' ? snapshot.countdown : null}
              timeScale={timeScale}
              onTimeScaleChange={onTimeScaleChange}
              autoSteer={autoSteer}
              onAutoSteerChange={onAutoSteerChange}
            />
          )}
          {record && !orphan && (
            <div className="replay-bar">
              <button type="button" className="replay-btn" onClick={() => seek(0)} title="Naar begin">
                ⏮
              </button>
              <button type="button" className="replay-btn" onClick={() => seek(replayTime - 0.5)}>
                −0,5s
              </button>
              <button type="button" className="replay-btn primary" onClick={togglePlay}>
                {playing ? '⏸ Pauze' : '▶ Afspelen'}
              </button>
              <button type="button" className="replay-btn" onClick={() => seek(replayTime + 0.5)}>
                +0,5s
              </button>
              <span className="replay-time">
                {replayTime.toFixed(1).replace('.', ',')}s / {record.durationS.toFixed(1).replace('.', ',')}s
              </span>
              <span className="replay-rates">
                {[0.25, 0.5, 1].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    className={`replay-btn tiny${replayRate === rate ? ' active' : ''}`}
                    onClick={() => changeReplayRate(rate)}
                  >
                    {rate === 1 ? '1×' : `${rate.toString().replace('.', ',')}×`}
                  </button>
                ))}
              </span>
              <span className="replay-views">
                {(
                  [
                    ['top', 'Bovenaanzicht'],
                    ['first', 'Vanuit het zadel'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`replay-btn tiny${replayView === id ? ' active' : ''}`}
                    onClick={() => setReplayView(id)}
                  >
                    {label}
                  </button>
                ))}
              </span>
              <span className="replay-note">
                {replayView === 'top'
                  ? 'Herhaling toont ook wat je niet gezien hebt'
                  : 'Het kruisje staat waar je werkelijk keek'}
              </span>
            </div>
          )}
        </div>

        {record ? (
          <Timeline
            record={record}
            currentTime={replayTime}
            onSeek={seek}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        ) : (
          <ControlPanel
            engine={engine}
            enabled={snapshot.phase === 'riding'}
            activeGazes={snapshot.activeGazes}
            indicator={snapshot.indicator}
            autoSteer={autoSteer}
            checks={checks}
          />
        )}
      </div>

      <aside className="sidebar">
        <header className="sidebar-header">
          <h2>{orphan ? orphan.scenarioTitle : scenario.title}</h2>
          <p>
            {orphan
              ? 'Dit scenario bestaat niet meer in deze versie van de simulator.'
              : scenario.briefing.assignment}
          </p>
        </header>

        {record ? (
          <>
            <RideSettings
              scenario={scenario}
              timeScale={timeScale}
              onTimeScale={onTimeScaleChange}
              autoSteer={autoSteer}
              onAutoSteer={onAutoSteerChange}
              compact
            />
            <div className="sidebar-actions">
              <button type="button" className="primary-btn" onClick={handleStart}>
                {orphan ? `Rijd ${scenario.title}` : 'Opnieuw rijden'}
              </button>
              <button type="button" className="ghost-btn" onClick={handleNewRun}>
                Terug naar briefing
              </button>
            </div>
            <Debrief
              record={record}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onSeek={seek}
            />
          </>
        ) : (
          <div className="sidebar-idle">
            <p>
              Zodra je de rit start rijdt de motor vanzelf verder. Jij bepaalt wanneer je kijkt,
              richting aangeeft, remt en schakelt.
            </p>
            <p className="sidebar-warn">
              Kijken doe je met de muis, niet met een knop. Wat je niet bekijkt, heb je niet
              gezien — en dat rekent de nabespreking je aan.
            </p>
          </div>
        )}

        <section className="sidebar-section">
          <h3>Eerdere ritten</h3>
          <RunHistory
            runs={runs}
            currentId={record?.id ?? null}
            onOpen={onOpenRun}
            onChange={setRuns}
          />
        </section>

        <footer className="sidebar-footer">
          <label>
            <input
              type="checkbox"
              checked={debug}
              onChange={(e) => {
                setDebug(e.target.checked);
                engine.debugEnabled = e.target.checked;
              }}
            />
            Debug-overlay
          </label>
          <button type="button" className="ghost-btn tiny" onClick={onBuild}>
            Scenario bouwen
          </button>
        </footer>
      </aside>
    </div>
  );
}
