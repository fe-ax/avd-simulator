/**
 * The builder's safety net, tested against the two scenarios that ship — because if it cannot
 * tell that a working exercise works, it cannot tell you that a broken one is broken.
 */
import { describe, expect, test } from 'vitest';
import { referenceRide, revealTimeline } from '../referenceRide';
import { rechtsafFietspad } from '../scenario.rechtsaf-fietspad';
import { invoegenSnelweg } from '../scenario.invoegen-snelweg';
import { findObstructions, findOffRoad } from '../validate';
import { buildRoutes } from '../route';
import type { Scenario } from '../types';

const EXTENT = { minX: -85, maxX: 150, minY: -300, maxY: 220 };

describe('de modelrit', () => {
  test.each([
    ['Rechtsaf de Kerkstraat in', rechtsafFietspad],
    ['Invoegen op de A12', invoegenSnelweg],
  ])('%s wordt foutloos gereden', (_label, scenario) => {
    const { record, error } = referenceRide(scenario as Scenario);
    expect(error).toBeNull();
    expect(record.counts).toEqual({ kritiek: 0, fout: 0, opmerking: 0 });
    expect(record.verdict).toBe('geslaagd');
  });

  test('een scenario met een geknikte route komt terug als fout, niet als crash', () => {
    const broken: Scenario = {
      ...rechtsafFietspad,
      world: {
        ...(rechtsafFietspad.world as Extract<Scenario['world'], { kind: 'urbanCrossing' }>),
        approach: { startY: -127.5, turnInY: -7.5, turnRadius: 9, exitX: 55 },
      },
    };
    const { error } = referenceRide(broken);
    expect(error).toMatch(/kink/i);
  });

  test('het plan volgt de meetkunde: een kortere invoegstrook verzet de gasmomenten', () => {
    const world = invoegenSnelweg.world as Extract<Scenario['world'], { kind: 'motorway' }>;
    const shorter: Scenario = {
      ...invoegenSnelweg,
      world: { ...world, ramp: { ...world.ramp, strookStartY: -90 } },
    };
    // A fixed plan would still be waiting to press the throttle at 148 m on a strook that is
    // ninety long, and would blame the scenario for it.
    const { record, error } = referenceRide(shorter);
    expect(error).toBeNull();
    const top = record.samples.reduce((m, s) => Math.max(m, s.speed * 3.6), 0);
    expect(top).toBeGreaterThan(invoegenSnelweg.startSpeedKmh + 30);
  });
});

describe('de onthullingstabel', () => {
  test('laat zien dat de spiegel de snorfiets eerder vindt dan de schouder', () => {
    const rows = revealTimeline(rechtsafFietspad);
    const snorfiets = rows.find((r) => r.actorId === 'snorfiets');
    expect(snorfiets?.full).not.toBeNull();
    expect(snorfiets!.noMirrors!).toBeGreaterThan(snorfiets!.full!);
  });

  test('en dat op de A12 alleen de spiegel de vrachtwagen vindt', () => {
    const rows = revealTimeline(invoegenSnelweg);
    const truck = rows.find((r) => r.actorId === 'vrachtwagen');
    expect(truck?.full).not.toBeNull();
    // Not a bug: ridden properly the truck is still seventy metres back at the merge.
    expect(truck?.noMirrors).toBeNull();
  });
});

describe('de wegcontrole', () => {
  test.each([
    ['Rechtsaf de Kerkstraat in', rechtsafFietspad],
    ['Invoegen op de A12', invoegenSnelweg],
  ])('%s heeft een vrije route', (_label, scenario) => {
    const s = scenario as Scenario;
    expect(findObstructions(s.world, buildRoutes(s), EXTENT)).toEqual([]);
  });

  test.each([
    ['Rechtsaf de Kerkstraat in', rechtsafFietspad],
    ['Invoegen op de A12', invoegenSnelweg],
  ])('%s heeft over de hele route asfalt onder de wielen', (_label, scenario) => {
    // The oprit was described in buildRoutes and not in the surfaces, so the first forty metres
    // of scenario 2 were ridden across the verge and every test still passed.
    const s = scenario as Scenario;
    expect(findOffRoad(s.world, buildRoutes(s), EXTENT)).toEqual([]);
  });

  test('en meldt het als er iets op de weg komt te staan', () => {
    const world = rechtsafFietspad.world as Extract<Scenario['world'], { kind: 'urbanCrossing' }>;
    // Push the hedge in over the carriageway the rider is on.
    const blocked: Scenario = { ...rechtsafFietspad, world: { ...world, road: { ...world.road, vergeTo: 1 } } };
    const found = findObstructions(blocked.world, buildRoutes(blocked), EXTENT);
    expect(found.length).toBeGreaterThan(0);
    // Whatever is nearest the carriageway is what it hits; here the terraces reach in first.
    expect(found.every((o) => o.kind === 'house' || o.kind === 'hedge')).toBe(true);
  });
});
