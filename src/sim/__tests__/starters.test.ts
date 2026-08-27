/**
 * The blank roads the builder starts from. They are not exercises, but they still have to ride —
 * a starting point you cannot open is not one.
 */
import { describe, expect, test } from 'vitest';
import { STARTERS } from '../starters';
import { buildRoutes } from '../route';
import { referenceRide } from '../referenceRide';
import { findObstructions, findOffRoad, riddenPath, routePath } from '../validate';
import { exportScenario, toSource } from '../scenarioExport';
import type { Scenario } from '../types';

const EXTENT = { minX: -140, maxX: 140, minY: -200, maxY: 1000 };
const cases = STARTERS.map((s) => [s.title, s] as const);

describe('lege startpunten', () => {
  test.each(cases)('%s is te bouwen en te berijden', (_l, scenario) => {
    expect(() => buildRoutes(scenario)).not.toThrow();
    expect(referenceRide(scenario as Scenario).error).toBeNull();
  });

  test.each(cases)('%s heeft asfalt onder de hele route', (_l, scenario) => {
    const s = scenario as Scenario;
    expect(findOffRoad(s.world, routePath(buildRoutes(s)), EXTENT)).toEqual([]);
    expect(findObstructions(s.world, buildRoutes(s), EXTENT)).toEqual([]);
  });

  test.each(cases)('%s heeft ook asfalt onder de gereden lijn, niet alleen onder de route', (_l, scenario) => {
    // The route is the spine; after a lane change the machine is metres to the left of it, and a
    // motorway starter's ride is nine hundred metres long. Asking about the route rather than the
    // ride is how the builder came to tell anyone starting a blank motorway that the road ran out
    // after a hundred and seventy metres — the extent it asked with framed the picture, not the ride.
    const s = scenario as Scenario;
    const { record, error } = referenceRide(s);
    expect(error).toBeNull();
    const path = riddenPath(record.samples);
    const margin = 20;
    const bounds = {
      minX: Math.min(...path.map((p) => p.x)) - margin,
      maxX: Math.max(...path.map((p) => p.x)) + margin,
      minY: Math.min(...path.map((p) => p.y)) - margin,
      maxY: Math.max(...path.map((p) => p.y)) + margin,
    };
    expect(findOffRoad(s.world, path, bounds)).toEqual([]);
  });

  test.each(cases)('%s beoordeelt nog niets, en dat is de bedoeling', (_l, scenario) => {
    // A starter that arrived with plausible-looking rules would have them quietly outlive
    // whatever the author actually meant to build.
    expect((scenario as Scenario).expected).toEqual([]);
    expect((scenario as Scenario).actors).toEqual([]);
  });

  test.each(cases)('%s exporteert als een heel bestand, niet als een afgeleide', (_l, scenario) => {
    const out = exportScenario(scenario as Scenario, null);
    expect(out.source).not.toContain('...');
    expect(out.source).toContain('export const');
    // And what it emits reads back as what went in.
    const literal = out.source.slice(out.source.indexOf('= {'), out.source.lastIndexOf(';'));
    const back = new Function(`return (${literal.slice(2)});`)();
    expect(back).toEqual(scenario);
  });

  test('een heel scenario overleeft toSource woord voor woord', () => {
    for (const s of STARTERS) {
      expect(new Function(`return (${toSource(s)});`)()).toEqual(s);
    }
  });
});
