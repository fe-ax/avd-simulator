import { describe, expect, test } from 'vitest';
import { buildRoutes, findSAtX, poseAt } from '../route';
import { roadSurfaces } from '../roadSurfaces';
import { rechtsafFietspad as scenario } from '../scenario.rechtsaf-fietspad';

const routes = buildRoutes(scenario);
const DEG = 180 / Math.PI;

describe('de route', () => {
  test('start noordwaarts in de rechterrijstrook', () => {
    const start = poseAt(routes.turn, 0);
    expect(start.x).toBeCloseTo(scenario.road.laneCenterX, 5);
    expect(start.y).toBeCloseTo(scenario.approach.startY, 5);
    expect(start.heading * DEG).toBeCloseTo(90, 5);
  });

  test('splitst op het insturpunt', () => {
    expect(routes.decisionS).toBeCloseTo(
      scenario.approach.turnInY - scenario.approach.startY,
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
    expect(after.y).toBeCloseTo(scenario.road.sideLaneCenterY, 5);
  });

  test('rijdt op de rechtdoor-tak gewoon noordwaarts verder', () => {
    const after = poseAt(routes.straight, routes.decisionS + 20);
    expect(after.heading * DEG).toBeCloseTo(90, 5);
    expect(after.x).toBeCloseTo(scenario.road.laneCenterX, 5);
  });
});

describe('het conflictpunt', () => {
  test('ligt op de hartlijn van het fietspad', () => {
    const point = poseAt(routes.turn, routes.conflictS);
    expect(point.x).toBeCloseTo(scenario.conflictX, 2);
  });

  test('ligt tussen het in- en uitrijden van het fietspad', () => {
    expect(routes.crossEntryS).toBeLessThan(routes.conflictS);
    expect(routes.crossExitS).toBeGreaterThan(routes.conflictS);
  });

  test('de doorkruiste strook is minstens zo lang als de motor', () => {
    const [yMin, yMax] = routes.crossYSpan;
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
    const standing = roadSurfaces(scenario.road, {
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

  test('de hoek is open: de heg houdt op bij de zijweg', () => {
    const hedges = roadSurfaces(scenario.road, { minX: -85, maxX: 95, minY: -150, maxY: 65 }).filter(
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

describe('geometriecontrole', () => {
  test('een geknikte route wordt geweigerd in plaats van stilzwijgend getekend', () => {
    expect(() =>
      buildRoutes({
        ...scenario,
        approach: { ...scenario.approach, turnRadius: 9 },
      }),
    ).toThrow(/kink/i);
  });
});
