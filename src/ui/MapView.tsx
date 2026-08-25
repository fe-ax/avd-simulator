/**
 * Canvas host. Owns its own animation frame and camera so that neither the engine nor React
 * has to know about pixels. `getScene` is read fresh every frame, which lets the same component
 * render the live ride and the replay without a branch anywhere else.
 */
import { useEffect, useRef } from 'react';
import { Camera } from '../render/camera';
import { drawScene, type SceneOptions, type SceneWorld } from '../render/drawScene';

interface Props {
  getScene: () => { world: SceneWorld; opts: SceneOptions } | null;
  /** Change this to snap the camera instead of easing it — e.g. when a new run starts. */
  resetKey: string | number;
  /** Called once per frame with the elapsed seconds, so a replay can advance its clock. */
  onFrame?: (dt: number) => void;
}

export function MapView({ getScene, resetKey, onFrame }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef(new Camera());
  const getSceneRef = useRef(getScene);
  const onFrameRef = useRef(onFrame);
  getSceneRef.current = getScene;
  onFrameRef.current = onFrame;

  useEffect(() => {
    cameraRef.current.reset();
  }, [resetKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const camera = cameraRef.current;

    let raf = 0;
    let last = performance.now();

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      camera.resize(rect.width, rect.height);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const renderFrame = (dt: number) => {
      onFrameRef.current?.(dt);
      const scene = getSceneRef.current();
      if (!scene) return;
      camera.follow(
        scene.world.pose.x,
        scene.world.pose.y,
        scene.world.pose.heading,
        scene.world.speedFactor,
        dt,
      );
      drawScene(ctx, camera, scene.world, scene.opts);
    };

    // Dev handles: the camera is the one piece of state that lives neither in the engine nor in
    // React, and a browser that throttles animation frames (a hidden tab) otherwise makes it
    // impossible to settle a frame deterministically while debugging.
    if (import.meta.env.DEV) {
      Object.assign(window, {
        __cam: camera,
        __frames: (n = 30, dt = 1 / 60) => {
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
    };
  }, []);

  return <canvas ref={canvasRef} className="map-canvas" />;
}
