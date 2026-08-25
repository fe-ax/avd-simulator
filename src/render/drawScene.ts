/**
 * Scene renderer. Draws the world the way the RIDER experiences it: an actor that has not been
 * perceived is simply not on the map. Replay flips `revealAll` on and draws what was really
 * there, which is where the lesson lands.
 *
 * Under the perspective camera a sprite is drawn flat and then squashed onto the ground plane by
 * the depth ratio for its own distance, so a motorcycle twenty metres up the road sits on the
 * tarmac rather than floating above it.
 */
import { FORWARD_VIEW, MIRROR_VIEW, mirrorInFocus } from '../sim/perception';
import type { ActorState, HeadPose, PoseOnRoute, WorldView } from '../sim/types';
import type { Camera } from './camera';
import { fillWorldPoly, type WorldPoint } from './paint';
import { drawRoad, PALETTE } from './roadArt';

type Ctx = CanvasRenderingContext2D;

export interface SceneOptions {
  /** Simulation seconds; drives blinkers and pulses so a replay looks identical. */
  time: number;
  /** God view: draw actors the rider never saw. */
  revealAll: boolean;
  /** Outline never-perceived actors in pulsing red (debrief and replay only). */
  highlightUnseen: boolean;
  showConflictMarker: boolean;
  conflictPoint?: { x: number; y: number };
}

export function drawScene(ctx: Ctx, cam: Camera, world: WorldView, opts: SceneOptions) {
  drawRoad(ctx, cam, world.world);

  if (opts.showConflictMarker && opts.conflictPoint) {
    const p = cam.project(opts.conflictPoint.x, opts.conflictPoint.y);
    if (p.q > 0) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,80,80,0.9)';
      ctx.fill();
    }
  }

  drawView(ctx, cam, world.pose, world.head);

  // Far actors first, so a nearer one overlaps the one behind it rather than the other way up.
  const visible = world.actors
    .filter((a) => a.perceived || opts.revealAll)
    .sort((a, b) => cam.toCamera(b.x, b.y).u - cam.toCamera(a.x, a.y).u);
  for (const actor of visible) {
    if (onScreen(cam, actor)) drawActor(ctx, cam, actor, opts, !actor.perceived);
    else drawEdgeMarker(ctx, cam, actor, world.pose, opts, !actor.perceived);
  }

  drawMotorcycle(ctx, cam, world.pose, world.indicator, world.braking, opts.time);
}

// ---------------------------------------------------------------------------

const EDGE_INSET = 20;

function onScreen(cam: Camera, actor: ActorState): boolean {
  const p = cam.project(actor.x, actor.y);
  if (p.q <= 0) return false;
  const margin = cam.scale * p.q * 1.5;
  return (
    p.x > -margin && p.x < cam.width + margin && p.y > -margin && p.y < cam.height + margin
  );
}

/**
 * A road user you have seen but that no longer fits in the frame — most often the snorfiets,
 * which spends the approach behind you. Dropping it silently would read as "it went away", so
 * it gets a chevron on the edge it lies beyond, with how far off it is.
 */
function drawEdgeMarker(
  ctx: Ctx,
  cam: Camera,
  actor: ActorState,
  riderPose: PoseOnRoute,
  opts: SceneOptions,
  neverSeen: boolean,
) {
  const { u, v } = cam.toCamera(actor.x, actor.y);
  // Screen space: forward is up, left is negative x.
  let dx = -v;
  let dy = -u;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  dx /= len;
  dy /= len;

  const cx = cam.width / 2;
  const cy = cam.height / 2;
  const tx = dx === 0 ? Infinity : ((dx > 0 ? cam.width - EDGE_INSET : EDGE_INSET) - cx) / dx;
  const ty = dy === 0 ? Infinity : ((dy > 0 ? cam.height - EDGE_INSET : EDGE_INSET) - cy) / dy;
  const t = Math.min(tx, ty);
  const mx = cx + dx * t;
  const my = cy + dy * t;

  const alarmed = actor.mode === 'braking' || actor.mode === 'stopped';
  const pulse = 0.5 + 0.5 * Math.sin(opts.time * 9);
  const color =
    neverSeen && opts.highlightUnseen
      ? `rgba(255,80,70,${0.5 + 0.5 * pulse})`
      : alarmed
        ? `rgba(255,59,48,${0.6 + 0.4 * pulse})`
        : 'rgba(236,234,227,0.72)';

  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(Math.atan2(dy, dx));
  ctx.beginPath();
  ctx.moveTo(9, 0);
  ctx.lineTo(-5, -7);
  ctx.lineTo(-5, 7);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = color;
  ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Distance from the RIDER, not from the camera: the camera drifts ahead with speed, and
  // "how far behind me is it" is the only reading that means anything here.
  const label = `${Math.round(Math.hypot(actor.x - riderPose.x, actor.y - riderPose.y))} m`;
  ctx.fillText(label, mx - dx * 18, my - dy * 18);
  ctx.textBaseline = 'alphabetic';
}

