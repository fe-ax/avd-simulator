import { describe, expect, test } from 'vitest';
import { buildRoutes, findSAtX, poseAt } from '../route';
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
