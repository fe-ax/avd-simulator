/**
 * Is this scenario rideable at all?
 *
 * Geometry checks that used to live inside the test suite. The builder needs the same answers
 * live, and two implementations of "does anything stand in the road" would eventually disagree —
 * so the test imports this too, and there is one.
 */
import { poseAt, type ScenarioRoutes } from './route';
import { roadSurfaces, type RoadExtent, type Surface } from './roadSurfaces';
import type { ScenarioWorld, Vec2 } from './types';

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
