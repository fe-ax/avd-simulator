/**
 * Canvas host for the first-person stage. Owns its own animation frame and the three.js
 * lifecycle, the same division of labour `MapView` has for the plan view: neither the engine nor
 * React learns anything about pixels.
 */
import { useEffect, useRef } from 'react';
import { Stage, type HeadPose } from '../scene/Stage';
import type { Scenario, WorldView } from '../sim/types';

interface Props {
  scenario: Scenario;
  getView: () => WorldView | null;
  getHead: () => HeadPose;
  /** Called once per frame with elapsed seconds, before the scene is synced. */
  onFrame?: (dt: number) => void;
}

export function RideView({ scenario, getView, getHead, onFrame }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const getViewRef = useRef(getView);
  const getHeadRef = useRef(getHead);
  const onFrameRef = useRef(onFrame);
  getViewRef.current = getView;
  getHeadRef.current = getHead;
  onFrameRef.current = onFrame;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const stage = new Stage(canvas, scenario);
    let raf = 0;
    let last = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      stage.resize(rect.width, rect.height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const renderFrame = (dt: number) => {
      onFrameRef.current?.(dt);
      const view = getViewRef.current();
      if (!view) return;
      stage.sync(view, getHeadRef.current());
      stage.render();
    };

    if (import.meta.env.DEV) {
      Object.assign(window, {
        __stage: stage,
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
      stage.dispose();
    };
  }, [scenario]);

  return <canvas ref={canvasRef} className="ride-canvas" />;
}
