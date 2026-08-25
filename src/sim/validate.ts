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
