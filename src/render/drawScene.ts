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
import type { ActorKind, ActorState, HeadPose, PoseOnRoute, WorldView } from '../sim/types';
import type { ViewCamera } from './camera';
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

export function drawScene(ctx: Ctx, cam: ViewCamera, world: WorldView, opts: SceneOptions) {
  drawRoad(ctx, cam, world);

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

function onScreen(cam: ViewCamera, actor: ActorState): boolean {
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
  cam: ViewCamera,
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
function drawView(ctx: Ctx, cam: ViewCamera, pose: PoseOnRoute, head: HeadPose) {
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
  cam: ViewCamera,
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

/**
 * Rounded rectangle in the local (metres) frame: x forward, **y to the vehicle's right**.
 *
 * Right, not left, however much the name suggests otherwise. `withPose` rotates by
 * `-(heading - camYaw) - pi/2`, which sends local (0,1) to screen +x; and screen +x is decreasing
 * `v`, which the camera measures leftward. Every sprite here happens to be symmetric about its
 * axis so nothing has ever depended on it — but the blinker on the motorcycle does, and it was
 * inverted once for exactly this reason.
 */
function box(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, color: string) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

/**
 * The same box, but projected corner by corner instead of drawn under one transform.
 *
 * `withPose` takes the depth at a vehicle's centre and draws the whole sprite at that one scale.
 * For a snorfiets, whose ends are ninety centimetres apart, the difference is invisible. For a
 * trekker-oplegger it is not: sixteen and a half metres span a real slice of the perspective, so
 * the tail should be visibly wider than the cab and the whole thing should be a trapezoid lying on
 * the road. Drawn rigid, it reads as a rectangle pasted on top of the tarmac — which is exactly
 * what it looked like.
 *
 * Projecting each corner is what the road surfaces have always done; this just lets a vehicle do
 * it too. Corners come out square: `roundRect` has no meaning once the four corners are at four
 * different scales, and at these sizes the radius was two pixels anyway.
 */
function worldBox(
  ctx: Ctx,
  cam: ViewCamera,
  pose: PoseOnRoute,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  const cos = Math.cos(pose.heading);
  const sin = Math.sin(pose.heading);
  // The same frame `box` uses: x forward, y to the vehicle's right. Ported over unchanged so a
  // sprite drawn either way lands in the same place.
  const at = (fx: number, fy: number): WorldPoint => ({
    x: pose.x + fx * cos + fy * sin,
    y: pose.y + fx * sin - fy * cos,
  });
  fillWorldPoly(ctx, cam, [at(x, y), at(x + w, y), at(x + w, y + h), at(x, y + h)], color);
}

function drawMotorcycle(
  ctx: Ctx,
  cam: ViewCamera,
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

/**
 * The Dutch legal maximums for a trekker-oplegger, repeated from `scene/actors3d.ts` because the
 * two views have to agree about how much road one takes up — and because they are facts about the
 * vehicle, not a drawing choice either renderer gets to make. The plan view is where a student
 * reads a following distance off the replay, so a snorfiets-sized blob here would flatter every
 * gap by fourteen metres.
 */
const TRUCK = { length: 16.5, width: 2.55, trailerLength: 13.6, cabLength: 2.3 };

/** Snorfiets: small deck, rider sitting upright, blue plate at the back. */
type SpriteArgs = { ctx: Ctx; cam: ViewCamera; pose: PoseOnRoute; alarmed: boolean };

function drawSnorfietsSprite({ ctx, cam, pose, alarmed }: SpriteArgs) {
  const b = (x: number, y: number, w: number, h: number, c: string) =>
    worldBox(ctx, cam, pose, x, y, w, h, c);

  b(-1.05, -0.42, 2.1, 0.84, 'rgba(0,0,0,0.25)');
  b(-0.9, -0.32, 1.8, 0.64, '#3f4a5a');
  // Blauwe plaat — the detail that says "snorfiets, 25 km/u, hoort op het fietspad".
  b(-0.86, -0.2, 0.34, 0.4, '#2f6fd0');
  b(0.16, -0.26, 0.5, 0.52, '#1d232e');
  b(0.62, -0.1, 0.28, 0.2, '#e8e2d2');
  if (alarmed) b(-0.92, -0.24, 0.16, 0.48, '#ff3b30');
}

/** A trekker-oplegger, 16.5 m. Sprite +x is forward. */
function drawVrachtwagenSprite({ ctx, cam, pose, alarmed }: SpriteArgs) {
  const b = (x: number, y: number, w: number, h: number, c: string) =>
    worldBox(ctx, cam, pose, x, y, w, h, c);
  const nose = TRUCK.length / 2;
  const tail = -nose;
  const half = TRUCK.width / 2;
  const cabRear = nose - TRUCK.cabLength;

  b(tail - 0.15, -half - 0.15, TRUCK.length + 0.3, TRUCK.width + 0.3, 'rgba(0,0,0,0.25)');
  // The chassis goes down first, so the koppeling shows as a dark waist between the two bodies.
  b(cabRear - 1.4, -0.45, 2.2, 0.9, '#212429');
  b(tail, -half, TRUCK.trailerLength, TRUCK.width, '#dcd9d2');
  b(tail + 0.06, -half + 0.12, 0.2, TRUCK.width - 0.24, '#c4c0b7');
  b(cabRear, -half + 0.05, TRUCK.cabLength, TRUCK.width - 0.1, '#2f5f8f');
  // The same five axles the mesh has. Last over both bodies, or the steering axle disappears
  // under the cab standing on it.
  for (const x of [6.85, 3.15, -4.3, -5.6, -6.9]) {
    for (const side of [-1, 1]) {
      b(x - 0.28, side > 0 ? half - 0.34 : -half, 0.56, 0.34, '#17171a');
    }
  }
  // Windscreen, so the plan view says which end the driver is at.
  b(nose - 0.55, -half + 0.2, 0.4, TRUCK.width - 0.4, '#2f3b47');

  if (alarmed) {
    for (const side of [-1, 1]) {
      b(tail + 0.02, side > 0 ? 0.72 : -1.14, 0.22, 0.42, '#ff3b30');
    }
  }
}

/** An ordinary car, 4.4 m. Sprite +x is forward, as with the truck. */
function drawAutoSprite({ ctx, cam, pose, alarmed }: SpriteArgs) {
  const b = (x: number, y: number, w: number, h: number, c: string) =>
    worldBox(ctx, cam, pose, x, y, w, h, c);
  const nose = 4.4 / 2;
  const tail = -nose;
  const half = 1.78 / 2;

  b(tail - 0.12, -half - 0.12, 4.4 + 0.24, 1.78 + 0.24, 'rgba(0,0,0,0.25)');
  b(tail, -half, 4.4, 1.78, '#8d3f3a');
  // The greenhouse, inset on all four sides, which is what says car rather than crate.
  b(tail + 1.05, -half + 0.16, 1.65, 1.78 - 0.32, '#7c3733');
  b(tail + 1.15, -half + 0.22, 0.16, 1.78 - 0.44, '#2f3b47');
  b(nose - 1.35, -half + 0.22, 0.16, 1.78 - 0.44, '#2f3b47');
  for (const x of [nose - 1.3, tail + 1.25]) {
    for (const side of [-1, 1]) {
      b(x - 0.26, side > 0 ? half - 0.28 : -half, 0.52, 0.28, '#17171a');
    }
  }
  if (alarmed) {
    for (const side of [-1, 1]) {
      b(tail + 0.02, side > 0 ? 0.34 : -0.72, 0.2, 0.38, '#ff3b30');
    }
  }
}

/**
 * How big a screen-space marker ring has to be to clear the vehicle it belongs to. In metres of
 * the actor's own frame, so it scales with distance like everything else on the map.
 */
const MARKER_RADIUS: Partial<Record<ActorKind, number>> = { vrachtwagen: 2.4, auto: 1.7 };

function drawActor(
  ctx: Ctx,
  cam: ViewCamera,
  actor: ActorState,
  opts: SceneOptions,
  neverSeen: boolean,
) {
  const pose: PoseOnRoute = { x: actor.x, y: actor.y, heading: actor.heading };
  const alarmed = actor.mode === 'braking' || actor.mode === 'stopped';
  const pulse = 0.5 + 0.5 * Math.sin(opts.time * 9);

  const projected = cam.project(pose.x, pose.y);
  if (projected.q <= 0) return;

  const args = { ctx, cam, pose, alarmed };
  if (actor.spec.kind === 'vrachtwagen') drawVrachtwagenSprite(args);
  else if (actor.spec.kind === 'auto') drawAutoSprite(args);
  else drawSnorfietsSprite(args);

  // Decoration is screen-space, but sized by depth so a far marker does not swamp the road.
  const radius = Math.max(9, cam.scale * projected.q * (MARKER_RADIUS[actor.spec.kind] ?? 1.4));

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