/** A wedge of view as a world-space polygon, so the perspective bends it along with the ground. */
function viewPolygon(
  pose: PoseOnRoute,
  centreDeg: number,
  halfAngleDeg: number,
  minDist: number,
  maxDist: number,
): WorldPoint[] {
  const a0 = pose.heading + ((centreDeg - halfAngleDeg) * Math.PI) / 180;
  const a1 = pose.heading + ((centreDeg + halfAngleDeg) * Math.PI) / 180;
  const steps = 18;
  const points: WorldPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    points.push({ x: pose.x + Math.cos(a) * maxDist, y: pose.y + Math.sin(a) * maxDist });
  }
  for (let i = steps; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / steps;
    points.push({ x: pose.x + Math.cos(a) * minDist, y: pose.y + Math.sin(a) * minDist });
  }
  return points;
}

/**
 * Where the rider was looking, drawn from above. One cone for the head and one wedge per mirror
 * being read — which is exactly what perception is computed from, so the picture cannot lie about
 * what was seen.
 */
function drawView(ctx: Ctx, cam: Camera, pose: PoseOnRoute, head: HeadPose) {
  const yawDeg = (head.yaw * 180) / Math.PI;
  fillWorldPoly(
    ctx,
    cam,
    viewPolygon(pose, yawDeg, FORWARD_VIEW.halfAngleDeg, 0, 60),
    'rgba(255,255,240,0.09)',
  );

  for (const side of ['left', 'right'] as const) {
    if (!mirrorInFocus(head, side)) continue;
    const axis = (side === 'left' ? 1 : -1) * (180 - MIRROR_VIEW.aimOutOfAsternDeg);
    fillWorldPoly(
      ctx,
      cam,
      viewPolygon(pose, axis, MIRROR_VIEW.halfAngleDeg, MIRROR_VIEW.minDist, 55),
      'rgba(255,231,146,0.2)',
    );
  }
}

// ---------------------------------------------------------------------------

/**
 * Run `draw` in a frame where one unit is one world metre, oriented with the sprite and laid
 * flat on the ground plane. Returns the projected centre so callers can add screen-space
 * decoration afterwards.
 */
function withPose(
  ctx: Ctx,
  cam: Camera,
  pose: PoseOnRoute,
  draw: () => void,
): { x: number; y: number; q: number } | null {
  const p = cam.project(pose.x, pose.y);
  if (p.q <= 0) return null;

  ctx.save();
  ctx.translate(p.x, p.y);
  // Squash first, then rotate inside the squashed space: that is exactly what laying a flat
  // top-down sprite onto a tilted ground plane does.
  ctx.scale(1, cam.depthRatioAt(p.q));
  ctx.rotate(-(pose.heading - cam.yaw) - Math.PI / 2);
  const s = cam.scale * p.q;
  ctx.scale(s, s);
  draw();
  ctx.restore();
  return p;
}

