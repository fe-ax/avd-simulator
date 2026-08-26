/**
 * What the builder draws on top of the scenario, over and above the road itself.
 *
 * The road, the markings and the vehicles all come from `drawScene` unchanged — this adds only
 * the things that are invisible while riding and are the whole subject while editing: the line
 * the machine actually takes, the point every window is measured from, and where each road user
 * comes from and goes to.
 *
 * Canvas work, deliberately outside React. It runs once per frame and has nothing to say about
 * state.
 */
import type { ViewCamera } from './camera';
import { poseAt, type ScenarioRoutes } from '../sim/route';
import type { ActorSpec, Vec2 } from '../sim/types';

const COLOURS = {
  route: 'rgba(120, 190, 255, 0.85)',
  routeCore: 'rgba(255, 255, 255, 0.55)',
  conflict: 'rgba(255, 96, 96, 0.95)',
  actorPath: 'rgba(255, 208, 120, 0.5)',
  handle: '#ffd078',
  handleActive: '#ffffff',
  handleRing: 'rgba(0, 0, 0, 0.55)',
};

/** A draggable point. The builder decides what each one means; this only draws it. */
export interface Handle {
  id: string;
  at: Vec2;
  /** Drawn larger and lit when the pointer is over it or it is being dragged. */
  active?: boolean;
  label?: string;
}

/** Screen radius of a handle, in CSS pixels. Also the hit radius, so they cannot disagree. */
export const HANDLE_RADIUS = 7;

function strokeWorldPath(
  ctx: CanvasRenderingContext2D,
  cam: ViewCamera,
  points: Vec2[],
  colour: string,
  width: number,
  dash: number[] = [],
) {
  if (points.length < 2) return;
  ctx.save();
  ctx.setLineDash(dash);
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  points.forEach((p, i) => {
    const s = cam.project(p.x, p.y);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.stroke();
  ctx.restore();
}

/**
 * The line the machine takes, sampled off the real route rather than approximated.
 *
 * This is the single most useful thing on the screen: a turn cuts the corner well before the
 * mouth of the side road, and every argument about what a kerb or a hedge may block is really an
 * argument about where this line goes.
 */
export function drawRoute(ctx: CanvasRenderingContext2D, cam: ViewCamera, routes: ScenarioRoutes) {
  const points: Vec2[] = [];
  const step = Math.max(0.5, routes.turn.total / 400);
  for (let s = 0; s <= routes.turn.total; s += step) {
    const p = poseAt(routes.turn, s);
    points.push({ x: p.x, y: p.y });
  }
  strokeWorldPath(ctx, cam, points, COLOURS.route, 3);
  strokeWorldPath(ctx, cam, points, COLOURS.routeCore, 1, [6, 6]);

  const conflict = poseAt(routes.turn, routes.conflictS);
  const s = cam.project(conflict.x, conflict.y);
  ctx.save();
  ctx.strokeStyle = COLOURS.conflict;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(s.x, s.y, 9, 0, Math.PI * 2);
  ctx.moveTo(s.x - 13, s.y);
  ctx.lineTo(s.x + 13, s.y);
  ctx.moveTo(s.x, s.y - 13);
  ctx.lineTo(s.x, s.y + 13);
  ctx.stroke();
  ctx.restore();
}

/** Where each road user comes from and where it is going, whether or not it is there yet. */
export function drawActorPaths(
  ctx: CanvasRenderingContext2D,
  cam: ViewCamera,
  actors: readonly ActorSpec[],
) {
  for (const actor of actors) {
    strokeWorldPath(ctx, cam, [actor.from, actor.to], COLOURS.actorPath, 2, [10, 8]);
  }
}

export function drawHandles(
  ctx: CanvasRenderingContext2D,
  cam: ViewCamera,
  handles: readonly Handle[],
) {
  ctx.save();
  ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const h of handles) {
    const s = cam.project(h.at.x, h.at.y);
    const r = h.active ? HANDLE_RADIUS + 2 : HANDLE_RADIUS;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fillStyle = h.active ? COLOURS.handleActive : COLOURS.handle;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLOURS.handleRing;
    ctx.stroke();
    if (h.label) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      const w = ctx.measureText(h.label).width + 10;
      ctx.fillRect(s.x - w / 2, s.y - r - 20, w, 15);
      ctx.fillStyle = '#fff';
      ctx.fillText(h.label, s.x, s.y - r - 9);
    }
  }
  ctx.restore();
}

/** Which handle is under a pixel, nearest first. Shares `HANDLE_RADIUS` with the drawing. */
export function handleAt(
  cam: ViewCamera,
  handles: readonly Handle[],
  px: number,
  py: number,
): Handle | null {
  let best: Handle | null = null;
  let bestDist = HANDLE_RADIUS + 4;
  for (const h of handles) {
    const s = cam.project(h.at.x, h.at.y);
    const d = Math.hypot(s.x - px, s.y - py);
    if (d <= bestDist) {
      bestDist = d;
      best = h;
    }
  }
  return best;
}
