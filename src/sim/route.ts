/**
 * Arc-length parameterised route.
 *
 * The rider's lateral motion comes entirely from here; the *choice* of route comes from the
 * steer press. Everything is measured in metres of world space so that expected-action windows
 * can be expressed in metres and stay fair regardless of how fast the student rides.
 */
import { motorwayLanes } from './surfaces/motorway';
import type {
  ArcSegment,
  PoseOnRoute,
  RouteSegment,
  Scenario,
  ScenarioWorld,
  Vec2,
} from './types';

export interface Route {
  segments: RouteSegment[];
  lengths: number[];
  total: number;
}

export function segmentLength(seg: RouteSegment): number {
  if (seg.kind === 'line') {
    return Math.hypot(seg.to.x - seg.from.x, seg.to.y - seg.from.y);
  }
  return seg.radius * Math.abs(sweep(seg));
}

function sweep(seg: ArcSegment): number {
  let delta = seg.endAngle - seg.startAngle;
  if (seg.cw) {
    while (delta > 0) delta -= 2 * Math.PI;
    while (delta < -2 * Math.PI) delta += 2 * Math.PI;
  } else {
    while (delta < 0) delta += 2 * Math.PI;
    while (delta > 2 * Math.PI) delta -= 2 * Math.PI;
  }
  return delta;
}

export function makeRoute(segments: RouteSegment[]): Route {
  const lengths = segments.map(segmentLength);
  return { segments, lengths, total: lengths.reduce((a, b) => a + b, 0) };
}

/** Pose at arc length `s`. Clamped at both ends, so the caller never has to bounds-check. */
export function poseAt(route: Route, s: number): PoseOnRoute {
  let remaining = Math.max(0, Math.min(s, route.total));
  for (let i = 0; i < route.segments.length; i++) {
    const seg = route.segments[i];
    const len = route.lengths[i];
    if (remaining > len && i < route.segments.length - 1) {
      remaining -= len;
      continue;
    }
    return poseInSegment(seg, len === 0 ? 0 : remaining / len);
  }
  return poseInSegment(route.segments[0], 0);
}

function poseInSegment(seg: RouteSegment, u: number): PoseOnRoute {
  if (seg.kind === 'line') {
    const dx = seg.to.x - seg.from.x;
    const dy = seg.to.y - seg.from.y;
    return {
      x: seg.from.x + dx * u,
      y: seg.from.y + dy * u,
      heading: Math.atan2(dy, dx),
    };
  }
  const theta = seg.startAngle + sweep(seg) * u;
  const x = seg.center.x + seg.radius * Math.cos(theta);
  const y = seg.center.y + seg.radius * Math.sin(theta);
  // Clockwise travel means theta decreases, so the tangent flips sign with direction.
  const heading = seg.cw ? theta - Math.PI / 2 : theta + Math.PI / 2;
  return { x, y, heading };
}

/**
 * Lowest arc length at which the route crosses `targetX` while travelling in +x.
 * Used to derive the conflict point (the fietspad centreline) from the geometry rather than
 * hardcoding a number that would silently drift when the layout is edited.
 */
/** Arc length at which the route first reaches `targetY`, travelling north. */
export function findSAtY(route: Route, targetY: number, step = 0.05): number {
  return findSAt(route, (p) => p.y, targetY, step);
}

export function findSAtX(route: Route, targetX: number, step = 0.05): number {
  return findSAt(route, (p) => p.x, targetX, step);
}

/**
 * Arc length at which `read` of the pose first rises through `target`.
 *
 * Reading a coordinate through a callback rather than hard-coding x is what lets a conflict be
 * anchored on a route of any orientation. The old x-only version could only ever find a crossing
 * on a route travelling east, which was invisible while there was one scenario.
 */
export function findSAt(
  route: Route,
  read: (p: PoseOnRoute) => number,
  target: number,
  step = 0.05,
): number {
  let prev = read(poseAt(route, 0));
  for (let s = step; s <= route.total; s += step) {
    const x = read(poseAt(route, s));
    if (prev < target && x >= target) {
      // Linear refine between the two samples.
      const u = (target - prev) / (x - prev);
      return s - step + step * u;
    }
    prev = x;
  }
  return route.total;
}

// ---------------------------------------------------------------------------
// Scenario routes
// ---------------------------------------------------------------------------

/**
 * What every world has: a route the rider follows and one arc length everything is measured from.
 *
 * `turn` and `straight` are the two candidate lines. On a motorway there is no branch, so both
 * are the same route and `decisionS` sits past the end — the engine's branch logic then simply
 * never fires, which is cheaper than teaching it about a third case.
 */
interface CommonRoutes {
  turn: Route;
  straight: Route;
  /** Arc length at which the two routes diverge. */
  decisionS: number;
  /** Arc length of the point every distance window is measured back from. */
  conflictS: number;
  /** How far past the conflict the ride continues before it is called finished. */
  runOutM: number;
}

export type ScenarioRoutes =
  | (CommonRoutes & {
      kind: 'urbanCrossing';
      /** Arc lengths at which the rider enters and leaves the fietspad crossing. */
      crossEntryS: number;
      crossExitS: number;
      /** World-y span of the strip of fietspad the rider sweeps through. */
      crossYSpan: [number, number];
    })
  | (CommonRoutes & {
      kind: 'motorway';
      /** Lateral offset, in metres left of the spine, of each rijstrook. Index 0 is the strook. */
      laneOffsets: number[];
      /** Arc length from which a lane change is allowed: the straight part of the invoegstrook. */
      mergeFromS: number;
    });