/** Rounded rectangle in the local (metres) frame, x forward, y left. */
function box(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, color: string) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawMotorcycle(
  ctx: Ctx,
  cam: Camera,
  pose: PoseOnRoute,
  indicator: 'left' | 'right' | 'off',
  braking: boolean,
  time: number,
) {
  const blinkOn = Math.floor(time * 2.6) % 2 === 0;
  withPose(ctx, cam, pose, () => {
    // Shadow keeps the bike legible against dark asphalt.
    box(ctx, -1.15, -0.42, 2.3, 0.84, 0.3, 'rgba(0,0,0,0.28)');
    // Wheels, then frame, then rider.
    box(ctx, 0.55, -0.11, 0.55, 0.22, 0.1, '#1b1b1e');
    box(ctx, -1.0, -0.11, 0.55, 0.22, 0.1, '#1b1b1e');
    box(ctx, -0.75, -0.2, 1.65, 0.4, 0.16, '#26262b');
    box(ctx, -0.35, -0.3, 0.8, 0.6, 0.22, '#2f6fb5');
    // Rider: shoulders wider than the machine, helmet forward.
    box(ctx, -0.28, -0.34, 0.52, 0.68, 0.22, '#20242c');
    ctx.beginPath();
    ctx.arc(0.16, 0, 0.19, 0, Math.PI * 2);
    ctx.fillStyle = '#e8e5dd';
    ctx.fill();
    box(ctx, 0.38, -0.36, 0.1, 0.72, 0.05, '#42424a');

    if (braking) box(ctx, -1.12, -0.16, 0.16, 0.32, 0.07, '#ff3b30');
    if (indicator !== 'off' && blinkOn) {
      // Local +y is the rider's right: the sprite is drawn along +x and then rotated so that
      // +x points into the direction of travel.
      const side = indicator === 'left' ? -1 : 1;
      ctx.fillStyle = '#ffb020';
      for (const x of [0.42, -1.02]) {
        ctx.beginPath();
        ctx.arc(x, side * 0.34, 0.13, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}

function drawActor(
  ctx: Ctx,
  cam: Camera,
  actor: ActorState,
  opts: SceneOptions,
  neverSeen: boolean,
) {
  const pose: PoseOnRoute = { x: actor.x, y: actor.y, heading: actor.heading };
  const alarmed = actor.mode === 'braking' || actor.mode === 'stopped';
  const pulse = 0.5 + 0.5 * Math.sin(opts.time * 9);

  const projected = withPose(ctx, cam, pose, () => {
    box(ctx, -0.85, -0.34, 1.7, 0.68, 0.26, 'rgba(0,0,0,0.25)');
    // Snorfiets: small deck, rider sitting upright, blue plate at the back.
    box(ctx, -0.7, -0.24, 1.4, 0.48, 0.2, '#d8d4cc');
    box(ctx, -0.24, -0.28, 0.5, 0.56, 0.2, '#2c3140');
    ctx.beginPath();
    ctx.arc(0.06, 0, 0.17, 0, Math.PI * 2);
    ctx.fillStyle = '#f0ede6';
    ctx.fill();
    // Blauwe plaat — the detail that says "snorfiets, 25 km/u, hoort op het fietspad".
    box(ctx, -0.78, -0.11, 0.16, 0.22, 0.04, '#1f5fbf');

    if (alarmed) box(ctx, -0.8, -0.14, 0.12, 0.28, 0.05, '#ff3b30');
  });
  if (!projected) return;

  // Decoration is screen-space, but sized by depth so a far marker does not swamp the road.
  const radius = Math.max(9, cam.scale * projected.q * 1.4);

  if (alarmed) {
    ctx.beginPath();
    ctx.arc(projected.x, projected.y, radius * (1 + 0.25 * pulse), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,59,48,${0.5 + 0.4 * pulse})`;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  if (neverSeen && opts.highlightUnseen) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(projected.x, projected.y, radius * 1.15, 0, Math.PI * 2);
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = `rgba(255,80,70,${0.45 + 0.5 * pulse})`;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(255,110,100,${0.6 + 0.4 * pulse})`;
    ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('niet gezien', projected.x, projected.y - radius * 1.15 - 8);
    ctx.restore();
  }
}

export { PALETTE };
