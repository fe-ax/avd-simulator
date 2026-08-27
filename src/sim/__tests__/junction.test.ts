/**
 * A plain crossroads, and the three ways through it.
 *
 * The point of this world is that the manoeuvre is a choice: straight on is the shape most hazard
 * exercises take, and until this existed it could not be written down at all.
 */
import { describe, expect, test } from 'vitest';
import { buildRoutes, junctionLanes, poseAt } from '../route';
import { roadSurfaces } from '../roadSurfaces';
import { findObstructions, findOffRoad, routePath } from '../validate';
import { rechtsafFietspad } from '../scenario.rechtsaf-fietspad';
import type { Manoeuvre, Scenario, ScenarioWorld } from '../types';

const road = { halfWidth: 3, sideHalfWidth: 3, vergeTo: 11 };
const EXTENT = { minX: -120, maxX: 120, minY: -160, maxY: 120 };

function scenario(manoeuvre: Manoeuvre, giveWay: 'side' | 'main' | 'none' = 'side'): Scenario {
  const world: ScenarioWorld = {
    kind: 'junction',
    road,
    startY: -120,
    runOutM: 55,
    manoeuvre,
    turnRadius: 6,
    giveWay,
  };
  return { ...rechtsafFietspad, id: `j-${manoeuvre}`, world, actors: [] };
}

const MANOEUVRES: Manoeuvre[] = ['straight', 'right', 'left'];

describe('de route door een gewoon kruispunt', () => {
  test('rechtdoor gaat rechtdoor', () => {
    const routes = buildRoutes(scenario('straight'));
    const end = poseAt(routes.turn, routes.turn.total);
    expect(end.x).toBeCloseTo(junctionLanes(road).northbound, 6);
    expect(end.y).toBeGreaterThan(road.sideHalfWidth);
  });

  test('rechtsaf komt uit in de oostelijke rijstrook', () => {
    const routes = buildRoutes(scenario('right'));
    const end = poseAt(routes.turn, routes.turn.total);
    expect(end.x).toBeGreaterThan(road.sideHalfWidth);
    expect(end.y).toBeCloseTo(junctionLanes(road).eastbound, 6);
  });

  test('linksaf komt uit in de westelijke rijstrook, aan de andere kant', () => {
    const routes = buildRoutes(scenario('left'));
    const end = poseAt(routes.turn, routes.turn.total);
    expect(end.x).toBeLessThan(-road.sideHalfWidth);
    expect(end.y).toBeCloseTo(junctionLanes(road).westbound, 6);
  });

  test.each(MANOEUVRES)('%s: de route heeft geen knik', (manoeuvre) => {
    // The turn-in point is derived from the radius rather than given beside it, so the two cannot
    // disagree — and a kink would show up as the heading jumping between two samples.
    const routes = buildRoutes(scenario(manoeuvre));
    let previous = poseAt(routes.turn, 0).heading;
    for (let s = 0.5; s <= routes.turn.total; s += 0.5) {
      const h = poseAt(routes.turn, s).heading;
      let delta = h - previous;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      expect(Math.abs(delta)).toBeLessThan(0.12);
      previous = h;
    }
  });

  test.each(MANOEUVRES)('%s: het conflictpunt is waar je het kruispunt op rijdt', (manoeuvre) => {
    const s = scenario(manoeuvre);
    const routes = buildRoutes(s);
    expect(poseAt(routes.turn, routes.conflictS).y).toBeCloseTo(-road.sideHalfWidth, 1);
  });
});

describe('het wegdek van een gewoon kruispunt', () => {
  test.each(MANOEUVRES)('%s: er ligt asfalt onder de hele route', (manoeuvre) => {
    const s = scenario(manoeuvre);
    expect(findOffRoad(s.world, routePath(buildRoutes(s)), EXTENT)).toEqual([]);
  });

  test.each(MANOEUVRES)('%s: en er staat niets op', (manoeuvre) => {
    const s = scenario(manoeuvre);
    expect(findObstructions(s.world, buildRoutes(s), EXTENT)).toEqual([]);
  });

  test('er ligt geen fietspad — dat is het hele punt van deze weg', () => {
    const kinds = new Set(roadSurfaces(scenario('straight').world, EXTENT).map((x) => x.kind));
    expect(kinds.has('fietspad')).toBe(false);
    expect(kinds.has('asphalt')).toBe(true);
  });

  test('haaientanden staan waar het scenario ze zet, en nergens anders', () => {
    const teeth = (giveWay: 'side' | 'main' | 'none') =>
      roadSurfaces(scenario('straight', giveWay).world, EXTENT).filter(
        (s) => s.kind === 'paint' && s.points.length === 3,
      );
    expect(teeth('none')).toHaveLength(0);
    expect(teeth('side').length).toBeGreaterThan(4);
    expect(teeth('main').length).toBeGreaterThan(4);
    // On the side road they sit outside your carriageway; on yours, outside the side road's.
    // The apex reaches exactly to the edge, because it points at whoever has to stop.
    expect(
      Math.min(...teeth('side').flatMap((t) => t.points.map((p) => Math.abs(p.x)))),
    ).toBeGreaterThanOrEqual(road.halfWidth);
    expect(
      Math.min(...teeth('main').flatMap((t) => t.points.map((p) => Math.abs(p.y)))),
    ).toBeGreaterThanOrEqual(road.sideHalfWidth);
    // And each arm gets its own row, not one shared between them.
    expect(teeth('side')).toHaveLength(6);
    expect(teeth('main')).toHaveLength(6);
  });
});
