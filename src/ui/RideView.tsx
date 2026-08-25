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
import type { HeadController } from '../scene/head';
import type { LookControl, Scenario, WorldView } from '../sim/types';

interface Props {
  scenario: Scenario;
  getView: () => WorldView | null;
  head: HeadController;
  /** Called when a dwell completes. The only way a look enters the simulation. */
  onLook: (control: LookControl) => void;
  onLockChange?: (locked: boolean) => void;
  /** Called once per frame with elapsed seconds, before the scene is synced. */
  onFrame?: (dt: number) => void;
}

export function RideView({ scenario, getView, head, onLook, onLockChange, onFrame }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const onLookRef = useRef(onLook);
  onLookRef.current = onLook;
  const getViewRef = useRef(getView);
  const onFrameRef = useRef(onFrame);
  const onLockChangeRef = useRef(onLockChange);
  getViewRef.current = getView;
  onFrameRef.current = onFrame;
  onLockChangeRef.current = onLockChange;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const stage = new Stage(canvas, scenario);
    const gaze = new GazeTargets(stage.bike);
    const overlay = new GazeOverlay(wrapRef.current!);
    const detachHead = head.attach(canvas, (locked) => onLockChangeRef.current?.(locked));
    let raf = 0;
    let last = performance.now();

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
      head.update(dt);
      const view = getViewRef.current();
      if (!view) return;
      stage.sync(view, head.pose);

      // The camera has to be where it will be rendered from before the dots are measured against
      // it, so this runs after sync and before the draw.
      stage.camera.updateMatrixWorld(true);
      gaze.update(dt, stage.camera, viewport, (control) => onLookRef.current(control));
      for (const side of MIRROR_SIDES) {
        stage.mirrors.setFocus(side, gaze.focusFor(side, stage.mirrors.getFocus(side), dt));
      }
      overlay.update(gaze.states());

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
      cancelAnimationFrame(raf);
      observer.disconnect();
      detachHead();
      overlay.dispose();
      stage.dispose();
    };
  }, [head, scenario]);

  return (
    <div className="ride-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} className="ride-canvas" />
    </div>
  );
}
