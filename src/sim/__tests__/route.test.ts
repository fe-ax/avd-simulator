import { describe, expect, test } from 'vitest';
import { buildRoutes, findSAtX, poseAt } from '../route';
import { roadSurfaces } from '../roadSurfaces';
import { rechtsafFietspad as scenario } from '../scenario.rechtsaf-fietspad';

const routes = buildRoutes(scenario);
const DEG = 180 / Math.PI;

/**
 * These tests are about the crossing, so they narrow to it once here rather than at every read.
 * A motorway scenario has no `approach` and no fietspad to cross, and the type says so.
 */
const world = scenario.world;
if (world.kind !== 'urbanCrossing') throw new Error('scenario 1 is een kruispunt');
const routes_ = routes;
if (routes_.kind !== 'urbanCrossing') throw new Error('scenario 1 is een kruispunt');
const crossing = routes_;

describe('de route', () => {
  test('start noordwaarts in de rechterrijstrook', () => {
    const start = poseAt(routes.turn, 0);
    expect(start.x).toBeCloseTo(world.road.laneCenterX, 5);
    expect(start.y).toBeCloseTo(world.approach.startY, 5);
    expect(start.heading * DEG).toBeCloseTo(90, 5);
  });

  test('splitst op het insturpunt', () => {
    expect(routes.decisionS).toBeCloseTo(
      world.approach.turnInY - world.approach.startY,
      5,
    );
    const a = poseAt(routes.turn, routes.decisionS);
    const b = poseAt(routes.straight, routes.decisionS);
    expect(a.x).toBeCloseTo(b.x, 5);
    expect(a.y).toBeCloseTo(b.y, 5);
  });

  test('draait rechtsom van noord naar oost', () => {
    const mid = poseAt(routes.turn, routes.decisionS + routes.turn.lengths[1] / 2);
    expect(mid.heading * DEG).toBeGreaterThan(0);
    expect(mid.heading * DEG).toBeLessThan(90);
    const after = poseAt(routes.turn, routes.decisionS + routes.turn.lengths[1] + 1);
    expect(after.heading * DEG).toBeCloseTo(0, 5);
    expect(after.y).toBeCloseTo(world.road.sideLaneCenterY, 5);
  });

  test('rijdt op de rechtdoor-tak gewoon noordwaarts verder', () => {
    const after = poseAt(routes.straight, routes.decisionS + 20);
    expect(after.heading * DEG).toBeCloseTo(90, 5);
    expect(after.x).toBeCloseTo(world.road.laneCenterX, 5);
  });
});

describe('het conflictpunt', () => {
  test('ligt op de hartlijn van het fietspad', () => {
    const point = poseAt(routes.turn, routes.conflictS);
    expect(point.x).toBeCloseTo(world.conflictX, 2);
  });

  test('ligt tussen het in- en uitrijden van het fietspad', () => {
    expect(crossing.crossEntryS).toBeLessThan(routes.conflictS);
    expect(crossing.crossExitS).toBeGreaterThan(routes.conflictS);
  });

  test('de doorkruiste strook is minstens zo lang als de motor', () => {
    const [yMin, yMax] = crossing.crossYSpan;
    expect(yMax - yMin).toBeGreaterThan(2.2);
  });

  test('findSAtX interpoleert tussen samples', () => {
    const s = findSAtX(routes.turn, 4.0);
    expect(poseAt(routes.turn, s).x).toBeCloseTo(4.0, 2);
  });
});

