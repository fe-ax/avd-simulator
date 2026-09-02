/**
 * Canvas host for the first-person stage. Owns its own animation frame and the three.js
 * lifecycle, the same division of labour `MapView` has for the plan view: neither the engine nor
 * React learns anything about pixels.
 */
import { useEffect, useRef } from 'react';
import { Stage } from '../scene/Stage';
import { GazeOverlay } from '../scene/gazeOverlay';
import { GazeTargets } from '../scene/gazeTargets';
import { MIRROR_SIDES } from '../scene/mirrors';
import { mirrorInFocus } from '../sim/perception';
import type { HeadController } from '../scene/head';
import type { Conditions } from '../scene/sky';
import type { LookControl, Scenario, WorldView } from '../sim/types';
import type { CheckState } from './CheckStrip';

/** How often the dot states are pushed into React. Enough to read, far short of every frame. */
const CHECK_INTERVAL_MS = 90;

interface Props {
  scenario: Scenario;
  getView: () => WorldView | null;
  /**
   * Present while riding, absent while replaying. Where the head *points* always comes from the
   * view itself, so a recorded run drives the camera through exactly the same path as a live one;
   * this only decides whether the mouse gets to move it.
   */
  head?: HeadController;
  /** Called when a dwell completes. The only way a look enters the simulation. */
  onLook?: (control: LookControl) => void;
  /** Throttled report of the dots, for the check strip. */
  onChecks?: (states: CheckState[]) => void;
  onLockChange?: (locked: boolean) => void;
  /** Called once per frame with elapsed seconds, before the scene is synced. */
  onFrame?: (dt: number) => void;
  /**
   * Light and surface only, never visibility.
   *
   * Not part of `WorldView`: that contract is for things the simulation knows, and the weather is
   * something the *viewer* chooses. It changes nothing scored, so a run replayed on a different
   * day looks different and grades the same.
   */
  conditions?: Conditions;
}

export function RideView({ scenario, getView, head, onLook, onChecks, onLockChange, onFrame,
  conditions = 'helder',
}: Props) {
  const interactive = head !== undefined;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const onLookRef = useRef(onLook);
  const onChecksRef = useRef(onChecks);
  onLookRef.current = onLook;
  onChecksRef.current = onChecks;
  const getViewRef = useRef(getView);
  const onFrameRef = useRef(onFrame);
  const onLockChangeRef = useRef(onLockChange);
  const conditionsRef = useRef(conditions);
  const stageRef = useRef<Stage | null>(null);
  getViewRef.current = getView;
  conditionsRef.current = conditions;
  onFrameRef.current = onFrame;
  onLockChangeRef.current = onLockChange;

  // Applied without rebuilding the stage: rebuilding on a weather change would drop the world and
  // the ride with it, for something that is one uniform and a handful of light values.
  useEffect(() => {
    stageRef.current?.setConditions(conditions);
  }, [conditions]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const stage = new Stage(canvas, scenario);
    stageRef.current = stage;
    stage.setConditions(conditionsRef.current);
    const gaze = new GazeTargets(stage.bike);
    const overlay = new GazeOverlay(wrapRef.current!, interactive);
    const detachHead = head?.attach(canvas, (locked) => onLockChangeRef.current?.(locked));
    let raf = 0;
    let last = performance.now();
    let lastChecks = 0;

    let viewport = { width: 1, height: 1 };
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      viewport = { width: rect.width, height: rect.height };
      stage.resize(rect.width, rect.height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const renderFrame = (dt: number) => {
      onFrameRef.current?.(dt);
      const view = getViewRef.current();
      if (!view) return;
      stage.sync(view, view.head);

      // The camera has to be where it will be rendered from before the dots are measured against
      // it, so this runs after sync and before the draw.
      stage.camera.updateMatrixWorld(true);

      if (interactive) {
        gaze.update(dt, stage.camera, view.head, viewport, (control) => onLookRef.current?.(control));
        for (const side of MIRROR_SIDES) {
          stage.mirrors.setFocus(side, gaze.focusFor(side, stage.mirrors.getFocus(side), dt));
        }
        overlay.update(gaze.states());
      } else {
        // Replaying: the mirrors clear exactly when the recorded head was pointed at them, and
        // the reticle at the centre of the frame is literally where the rider was looking.
        for (const side of MIRROR_SIDES) {
          const wanted = mirrorInFocus(view.head, side) ? 1 : 0;
          const current = stage.mirrors.getFocus(side);
          stage.mirrors.setFocus(side, current + (wanted - current) * (1 - Math.exp(-dt * 9)));
        }
      }

      const now = performance.now();
      if (interactive && now - lastChecks > CHECK_INTERVAL_MS) {
        lastChecks = now;
        onChecksRef.current?.(
          gaze.states().map((s) => ({
            control: s.control,
            under: s.under,
            dwell: s.dwell,
            freshness: s.freshness,
          })),
        );
      }

      stage.render();
    };

    if (import.meta.env.DEV) {
      Object.assign(window, {
        __stage: stage,
        __head: head,
        __gaze: gaze,
        __frames3d: (n = 30, dt = 1 / 60) => {
          for (let i = 0; i < n; i++) renderFrame(dt);
        },
      });
    }

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      renderFrame(dt);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      stageRef.current = null;
      cancelAnimationFrame(raf);
      observer.disconnect();
      detachHead?.();
      overlay.dispose();
      stage.dispose();
    };
  }, [head, interactive, scenario]);

  return (
    <div className="ride-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} className="ride-canvas" />
    </div>
  );
}
