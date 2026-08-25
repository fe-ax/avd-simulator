/**
 * What the rider has actually seen.
 *
 * This used to be six hand-authored cones and an argument about where their edges belonged. It is
 * now a description of the view that genuinely gets rendered: one forward field the size of the
 * camera's, and two mirrors aimed where the glass aims them. The numbers below are not choices
 * about how perception should work — they are measurements of the scene, and `assertMatchesScene`
 * in the renderer complains if the two ever drift apart.
 *
 * Bearings are relative to the machine, in degrees: 0 straight ahead, +90 left, −90 right, ±180
 * astern. The head adds its own yaw on top, so looking away really does cost you the road.
 */
import type { ActorState, ControlId, HeadPose, LookControl, PoseOnRoute } from './types';

export type { ActiveGaze, LookControl } from './types';

export const LOOK_CONTROLS: LookControl[] = [
  'MIRROR_LEFT',
  'MIRROR_RIGHT',
  'EYE_LEFT',
  'EYE_RIGHT',
  'SHOULDER_LEFT',
  'SHOULDER_RIGHT',
];

export function isLookControl(c: ControlId): c is LookControl {
  return (LOOK_CONTROLS as ControlId[]).includes(c);
}

/** Seconds a look stays open. Only used to draw the gaze in the plan view now. */
export const GAZE_DURATION_S = 0.7;

/**
 * The forward view: the camera's own field. Horizontal half-angle is quoted for a typical window;
 * a very wide one shows a little more than this credits, which is the right way round to err.
 */
export const FORWARD_VIEW = {
  halfAngleDeg: 31,
  verticalHalfAngleDeg: 27.5,
  maxDist: 130,
};

/**
 * What a mirror reaches, measured off the rendered geometry rather than chosen.
 *
 * The axis is 26° outboard of dead astern — where a mirror mounted square across the machine ends
 * up pointing, because the rider's eye sits inboard of the glass — and the convex field is 28°
 * either side of that. Everything between the outer edge of this and the forward view is the dode
 * hoek. No line of code names it.
 */
export const MIRROR_VIEW = {
  aimOutOfAsternDeg: 26,
  halfAngleDeg: 28,
  minDist: 2,
  maxDist: 90,
};

/** Where the head has to be pointing for a mirror to be readable, in degrees. */
export const MIRROR_DIRECTION = {
  MIRROR_LEFT: { yaw: 26.6, pitch: -12.6 },
  MIRROR_RIGHT: { yaw: -26.6, pitch: -12.6 },
};

/** Half-angle within which the reticle counts as resting on something. Matches the gaze targets. */
export const FOCUS_HALF_ANGLE_DEG = 5;

/**
 * Where the head has to point for each look, in degrees. The renderer places its dots from these
 * same numbers, so the aim a rider takes and the aim perception credits are one value.
 *
 * The shoulder aim is 102° rather than something further round. A schouderblik is a check just
 * past abeam, and the field it opens has to reach the front edge of the blind spot: at the moment
 * that matters the snorfiets is drawn nearly level with the rider, around 85°. Aimed at 117° the
 * view stopped at 86° and missed it by a degree and a half.
 */
export const LOOK_DIRECTIONS: Record<LookControl, HeadPose> = {
  MIRROR_LEFT: { yaw: 26.6, pitch: -12.6 },
  MIRROR_RIGHT: { yaw: -26.6, pitch: -12.6 },
  EYE_LEFT: { yaw: 25, pitch: 0 },
  EYE_RIGHT: { yaw: -25, pitch: 0 },
  SHOULDER_LEFT: { yaw: 102, pitch: -6 },
  SHOULDER_RIGHT: { yaw: -102, pitch: -6 },
};

/** How far out the shoulder dots hang, in metres. Far enough to be out in the blind spot itself. */
export const SHOULDER_TARGET_DISTANCE = 4.3;

const DEG = 180 / Math.PI;

/** Normalise to (−180, 180]. */
export function wrapDeg(deg: number): number {
  let d = deg;
  while (d <= -180) d += 360;
  while (d > 180) d -= 360;
  return d;
}

export function relativeBearingDeg(pose: PoseOnRoute, x: number, y: number): number {
  return wrapDeg((Math.atan2(y - pose.y, x - pose.x) - pose.heading) * DEG);
}

/** Is a mirror readable? Only while the rider is looking straight at it. */
export function mirrorInFocus(head: HeadPose, side: 'left' | 'right'): boolean {
  const want = side === 'left' ? MIRROR_DIRECTION.MIRROR_LEFT : MIRROR_DIRECTION.MIRROR_RIGHT;
  const dYaw = wrapDeg(head.yaw * DEG - want.yaw);
  const dPitch = head.pitch * DEG - want.pitch;
  return Math.hypot(dYaw, dPitch) <= FOCUS_HALF_ANGLE_DEG;
}

function inForwardView(head: HeadPose, bearingDeg: number, elevationDeg: number, dist: number) {
  if (dist > FORWARD_VIEW.maxDist) return false;
  const offAxis = Math.abs(wrapDeg(bearingDeg - head.yaw * DEG));
  if (offAxis > FORWARD_VIEW.halfAngleDeg) return false;
  return Math.abs(elevationDeg - head.pitch * DEG) <= FORWARD_VIEW.verticalHalfAngleDeg;
}

function inMirror(bearingDeg: number, dist: number, side: 'left' | 'right') {
  if (dist < MIRROR_VIEW.minDist || dist > MIRROR_VIEW.maxDist) return false;
  // The axis of a mirror, as a machine-relative bearing: astern, swung outboard on its own side.
  const axis = (side === 'left' ? 1 : -1) * (180 - MIRROR_VIEW.aimOutOfAsternDeg);
  return Math.abs(wrapDeg(bearingDeg - axis)) <= MIRROR_VIEW.halfAngleDeg;
}

/**
 * Reveal every actor the rider can currently see, directly or in a mirror they are reading.
 * Returns the ones newly revealed so the caller can log them.
 */
export function applyPerception(
  pose: PoseOnRoute,
  head: HeadPose,
  actors: ActorState[],
  t: number,
): ActorState[] {
  const revealed: ActorState[] = [];
  const leftFocused = mirrorInFocus(head, 'left');
  const rightFocused = mirrorInFocus(head, 'right');

  for (const actor of actors) {
    if (actor.perceived) continue;

    const dx = actor.x - pose.x;
    const dy = actor.y - pose.y;
    const dist = Math.hypot(dx, dy);
    const bearing = relativeBearingDeg(pose, actor.x, actor.y);
    // Riders and road users sit a little below eye level; only a hard look up or down loses them.
    const elevation = Math.atan2(-0.5, Math.max(dist, 0.5)) * DEG;

    const seen =
      inForwardView(head, bearing, elevation, dist) ||
      (leftFocused && inMirror(bearing, dist, 'left')) ||
      (rightFocused && inMirror(bearing, dist, 'right'));

    if (!seen) continue;
    actor.perceived = true;
    actor.perceivedAt = t;
    revealed.push(actor);
  }
  return revealed;
}
