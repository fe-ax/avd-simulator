/**
 * Voorrang van rechts — the gelijkwaardig kruispunt, and the deliberate inverse of the crossroads
 * next door.
 *
 * *Auto van rechts remt* and this one are the same junction with opposite obligations, and the
 * only thing that tells them apart is what is **not** painted on it. So the first thing pinned here
 * is the absence: no haaientanden, no borden. A B6 appearing on this road would not look like a
 * bug — it would look like a road — and it would quietly turn the exercise into the other one.
 *
 * The second is the reveal table, which is the first in this project with three genuinely different
 * columns. The car sits about 44° off the rider's nose on the approach and `FORWARD_VIEW` reaches
 * 31°, so a rider who never turns their head does not see it for eleven and a half seconds longer
 * than one who looks right. That is the whole lesson stated as a number, and it is measured rather
 * than asserted: if the junction, the speeds or the view ever move, this says so.
 *
 * The third is the thing that made the scenario real. As first written the car was 90 m out and
 * reached the junction three seconds before the rider — through and gone, no conflict possible for
 * anybody who eased off, which is every rider the exercise is written for. Nothing was wrong with
 * any rule; the traffic was simply in the wrong place, and `unscoredActors` was what said so.
 */
import { describe, expect, it } from 'vitest';
import { voorrangVanRechts } from '../scenario.voorrang-van-rechts';
import { autoVanRechts } from '../scenario.auto-van-rechts';
import { analyseScenario, referenceRide, unscoredActors } from '../referenceRide';
import { roadSurfaces } from '../roadSurfaces';
import { junctionGiveWay } from '../surfaces/junction';
import { buildRoutes } from '../route';
import { findObstructions, findOffRoad } from '../validate';
import type { RunRecord } from '../types';

const extentOf = (record: RunRecord) => {
  const xs = record.samples.map((s) => s.x);
  const ys = record.samples.map((s) => s.y);
  return {
    minX: Math.min(...xs) - 130, maxX: Math.max(...xs) + 130,
    minY: Math.min(...ys) - 130, maxY: Math.max(...ys) + 130,
  };
};

function closestApproach(record: RunRecord): number {
  const track = record.actorTracks['weggebruiker-1'];
  let metres = Infinity;
  for (const s of record.samples) {
    const a = track.find((p) => Math.abs(p.t - s.t) < 0.02);
    if (a) metres = Math.min(metres, Math.hypot(a.x - s.x, a.y - s.y));
  }
  return metres;
}

describe('een kruispunt zonder iets erop', () => {
  it('draagt geen haaientanden en geen voorrangsborden', () => {
    // The absence is the exercise. Both come off `giveWay`, so this is really one assertion about
    // one field — which is exactly why it is safe to make: nothing can add teeth without a plate,
    // or a plate without teeth.
    if (voorrangVanRechts.world.kind !== 'junction') throw new Error('geen kruispunt');
    // Asked of the generators themselves. Teeth come out as `paint` like every other marking, so
    // a filter on the surface kind cannot tell them from a lane line — and would pass whatever the
    // road actually carried.
    expect(junctionGiveWay(voorrangVanRechts.world.road, 'none')).toEqual([]);
    const { record } = referenceRide(voorrangVanRechts);
    const surfaces = roadSurfaces(voorrangVanRechts.world, extentOf(record), 30);
    expect(surfaces.filter((s) => s.sign?.type === 'giveWay')).toEqual([]);
    expect(surfaces.filter((s) => s.sign?.type === 'priorityRoad')).toEqual([]);
  });

  it('en is verder dezelfde weg als het kruispunt ernaast', () => {
    // The pair only teaches if the two roads are otherwise alike; if this one were also narrower,
    // or straighter, a rider could tell them apart without reading the priority at all.
    if (voorrangVanRechts.world.kind !== 'junction') throw new Error('geen kruispunt');
    if (autoVanRechts.world.kind !== 'junction') throw new Error('geen kruispunt');
    expect(voorrangVanRechts.world.road.halfWidth).toBe(autoVanRechts.world.road.halfWidth);
    expect(voorrangVanRechts.world.road.sideHalfWidth).toBe(autoVanRechts.world.road.sideHalfWidth);
    expect(voorrangVanRechts.world.manoeuvre).toBe(autoVanRechts.world.manoeuvre);
    // And the one field that differs is the one the lesson is about.
    expect(voorrangVanRechts.world.giveWay).toBe('none');
    expect(autoVanRechts.world.giveWay).toBe('side');
  });
});

