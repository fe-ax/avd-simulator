/**
 * Is this scenario rideable at all?
 *
 * Geometry checks that used to live inside the test suite. The builder needs the same answers
 * live, and two implementations of "does anything stand in the road" would eventually disagree —
 * so the test imports this too, and there is one.
 */
import { buildRoutes, poseAt, type ScenarioRoutes } from './route';
import { roadSurfaces, type RoadExtent, type Surface } from './roadSurfaces';
import type { Scenario, ScenarioWorld, Vec2 } from './types';

/**
 * Can this build still use this scenario at all?
 *
 * Answered by *using* it — build its route and its road — rather than by checking it against a
 * schema. A schema is a second description of the shape and goes stale the moment the first one
 * moves; actually running the thing cannot.
 *
 * This exists because a draft saved before `world.stretch` was introduced took the whole builder
 * down to a white screen. Nothing rendered, so nothing could clear it, and the only way back was
 * devtools. Now that scenarios arrive from a saved library and from files other people made, the
 * same question gets asked in three places, and one of them is asking it about data this build has
 * never seen.
 */
export function isRideable(scenario: Scenario): boolean {
  try {
    buildRoutes(scenario);
    roadSurfaces(scenario.world, { minX: -50, maxX: 50, minY: -50, maxY: 50 });
    return true;
  } catch {
    return false;
  }
}

/** Half the width of the machine. Its body blocks a road, not its centreline. */
const HALF_WIDTH = 0.5;

export interface Obstruction {
  kind: string;
  /** Arc length along the route at which the machine would hit it. */
  s: number;
  at: Vec2;
}

/** Surfaces you can ride on. Anything else under the wheels means the road ran out. */
const DRIVEABLE: ReadonlySet<string> = new Set(['asphalt', 'fietspad', 'fietspadEdge', 'paint']);

