/**
 * Bridges the 120 Hz engine to React. The snapshot is throttled hard: the canvas redraws every
 * frame straight from engine state, so React only needs enough updates to keep the HUD honest.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { SimEngine, type EngineSnapshot } from '../sim/engine';
import type { RunRecord, Scenario } from '../sim/types';

const SNAPSHOT_INTERVAL_MS = 70;

export function useEngine(scenario: Scenario) {
  const engineRef = useRef<SimEngine | null>(null);
  if (engineRef.current === null) engineRef.current = new SimEngine(scenario);
  const engine = engineRef.current;

  const [snapshot, setSnapshot] = useState<EngineSnapshot>(() => engine.snapshot());
  const lastPushRef = useRef(0);
  const lastPhaseRef = useRef(engine.phase);

  useEffect(() => {
    engine.setFrameCallback(() => {
      const now = performance.now();
      // A phase change always goes through immediately — the briefing, the countdown and the
      // debrief must never lag a frame behind the simulation.
      const phaseChanged = engine.phase !== lastPhaseRef.current;
      if (!phaseChanged && now - lastPushRef.current < SNAPSHOT_INTERVAL_MS) return;
      lastPhaseRef.current = engine.phase;
      lastPushRef.current = now;
      setSnapshot(engine.snapshot());
    });
    return () => {
      engine.setFrameCallback(() => {});
      engine.stop();
    };
  }, [engine]);

  const start = useCallback(
    (onFinish: (record: RunRecord) => void) => {
      engine.start(onFinish, new Date().toISOString());
      setSnapshot(engine.snapshot());
    },
    [engine],
  );

  const toBriefing = useCallback(() => {
    engine.toBriefing();
    setSnapshot(engine.snapshot());
  }, [engine]);

  return { engine, snapshot, start, toBriefing };
}
