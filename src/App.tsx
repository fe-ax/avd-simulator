import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useControls } from './hooks/useControls';
import { useEngine } from './hooks/useEngine';
import { poseAt } from './sim/route';
import { listRuns, saveRun } from './sim/recorder';
import { ReplayPlayer } from './sim/replay';
import { rechtsafFietspad } from './sim/scenario.rechtsaf-fietspad';
import { scoreRun } from './sim/scoring';
import type { RunRecord, WorldView } from './sim/types';
import { HeadController } from './scene/head';
import type { SceneOptions } from './render/drawScene';
import { BriefingModal } from './ui/BriefingModal';
import { ControlPanel } from './ui/ControlPanel';
import { Debrief } from './ui/Debrief';
import { Hud } from './ui/Hud';
import { MapView } from './ui/MapView';
import { RideView } from './ui/RideView';
import { RunHistory } from './ui/RunHistory';
import { RideSettings } from './ui/RideSettings';
import { Timeline } from './ui/Timeline';

/** How often the replay playhead is pushed into React while playing. */
const PLAYHEAD_INTERVAL_MS = 50;

export default function App() {
  const scenario = rechtsafFietspad;
  const { engine, snapshot, start, toBriefing } = useEngine(scenario);

  const [record, setRecord] = useState<RunRecord | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>(() => listRuns());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replayTime, setReplayTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [debug, setDebug] = useState(false);
  const [timeScale, setTimeScale] = useState(1);
  const [autoSteer, setAutoSteer] = useState(true);
  const [replayRate, setReplayRate] = useState(1);
  const [resetKey, setResetKey] = useState(0);

  const playerRef = useRef<ReplayPlayer | null>(null);
  const headRef = useRef<HeadController | null>(null);
  if (headRef.current === null) headRef.current = new HeadController();
  const head = headRef.current;
  // The engine reads the pose by reference, so perception always sees where the rider is looking
  // without anything having to push it in every frame.
  engine.headPose = head.pose;
  const [looking, setLooking] = useState(false);
  const lastPlayheadPush = useRef(0);

  const conflictPoint = useMemo(
    () => poseAt(engine.routes.turn, engine.routes.conflictS),
    [engine],
  );

  const riding = record === null && snapshot.phase !== 'briefing';

  // -------------------------------------------------------------------------

  const handleStart = useCallback(() => {
    setRecord(null);
    setSelectedId(null);
    setReplayTime(0);
    setPlaying(false);
    playerRef.current = null;
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
      setRuns(saveRun(full));
    });
  }, [autoSteer, debug, engine, head, replayRate, scenario, start, timeScale]);

  const handleNewRun = useCallback(() => {
    playerRef.current = null;
    setRecord(null);
    setSelectedId(null);
    setPlaying(false);
    setResetKey((k) => k + 1);
    toBriefing();
  }, [toBriefing]);

  const openRun = useCallback(
    (run: RunRecord) => {
      playerRef.current = new ReplayPlayer(run, scenario);
      playerRef.current.rate = replayRate;
      setRecord(run);
      setReplayTime(0);
      setPlaying(false);
      setSelectedId(null);
      setResetKey((k) => k + 1);
    },
    [replayRate, scenario],
  );

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
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    Object.assign(window, {
      __avd: { engine, scenario, start: handleStart, record, routes: engine.routes },
    });
  }, [engine, handleStart, record, scenario]);

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
      road: world.scenario.road,
      pose: world.bike.pose,
      speedFactor: world.bike.speed / (scenario.speedLimitKmh / 3.6),
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
  }, [conflictPoint, debug, engine, getLiveView]);

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
              onLockChange={setLooking}
            />
          ) : (
            <MapView getScene={getScene} resetKey={resetKey} onFrame={onFrame} />
          )}
          {riding && <Hud snapshot={snapshot} speedLimitKmh={scenario.speedLimitKmh} />}
          {riding && !looking && (
            <div className="look-prompt">
              <strong>Klik om rond te kijken</strong>
              <span>Beweeg de muis om je hoofd te draaien · Esc laat weer los</span>
            </div>
          )}
          {record === null && snapshot.phase !== 'riding' && (
            <BriefingModal
              scenario={scenario}
              onStart={handleStart}
              countdown={snapshot.phase === 'countdown' ? snapshot.countdown : null}
              timeScale={timeScale}
              onTimeScaleChange={setTimeScale}
              autoSteer={autoSteer}
              onAutoSteerChange={setAutoSteer}
            />
          )}
          {record && (
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
              <span className="replay-note">Herhaling toont ook wat je niet gezien hebt</span>
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
          />
        )}
      </div>

      <aside className="sidebar">
        <header className="sidebar-header">
          <h2>{scenario.title}</h2>
          <p>{scenario.briefing.assignment}</p>
        </header>

        {record ? (
          <>
            <RideSettings
              timeScale={timeScale}
              onTimeScale={setTimeScale}
              autoSteer={autoSteer}
              onAutoSteer={setAutoSteer}
              compact
            />
            <div className="sidebar-actions">
              <button type="button" className="primary-btn" onClick={handleStart}>
                Opnieuw rijden
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
              richting aangeeft, remt, schakelt en instuurt.
            </p>
            <p className="sidebar-warn">
              Op de kaart staat alleen wat jij hebt waargenomen. Wie niet kijkt, ziet niets.
            </p>
          </div>
        )}

        <section className="sidebar-section">
          <h3>Eerdere ritten</h3>
          <RunHistory runs={runs} currentId={record?.id ?? null} onOpen={openRun} onChange={setRuns} />
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
        </footer>
      </aside>
    </div>
  );
}
