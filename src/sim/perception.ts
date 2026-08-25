/**
 * Perception model — "je ziet alleen wat je zelf controleert".
 *
 * The map view is what the RIDER has perceived, not a god view. Every actor starts hidden and
 * is revealed by a look action whose cone contains it. Once revealed it stays revealed.
 *
 * The cones are expressed as a bearing relative to the rider's heading, in degrees:
 *   0 = straight ahead, +90 = left, -90 = right, ±180 = straight back.
 *
 * The important property is the gap between the right mirror and the schouderblik. A mirror
 * covers a narrow rear cone (|rel| >= 145°); a snorfiets tucked in alongside and a couple of
 * metres back sits at around -128°, which no mirror shows. Only the schouderblik reaches it.
 * That gap *is* the dode hoek.
 */
import type { ActiveGaze, ActorState, ControlId, LookControl, PoseOnRoute } from './types';

export type { ActiveGaze, LookControl };

export const GAZE_DURATION_S = 0.7;

export interface GazeCone {
  /** Inclusive bearing range in degrees, relative to heading. */
  fromDeg: number;
  toDeg: number;
  minDist: number;
  maxDist: number;
}

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

/** Each look is a list of cones so that a single entry can cover more than one region. */
export const GAZE_CONES: Record<LookControl, GazeCone[]> = {
  // 148° rather than a wider cone: a motorcycle mirror is small and half of what it shows is
  // your own shoulder. Everything between this edge and the forward view is the dode hoek.
  MIRROR_LEFT: [{ fromDeg: 145, toDeg: 180, minDist: 4, maxDist: 70 }],
  MIRROR_RIGHT: [{ fromDeg: -180, toDeg: -145, minDist: 4, maxDist: 70 }],
  SHOULDER_RIGHT: [{ fromDeg: -170, toDeg: -70, minDist: 0, maxDist: 25 }],
  SHOULDER_LEFT: [{ fromDeg: 70, toDeg: 170, minDist: 0, maxDist: 25 }],
  EYE_LEFT: [{ fromDeg: 15, toDeg: 110, minDist: 0, maxDist: 45 }],
  EYE_RIGHT: [{ fromDeg: -110, toDeg: -15, minDist: 0, maxDist: 45 }],
};

/**
 * What you see without deliberately looking: the road straight ahead. Deliberately narrow —
 * a vehicle on a parallel fietspad off to the side falls outside it, which is the whole reason
 * the schouderblik has to be a separate, timed action.
 */
export const FORWARD_CONE: GazeCone = { fromDeg: -18, toDeg: 18, minDist: 0, maxDist: 50 };

/** Normalise to (-180, 180]. */
export function relativeBearingDeg(pose: PoseOnRoute, x: number, y: number): number {
  const abs = Math.atan2(y - pose.y, x - pose.x);
  let deg = ((abs - pose.heading) * 180) / Math.PI;
  while (deg <= -180) deg += 360;
  while (deg > 180) deg -= 360;
  return deg;
}

export function inCone(cone: GazeCone, bearingDeg: number, dist: number): boolean {
  return (
    dist >= cone.minDist &&
    dist <= cone.maxDist &&
    bearingDeg >= cone.fromDeg &&
    bearingDeg <= cone.toDeg
  );
}

/**
 * Reveal every actor covered by the forward view or by any currently open gaze.
 * Returns the actors newly revealed this frame so the caller can log them.
 */
export function applyPerception(
  pose: PoseOnRoute,
  actors: ActorState[],
  gazes: ActiveGaze[],
  t: number,
): ActorState[] {
  const revealed: ActorState[] = [];
  for (const actor of actors) {
    if (actor.perceived) continue;
    const bearing = relativeBearingDeg(pose, actor.x, actor.y);
    const dist = Math.hypot(actor.x - pose.x, actor.y - pose.y);

    let seen = inCone(FORWARD_CONE, bearing, dist);
    if (!seen) {
      for (const gaze of gazes) {
        if (GAZE_CONES[gaze.control].some((cone) => inCone(cone, bearing, dist))) {
          seen = true;
          break;
        }
      }
    }
    if (seen) {
      actor.perceived = true;
      actor.perceivedAt = t;
      revealed.push(actor);
    }
  }
  return revealed;
}
