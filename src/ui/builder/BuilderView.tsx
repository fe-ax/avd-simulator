/**
 * The builder's canvas: a flat plan of the scenario you can pan, zoom and drag things on.
 *
 * Modelled on `MapView` — its own animation frame, its own camera, and a `getScene` read fresh
 * every frame so React never has to re-render to move a pixel. The differences are that the
 * camera is orthographic and that pointers do something.
 */
import { useCallback, useEffect, useRef } from 'react';
import { PlanCamera } from '../../render/planCamera';
import { drawScene, type SceneOptions } from '../../render/drawScene';
import {
  drawActorPaths,
  drawHandles,
  drawRoute,
  handleAt,
  type Handle,
} from '../../render/builderOverlay';
import type { ScenarioRoutes } from '../../sim/route';
import type { ActorSpec, Vec2, WorldView } from '../../sim/types';

export interface BuilderScene {
  world: WorldView;
  opts: SceneOptions;
  routes: ScenarioRoutes | null;
  actors: readonly ActorSpec[];
  handles: readonly Handle[];
}

interface Props {
  getScene: () => BuilderScene | null;
  /** Called while a handle is dragged, with the world point under the cursor. */
  onDragHandle?: (id: string, to: Vec2) => void;
  /** Change this to re-frame the view — a new scenario, or the "pas in beeld" button. */
  fitKey: string | number;
  /** World box to frame when `fitKey` changes. */
  fitBounds?: { minX: number; maxX: number; minY: number; maxY: number };
}

export function BuilderView({ getScene, onDragHandle, fitKey, fitBounds }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef(new PlanCamera());
  const getSceneRef = useRef(getScene);
  const onDragRef = useRef(onDragHandle);
  getSceneRef.current = getScene;
  onDragRef.current = onDragHandle;

  /** Pointer state lives in a ref: a drag must not re-render React sixty times a second. */
  const pointer = useRef<{
    mode: 'none' | 'pan' | 'drag';
    handleId: string | null;
    hoverId: string | null;
    lastX: number;
    lastY: number;
  }>({ mode: 'none', handleId: null, hoverId: null, lastX: 0, lastY: 0 });

  const fitRef = useRef(fitBounds);
  fitRef.current = fitBounds;
  /**
   * Whether the opening frame has actually been applied.
   *
   * Not inferred from the camera having a width, which is what it used to be: a first measurement
   * can arrive with a real width and no height — a container that has not laid out vertically yet,
   * or a hidden tab — and that reading used up the one chance to fit while `fit` quietly refused
   * for want of a height. The builder then opened at the default zoom with the handles it tells
   * you to drag below the bottom of the canvas.
   */
  const fitted = useRef(false);

  useEffect(() => {
    const b = fitRef.current;
    if (b) fitted.current = cameraRef.current.fit(b);
  }, [fitKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const camera = cameraRef.current;

    let raf = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      camera.resize(rect.width, rect.height);
      // Keep trying until one of them takes.
      if (!fitted.current && fitRef.current) fitted.current = camera.fit(fitRef.current);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    // Dev handle, matching __stage / __head / __gaze: the camera is the only thing standing
    // between a world coordinate and a pixel, so without it nothing outside can aim at a handle.
    if (import.meta.env.DEV) {
      Object.assign(window, { __builder: { camera, canvas } });
    }

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const scene = getSceneRef.current();
      ctx.clearRect(0, 0, camera.width, camera.height);
      if (!scene) return;

      drawScene(ctx, camera, scene.world, scene.opts);
      if (scene.routes) drawRoute(ctx, camera, scene.routes);
      drawActorPaths(ctx, camera, scene.actors);
      drawHandles(
        ctx,
        camera,
        scene.handles.map((h) =>
          h.id === pointer.current.handleId || h.id === pointer.current.hoverId
            ? { ...h, active: true }
            : h,
        ),
      );
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  const local = (e: React.PointerEvent | React.WheelEvent) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = local(e);
    const scene = getSceneRef.current();
    const hit = scene ? handleAt(cameraRef.current, scene.handles, p.x, p.y) : null;
    pointer.current = {
      mode: hit ? 'drag' : 'pan',
      handleId: hit?.id ?? null,
      hoverId: hit?.id ?? null,
      lastX: p.x,
      lastY: p.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = local(e);
    const state = pointer.current;

    if (state.mode === 'none') {
      const scene = getSceneRef.current();
      const hit = scene ? handleAt(cameraRef.current, scene.handles, p.x, p.y) : null;
      state.hoverId = hit?.id ?? null;
      e.currentTarget.style.cursor = hit ? 'grab' : 'default';
      return;
    }

    if (state.mode === 'pan') {
      cameraRef.current.panBy(p.x - state.lastX, p.y - state.lastY);
    } else if (state.handleId) {
      onDragRef.current?.(state.handleId, cameraRef.current.unproject(p.x, p.y));
    }
    state.lastX = p.x;
    state.lastY = p.y;
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    pointer.current.mode = 'none';
    pointer.current.handleId = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    e.currentTarget.style.cursor = 'default';
  }, []);

  const onWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    const p = local(e);
    // Trackpads report small deltas continuously; a fixed step per notch would be unusable.
    cameraRef.current.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="builder-canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    />
  );
}