describe('de rit', () => {
  it('is schoon te rijden', () => {
    const { record, error } = referenceRide(voorrangVanRechts);
    expect(error).toBeNull();
    expect(record.counts).toEqual({ opmerking: 0, fout: 0, kritiek: 0 });
    expect(record.verdict).toBe('geslaagd');
  });

  it('met asfalt onder de hele rit en niets dat erin steekt', () => {
    const { record } = referenceRide(voorrangVanRechts);
    const ext = extentOf(record);
    const path = record.samples.map((s) => ({ x: s.x, y: s.y }));
    expect(findOffRoad(voorrangVanRechts.world, path, ext)).toEqual([]);
    expect(findObstructions(voorrangVanRechts.world, buildRoutes(voorrangVanRechts), ext)).toEqual([]);
  });

  it('en de auto hoeft niets te doen als je hem voor laat gaan', () => {
    const { record } = referenceRide(voorrangVanRechts);
    expect(record.incidents).toEqual([]);
    expect(closestApproach(record)).toBeGreaterThan(10);
  });
});

describe('wie doorrijdt', () => {
  it('komt hem echt tegen', () => {
    // Under two and a half metres between a car and a motorcycle, at the point where the rider's
    // lane crosses the car's. The car is where it is because of this number: 90 m out it arrived
    // three seconds early and this ride passed cleanly without anybody having read anything.
    const { record } = referenceRide(voorrangVanRechts, { yieldToActor: false });
    expect(closestApproach(record)).toBeLessThan(2.5);
    expect(record.incidents).toHaveLength(1);
    expect(record.incidents[0]).toMatchObject({ kind: 'emergency_brake', wasPerceived: true });
    expect(record.counts.kritiek).toBe(1);
    expect(record.verdict).toBe('gezakt');
  });

  it('maar wie hard remt omdat hij het ziet, wordt daar niet voor gestraft', () => {
    // The rider who arrives at thirty, reads it late and stands on the brake. That is a bad
    // approach and it is marked as one — but it is not a gevaarzetting, because nobody had to do
    // anything about it: nearly nine metres of clearance at the closest.
    //
    // It used to score a kritiek, and the reason was the car rather than the rule: 37 m nearer, it
    // reached the junction while this rider was still doing thirty, so the two really were on a
    // collision course and only the late brake resolved it. Moving the car to where the timing
    // says it belongs is what gives a late reader room to recover.
    const { record } = referenceRide(voorrangVanRechts, { slowDown: false, gear: false });
    expect(closestApproach(record)).toBeGreaterThan(5);
    expect(record.incidents).toEqual([]);
    expect(record.counts.kritiek).toBe(0);
    // And the approach itself is still marked.
    expect(record.counts.fout).toBeGreaterThan(0);
  });
});

describe('naar rechts kijken is het hele punt', () => {
  it('scheelt meer dan tien seconden', () => {
    // The first reveal table in this project whose three columns genuinely differ. The car is ~44°
    // off the nose and the forward view reaches 31°, so riding in staring straight ahead really
    // does hide it. If these converge, either the junction moved or the view widened.
    const reveal = analyseScenario(voorrangVanRechts).reveals[0];
    expect(reveal.full).not.toBeNull();
    expect(reveal.noLooks).not.toBeNull();
    expect(reveal.noLooks! - reveal.full!).toBeGreaterThan(9);
    // The mirrors add nothing, and should not: the car is ahead and to the right, and no mirror
    // points there. Scenario 2 has the same flat pair for the same reason.
    expect(reveal.noMirrors).toBeCloseTo(reveal.full!, 1);
  });

  it('en de auto staat niet achter een huis als je hem ziet', () => {
    // Perception is angular and knows nothing about buildings, so a scenario can credit a look at
    // something behind a terrace. That was a real defect on the crossroads next door; the corner
    // is open here and this is what keeps it open.
    const { hidden } = analyseScenario(voorrangVanRechts);
    expect(hidden).toEqual([]);
  });

  it('en de auto is geen decor', () => {
    const { record } = referenceRide(voorrangVanRechts);
    expect(unscoredActors(voorrangVanRechts, record)).toEqual([]);
  });
});