/**
 * Right turn out of a northbound lane.
 *
 * The centre of a clockwise turn lies to the rider's right. Parameterising the circle as
 * `P(theta) = C + R(cos theta, sin theta)` with theta decreasing, the tangent is
 * `(sin theta, -cos theta)`: heading north at theta = pi, heading east at theta = pi/2.
 */
export function buildRoutes(scenario: Scenario): ScenarioRoutes {
  return scenario.world.kind === 'motorway'
    ? buildMotorwayRoutes(scenario.world)
    : buildCrossingRoutes(scenario.world);
}

/**
 * The oprit and the invoegstrook.
 *
 * The arc sweeps onto north so the invoegstrook is dead straight, which matters for more than
 * looks: a lane change is a lateral offset from the spine, and on a curve an offset machine's
 * real ground speed differs from its progress along the spine by `offset / radius`. Keeping the
 * merge on the straight makes that term exactly zero instead of a correction nobody would
 * remember to apply.
 */
function buildMotorwayRoutes(world: Extract<ScenarioWorld, { kind: 'motorway' }>): ScenarioRoutes {
  const { road, ramp, mergeEndY, runOutM } = world;
  const lanes = motorwayLanes(road);
  const sweep = (ramp.sweepDeg * Math.PI) / 180;

  // The arc ends heading north at the mouth of the invoegstrook. Its centre therefore lies
  // `radius` to the right of that point, and the sweep runs back from there.
  const center: Vec2 = { x: lanes.mergeCentre + ramp.radius, y: ramp.strookStartY };
  const spine = makeRoute([
    {
      kind: 'arc',
      center,
      radius: ramp.radius,
      startAngle: Math.PI + sweep,
      endAngle: Math.PI,
      cw: false,
    },
    {
      kind: 'line',
      from: { x: lanes.mergeCentre, y: ramp.strookStartY },
      to: { x: lanes.mergeCentre, y: mergeEndY + runOutM },
    },
  ]);

  const conflictS = findSAtY(spine, mergeEndY);
  return {
    kind: 'motorway',
    turn: spine,
    straight: spine,
    // No branch here: put the decision past the end so the engine's branch logic never fires.
    decisionS: spine.total + 1,
    conflictS,
    runOutM,
    // Index 0 is the invoegstrook itself, then each rijstrook further left.
    laneOffsets: [0, ...lanes.centres.map((c) => lanes.mergeCentre - c)],
    mergeFromS: findSAtY(spine, ramp.strookStartY),
  };
}

function buildCrossingRoutes(
  world: Extract<ScenarioWorld, { kind: 'urbanCrossing' }>,
): ScenarioRoutes {
  const scenario = world;
  const { laneCenterX, sideLaneCenterY } = scenario.road;
  const { startY, turnInY, turnRadius, exitX } = scenario.approach;

  const center: Vec2 = { x: laneCenterX + turnRadius, y: turnInY };
  // The arc ends at C + R(0, 1); for that to land in the side road's right-hand lane the
  // turn-in point must sit `turnRadius` south of it. The scenario supplies both, so assert
  // the relationship rather than silently drawing a kinked route.
  const arcEndY = center.y + turnRadius;
  if (Math.abs(arcEndY - sideLaneCenterY) > 0.01) {
    throw new Error(
      `Route kink: turnInY (${turnInY}) + turnRadius (${turnRadius}) must equal ` +
        `sideLaneCenterY (${sideLaneCenterY}), got ${arcEndY}.`,
    );
  }

  const approachSeg: RouteSegment = {
    kind: 'line',
    from: { x: laneCenterX, y: startY },
    to: { x: laneCenterX, y: turnInY },
  };

  const turn = makeRoute([
    approachSeg,
    {
      kind: 'arc',
      center,
      radius: turnRadius,
      startAngle: Math.PI,
      endAngle: Math.PI / 2,
      cw: true,
    },
    {
      kind: 'line',
      from: { x: center.x, y: sideLaneCenterY },
      to: { x: exitX, y: sideLaneCenterY },
    },
  ]);

  const straight = makeRoute([
    approachSeg,
    {
      kind: 'line',
      from: { x: laneCenterX, y: turnInY },
      to: { x: laneCenterX, y: turnInY + 70 },
    },
  ]);

  const crossEntryS = findSAtX(turn, scenario.road.fietspadFrom - 0.5);
  const crossExitS = findSAtX(turn, scenario.road.fietspadTo + 0.5);

  // The strip the rider's *body* sweeps, not just the centreline: a motorcycle is a little over
  // two metres long, and it is the whole machine that blocks the fietspad.
  const HALF_LENGTH = 1.15;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (let s = crossEntryS; s <= crossExitS; s += 0.1) {
    const { y } = poseAt(turn, s);
    yMin = Math.min(yMin, y);
    yMax = Math.max(yMax, y);
  }
  yMin -= HALF_LENGTH;
  yMax += HALF_LENGTH;

  return {
    kind: 'urbanCrossing',
    turn,
    straight,
    decisionS: segmentLength(approachSeg),
    conflictS: findSAtX(turn, scenario.conflictX),
    runOutM: 42,
    crossEntryS,
    crossExitS,
    crossYSpan: [yMin, yMax],
  };
}