/** Ray casting. Points exactly on an edge are not worth agonising over at half-metre steps. */
export function pointInPolygon(poly: Vec2[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/**
 * Everything standing up that the rider would ride through.
 *
 * A flat marking is paint and a raised one is a wall, and only the height tells them apart —
 * which is why this reads `height > 0` rather than naming kinds. It also means a new kind of
 * scenery is covered the day it exists, with nobody having to remember.
 */
export function findObstructions(
  world: ScenarioWorld,
  routes: ScenarioRoutes,
  extent: RoadExtent,
  step = 0.5,
): Obstruction[] {
  const standing: Surface[] = roadSurfaces(world, extent).filter((s) => s.height > 0);
  const out: Obstruction[] = [];
  const seen = new Set<string>();

  for (let s = 0; s <= routes.turn.total; s += step) {
    const pose = poseAt(routes.turn, s);
    const sin = Math.sin(pose.heading);
    const cos = Math.cos(pose.heading);
    const points: Vec2[] = [
      pose,
      { x: pose.x - sin * HALF_WIDTH, y: pose.y + cos * HALF_WIDTH },
      { x: pose.x + sin * HALF_WIDTH, y: pose.y - cos * HALF_WIDTH },
    ];
    for (const point of points) {
      for (const surface of standing) {
        if (!pointInPolygon(surface.points, point.x, point.y)) continue;
        // One report per obstacle, not one per sample: a hedge is a single problem.
        const key = `${surface.kind}@${Math.round(s / 5)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ kind: surface.kind, s, at: { x: point.x, y: point.y } });
      }
    }
  }
  return out;
}

/**
 * Anywhere the route runs off the end of the road.
 *
 * This exists because it happened. The motorway's oprit was described in `buildRoutes` and not in
 * `motorwaySurfaces`, so the first forty metres of scenario 2 were ridden across the verge — the
 * carriageway visible off to the left, trees going past, and no tarmac under the wheels at all.
 * Every test passed, because nothing had ever thought to ask whether there was road there.
 *
 * The route is the one thing guaranteed to be ridden, so "is there road under all of it" is the
 * cheapest possible statement of the thing that went wrong.
 */
export function findOffRoad(world: ScenarioWorld, path: readonly Vec2[], extent: RoadExtent): Vec2[] {
  const driveable = roadSurfaces(world, extent).filter((s) => s.height === 0 && DRIVEABLE.has(s.kind));
  const out: Vec2[] = [];
  for (const point of path) {
    if (!driveable.some((surface) => pointInPolygon(surface.points, point.x, point.y))) {
      out.push({ x: Math.round(point.x * 10) / 10, y: Math.round(point.y * 10) / 10 });
    }
  }
  return out;
}

/**
 * Road users the model says you saw through a building.
 *
 * `perception.ts` is purely angular — bearing, distance, a frustum — and knows nothing about
 * houses. That is deliberate and it is fine for the thing perception is for, but it means the two
 * halves of the tool can disagree: the model credits a look that the screen makes impossible, and
 * every check downstream believes the model. *Auto van rechts remt* shipped doing exactly that, and
 * the exercise was a trick question that measured as a clean ride.
 *
 * So this asks the question scoring cannot, and it belongs to validation rather than to perception
 * for a reason: making perception itself occlude would change what every existing scenario scores.
 * Telling an author their hazard is behind a house changes nothing and is what they need to know.
 *
 * Sampled along the line of sight against the footprints of anything tall enough to hide a car.
 * Crude, and enough — the gap it looks for is measured in whole seconds.
 */
export interface HiddenReveal {
  actorId: string;
  label: string;
  /** When the model says it was first seen. */
  perceivedAt: number;
  /** When it was first genuinely in view, or null if a building hid it for the whole ride. */
  visibleAt: number | null;
}

/** Anything a car can hide behind. A one-metre hedge does not hide one from a rider 1,6 m up. */
const HIDES_A_CAR = 2;

/** How long a sight line has to hold before it counts as having come into view. */
const HOLD_S = 0.5;

function segmentHitsBox(a: Vec2, b: Vec2, box: Vec2[]): boolean {
  const xs = box.map((p) => p.x);
  const ys = box.map((p) => p.y);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const steps = 60;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return true;
  }
  return false;
}

export function findHiddenReveals(
  world: ScenarioWorld,
  record: {
    samples: readonly { t: number; x: number; y: number }[];
    actorTracks: Record<string, readonly { t: number; x: number; y: number; perceived: boolean }[]>;
  },
  labels: Record<string, string>,
  extent: RoadExtent,
  /** Seconds of disagreement worth mentioning. Below this it is sampling noise. */
  tolerance = 1,
): HiddenReveal[] {
  const boxes = roadSurfaces(world, extent)
    .filter((s) => s.height > HIDES_A_CAR)
    .map((s) => s.points);
  const out: HiddenReveal[] = [];

  const clearAt = (t: number, track: readonly { t: number; x: number; y: number }[]) => {
    const s = record.samples.find((x) => x.t >= t);
    const a = track.find((x) => x.t >= t);
    if (!s || !a) return true;
    return !boxes.some((b) => segmentHitsBox(s, a, b));
  };

  for (const [id, track] of Object.entries(record.actorTracks)) {
    const perceived = track.find((a) => a.perceived);
    if (!perceived) continue;

    // The only question worth asking: at the instant the model credits the look, was there a
    // building in the way? Anything later is not a disagreement — traffic passes behind houses all
    // the time once you have seen it, and the Kerkstraat's snorfiets does exactly that on the far
    // side of the turn, which an earlier version of this reported as a fault.
    if (clearAt(perceived.t, track)) continue;

    // It was hidden. Find when it stops being, and require it to stay clear rather than flicker
    // through a gap between two houses.
    let visibleAt: number | null = null;
    for (const s of record.samples) {
      if (s.t <= perceived.t) continue;
      if (!clearAt(s.t, track)) continue;
      if (clearAt(s.t + HOLD_S, track)) {
        visibleAt = s.t;
        break;
      }
    }

    if (visibleAt === null || visibleAt - perceived.t > tolerance) {
      out.push({ actorId: id, label: labels[id] ?? id, perceivedAt: perceived.t, visibleAt });
    }
  }
  return out;
}

/**
 * The route's own line, for asking about a road before anyone has ridden it.
 *
 * Careful with this one on a motorway: the route is the *spine*, and after a lane change the
 * machine is metres to the left of it. The invoegstrook now ends in a puntstuk, so the spine runs
 * off the tarmac exactly where it is supposed to — a rider who is still on the spine there has
 * missed the merge. Ask a recorded ride where it actually went if you want the truthful answer.
 */
export function routePath(routes: ScenarioRoutes, step = 2): Vec2[] {
  const out: Vec2[] = [];
  for (let s = 0; s <= routes.turn.total; s += step) {
    const p = poseAt(routes.turn, s);
    out.push({ x: p.x, y: p.y });
  }
  return out;
}

/** Where a recorded ride actually put the machine, lane changes and all. */
export function riddenPath(samples: readonly { x: number; y: number }[]): Vec2[] {
  return samples.map((s) => ({ x: s.x, y: s.y }));
}