describe('er staat niets in de weg', () => {
  /**
   * Anything with height is a wall once there is a third dimension. A plan view hides that — an
   * uninterrupted hedge disappears under the side road painted on top of it — so nothing about
   * drawing it flat says whether you can ride through it. This walks the route and checks.
   */
  const inside = (poly: { x: number; y: number }[], x: number, y: number): boolean => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
    }
    return hit;
  };

  test('de hele route is vrij van alles wat overeind staat', () => {
    const standing = roadSurfaces(scenario.world, {
      minX: -85,
      maxX: 95,
      minY: -150,
      maxY: 65,
    }).filter((s) => s.height > 0);
    expect(standing.length).toBeGreaterThan(0);

    const blocked: string[] = [];
    for (let s = 0; s <= routes.turn.total; s += 0.5) {
      const pose = poseAt(routes.turn, s);
      // The machine has width; check either side of the centreline as well.
      const left = { x: pose.x - Math.sin(pose.heading) * 0.5, y: pose.y + Math.cos(pose.heading) * 0.5 };
      const right = { x: pose.x + Math.sin(pose.heading) * 0.5, y: pose.y - Math.cos(pose.heading) * 0.5 };
      for (const point of [pose, left, right]) {
        for (const surface of standing) {
          if (inside(surface.points, point.x, point.y)) {
            blocked.push(`${surface.kind} at s=${s.toFixed(0)}`);
          }
        }
      }
    }
    expect(blocked).toEqual([]);
  });

  test('de lantaarnpalen staan op de vier hoeken, niet op de weg', () => {
    const lamps = roadSurfaces(scenario.world, { minX: -85, maxX: 95, minY: -150, maxY: 65 }).filter(
      (s) => s.kind === 'lamp',
    );
    expect(lamps).toHaveLength(4);
    const corners = lamps
      .map((l) => {
        const x = l.points.reduce((a, p) => a + p.x, 0) / l.points.length;
        const y = l.points.reduce((a, p) => a + p.y, 0) / l.points.length;
        return `${Math.sign(x)},${Math.sign(y)}`;
      })
      .sort();
    // One per quadrant: a pole that drifted would double up here instead of showing four.
    expect(corners).toEqual(['-1,-1', '-1,1', '1,-1', '1,1']);
    for (const lamp of lamps) {
      for (const p of lamp.points) {
        expect(Math.abs(p.x)).toBeGreaterThan(world.road.fietspadTo);
        expect(Math.abs(p.y)).toBeGreaterThan(world.road.sideHalfWidth);
      }
    }
  });

  test('de hoek is open: de heg houdt op bij de zijweg', () => {
    const hedges = roadSurfaces(scenario.world, { minX: -85, maxX: 95, minY: -150, maxY: 65 }).filter(
      (s) => s.kind === 'hedge',
    );
    // Four runs, not two: each side stops short of the Kerkstraat and picks up again beyond it.
    expect(hedges).toHaveLength(4);
    for (const hedge of hedges) {
      const ys = hedge.points.map((p) => p.y);
      const spansJunction = Math.min(...ys) < 0 && Math.max(...ys) > 0;
      expect(spansJunction).toBe(false);
    }
  });
});

describe('de fietsoversteek', () => {
  const { fietspadFrom, fietspadTo, sideHalfWidth } = world.road;
  const all = roadSurfaces(scenario.world, { minX: -85, maxX: 95, minY: -150, maxY: 65 });
  const overlapsCrossing = (s: { points: { x: number; y: number }[] }, xa: number, xb: number) => {
    const xs = s.points.map((p) => p.x);
    const ys = s.points.map((p) => p.y);
    return (
      Math.max(...xs) > xa &&
      Math.min(...xs) < xb &&
      Math.max(...ys) > -sideHalfWidth &&
      Math.min(...ys) < sideHalfWidth
    );
  };

  test('het rood houdt op bij de zijweg in plaats van er dwars overheen te lopen', () => {
    const red = all.filter((s) => s.kind === 'fietspad' || s.kind === 'fietspadEdge');
    expect(red.length).toBeGreaterThan(0);
    for (const s of red) {
      expect(overlapsCrossing(s, fietspadFrom, fietspadTo)).toBe(false);
      expect(overlapsCrossing(s, -fietspadTo, -fietspadFrom)).toBe(false);
    }
  });

  test('en blokmarkering neemt het over, aan weerszijden van elke oversteek', () => {
    const blocks = all.filter((s) => s.kind === 'paint');
    for (const [xa, xb] of [
      [fietspadFrom, fietspadTo],
      [-fietspadTo, -fietspadFrom],
    ]) {
      const here = blocks.filter((s) => overlapsCrossing(s, xa, xb));
      // Two rows, and the same number of blocks in each: a lopsided crossing reads as damage.
      const west = here.filter((s) => Math.min(...s.points.map((p) => p.x)) < (xa + xb) / 2);
      const east = here.filter((s) => Math.min(...s.points.map((p) => p.x)) > (xa + xb) / 2);
      expect(west.length).toBeGreaterThan(2);
      expect(east.length).toBe(west.length);
    }
  });
});

describe('geometriecontrole', () => {
  test('een geknikte route wordt geweigerd in plaats van stilzwijgend getekend', () => {
    expect(() =>
      buildRoutes({
        ...scenario,
        world: { ...world, approach: { ...world.approach, turnRadius: 9 } },
      }),
    ).toThrow(/kink/i);
  });
});
