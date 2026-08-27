/**
 * Scenario 3, ridden headless. The lesson is the gap between the two lorries: it looks like
 * somewhere to go and it is not, and every assertion here is about whether the scoring says so.
 */
import { describe, expect, test } from 'vitest';
import { driveOvertake } from '../testDriver';
import { referenceRide } from '../referenceRide';
import { inhalenSnelweg } from '../scenario.inhalen-snelweg';
import { buildRoutes } from '../route';
import { findObstructions, findOffRoad, riddenPath } from '../validate';

const EXTENT = { minX: -60, maxX: 60, minY: -100, maxY: 1500 };
const fault = (r: ReturnType<typeof driveOvertake>, id: string) =>
  r.faults.find((f) => f.expectedId === id);

describe('een nette inhaalmanoeuvre', () => {
  const clean = driveOvertake(inhalenSnelweg, {});

  test('haalt het examen zonder aanmerkingen', () => {
    expect(clean.verdict).toBe('geslaagd');
    expect(clean.counts).toEqual({ kritiek: 0, fout: 0, opmerking: 0 });
  });

  test('gaat eruit en komt weer terug', () => {
    expect(clean.laneChanges.map((c) => c.direction)).toEqual(['left', 'right']);
    // And in that order in time, which is the only sense in which an overtake has a shape.
    expect(clean.laneChanges[1].startedAt).toBeGreaterThan(clean.laneChanges[0].completedAt);
  });

  test('wacht op het verkeer links in plaats van er zomaar uit te scheren', () => {
    // The gap only arrives once the cars have gone by; going out before that is going out in
    // front of something doing a hundred and thirty-five.
    expect(clean.laneChanges[0].startedAt).toBeGreaterThan(5);
    expect(clean.incidents).toHaveLength(0);
  });
});

describe('wat er misgaat', () => {
  test('tussen de twee vrachtwagens gaan zitten is de fout waar het om draait', () => {
    const weaver = driveOvertake(inhalenSnelweg, { cutInEarly: true });
    expect(weaver.laneChanges.map((c) => c.direction)).toEqual(['left', 'right']);
    // Back in the right lane far too early: the lorry behind has to do something about it.
    expect(weaver.incidents.length).toBeGreaterThan(0);
    expect(weaver.counts.kritiek).toBeGreaterThan(0);
    expect(weaver.verdict).toBe('gezakt');
  });

  test('helemaal niet inhalen is kritiek: de opdracht is niet uitgevoerd', () => {
    const r = driveOvertake(inhalenSnelweg, { neverOvertake: true });
    expect(r.laneChanges).toHaveLength(0);
    expect(fault(r, 'inhalen')?.severity).toBe('kritiek');
    expect(r.verdict).toBe('gezakt');
  });

  test('links blijven hangen is een fout', () => {
    const r = driveOvertake(inhalenSnelweg, { stayLeft: true });
    expect(r.laneChanges.map((c) => c.direction)).toEqual(['left']);
    expect(fault(r, 'terug-naar-rechts')?.severity).toBe('fout');
  });

  test('uitscheren zonder op het verkeer te letten laat anderen remmen', () => {
    const r = driveOvertake(inhalenSnelweg, { ignoreTraffic: true });
    expect(r.incidents.length).toBeGreaterThan(0);
    expect(r.counts.kritiek).toBeGreaterThan(0);
  });

  test('zonder schouderblik weigert de stuurknop, dus haal je niet in', () => {
    const r = driveOvertake(inhalenSnelweg, { shoulder: false });
    const steer = r.events.find((e) => e.control === 'STEER_LEFT');
    expect(steer?.rejected).toBe(true);
    expect(r.laneChanges).toHaveLength(0);
  });
});

describe('de aanloop telt ook', () => {
  test('op de bumper van de vrachtwagen hangen terwijl je op een gat wacht, is een fout', () => {
    // The whole reason the headway rule stopped waiting for a manoeuvre. On an open motorway there
    // is no manoeuvre to wait for: the rider is behind the lorry from the first frame, and sitting
    // on its bumper while looking for a gap is a real fault the exam watches for. It was measured
    // nowhere until the temporal gate came out.
    const r = driveOvertake(inhalenSnelweg, { tailgate: true });
    const row = r.results.find((x) => x.expectedId === 'afstand-vrachtwagen-1');
    expect(row?.status).toBe('ongewenst');
  });

  test('en netjes wachten op afstand is dat niet', () => {
    const r = driveOvertake(inhalenSnelweg);
    const row = r.results.find((x) => x.expectedId === 'afstand-vrachtwagen-1');
    expect(row?.status).toBe('goed');
  });

  test('wie helemaal niet inhaalt wordt niet alsnog voor volgafstand gepakt', () => {
    // Staying in lane 1 the whole way is its own fault — the assignment was not carried out — and
    // a rider who keeps a sensible distance while doing it should not collect a second one.
    const r = driveOvertake(inhalenSnelweg, { neverOvertake: true });
    expect(r.results.find((x) => x.expectedId === 'afstand-vrachtwagen-1')?.status).toBe('goed');
  });
});

describe('de weg zelf', () => {
  test('is een doorgaande snelweg: geen oprit, geen invoegstrook', () => {
    const world = inhalenSnelweg.world;
    expect(world.kind).toBe('motorway');
    if (world.kind !== 'motorway') return;
    expect(world.stretch.kind).toBe('doorgaand');
  });

  test('heeft over de hele gereden lijn asfalt onder de wielen', () => {
    const { record, error } = referenceRide(inhalenSnelweg);
    expect(error).toBeNull();
    expect(findOffRoad(inhalenSnelweg.world, riddenPath(record.samples), EXTENT)).toEqual([]);
  });

  test('en er staat niets op de route', () => {
    expect(findObstructions(inhalenSnelweg.world, buildRoutes(inhalenSnelweg), EXTENT)).toEqual([]);
  });
});
