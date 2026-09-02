/**
 * Linksaf de Molenweg in — the first exercise that turns left, and the first where the rider is
 * the one who has to give way.
 *
 * Both halves of that were buildable long before this scenario existed. `buildJunctionRoutes` has
 * carried the mirrored quarter-circle since the routes were written, and `giveWay` has always had
 * three settings. What had never been done was *ride* one, and riding one turned up three separate
 * places where the tool quietly assumed a right turn onto a road where somebody else waits.
 *
 * So the tests here are mostly about those, not about the Dutch prose:
 *
 * 1. **A junction could not raise an incident at all.** `actorConflicts` opened with a branch guard
 *    — sensible on the Kerkstraat, where the rider peels off onto a side road — and a junction has
 *    one route and leaves `branch` at 'approach' for the whole ride. So the guard was never once
 *    satisfied, and every junction scenario was structurally incapable of noticing that the rider
 *    had driven into somebody. *Auto van rechts remt* hid this for months because its car brakes on
 *    a scripted cue rather than because anything is in its way.
 *
 * 2. **The model rider read priority off the paint.** `yieldToActor` came from `giveWay` alone,
 *    which says who yields at the *side road* and nothing whatever about oncoming traffic. On a
 *    voorrangsweg that produced a model rider who turned left across a car doing fifty and scored a
 *    clean ride — the tool asserting, in Dutch, the exact misconception this exercise exists to
 *    correct.
 *
 * 3. **It braked at a fixed twelve metres.** Fine at walking pace on the Kerkstraat; at 38 km/h it
 *    needs twelve and a half to stop, so the rider that "gave way" rolled *past* the conflict point
 *    and parked in the middle of the junction two metres from the car it was waiting for. Where you
 *    start braking is a fact about the speed you are carrying, and it is derived now.
 *
 * The numbers below are measurements of the ride, not thresholds chosen to pass. Three metres is
 * the lane separation: a rider waiting properly is in its own lane and the car passes in its own.
 */
import { describe, expect, it } from 'vitest';
import { linksafTegenliggers } from '../scenario.linksaf-tegenliggers';
import { autoVanRechts } from '../scenario.auto-van-rechts';
import { referenceRide, unscoredActors } from '../referenceRide';
import { buildRoutes } from '../route';
import { findObstructions, findOffRoad } from '../validate';
import { driveRun } from '../testDriver';
import type { RunRecord } from '../types';

/** How near the two bodies ever get, over the whole ride. */
function closestApproach(record: RunRecord): { metres: number; t: number } {
  const track = record.actorTracks['weggebruiker-1'];
  let metres = Infinity;
  let t = 0;
  for (const s of record.samples) {
    const a = track.find((p) => Math.abs(p.t - s.t) < 0.02);
    if (!a) continue;
    const sep = Math.hypot(a.x - s.x, a.y - s.y);
    if (sep < metres) {
      metres = sep;
      t = s.t;
    }
  }
  return { metres, t };
}

describe('de rit zelf', () => {
  it('is schoon te rijden', () => {
    const { record, error } = referenceRide(linksafTegenliggers);
    expect(error).toBeNull();
    expect(record.counts).toEqual({ opmerking: 0, fout: 0, kritiek: 0 });
    expect(record.verdict).toBe('geslaagd');
  });

  it('heeft asfalt onder de hele bocht en niets dat erin steekt', () => {
    // Asked about the ridden path rather than the route: the spine is where the machine aims, and
    // a left turn puts it metres left of that for most of the manoeuvre.
    const { record } = referenceRide(linksafTegenliggers);
    const xs = record.samples.map((s) => s.x);
    const ys = record.samples.map((s) => s.y);
    const ext = {
      minX: Math.min(...xs) - 120, maxX: Math.max(...xs) + 120,
      minY: Math.min(...ys) - 120, maxY: Math.max(...ys) + 120,
    };
    const path = record.samples.map((s) => ({ x: s.x, y: s.y }));
    expect(findOffRoad(linksafTegenliggers.world, path, ext)).toEqual([]);
    expect(findObstructions(linksafTegenliggers.world, buildRoutes(linksafTegenliggers), ext)).toEqual([]);
  });

  it('maakt de bocht af, zodat een regel ná de bocht iets te meten heeft', () => {
    // `manoeuvreCompletedAt` was null on every junction ever written: the completion test summed
    // the two turn segments and compared against a `decisionS` deliberately placed past the end of
    // the route, so it was unreachable. Every `afterTurn` rule on a junction silently produced no
    // row — not a miss, no row — and the richtingaanwijzer went unscored while looking scored.
    const { record } = referenceRide(linksafTegenliggers);
    expect(record.manoeuvreCompletedAt).not.toBeNull();
    expect(record.manoeuvreCompletedAt!).toBeGreaterThan(0);
  });
});

describe('wachten op de tegenligger', () => {
  it('laat de auto met rust als je wacht', () => {
    const record = referenceRide(linksafTegenliggers).record;
    expect(record.incidents).toEqual([]);
    // Three metres, which is the distance between the two lane centres. The rider waited on its
    // own side and the car went past on its: nobody had to do anything.
    expect(closestApproach(record).metres).toBeGreaterThan(2.9);
  });

  it('en staat stil vóór het conflictpunt, niet erop', () => {
    // Where a rider stops is the whole difference between giving way and being in the way. A fixed
    // braking distance put this at d = -1: past the point it was waiting to reach, in the middle
    // of the junction.
    const record = referenceRide(linksafTegenliggers).record;
    const stopped = record.samples.filter((s) => s.speed < 1 && s.d > -30);
    expect(stopped.length).toBeGreaterThan(0);
    for (const s of stopped) expect(s.d).toBeGreaterThan(0);
  });

  it('en wie niet wacht, rijdt er echt tegenaan', () => {
    // The assertion that keeps this exercise from being a formality: not "was a rule missed" but
    // "did the two bodies genuinely come together". Under a metre is contact between a car and a
    // motorcycle, and the car is doing fifty when it starts braking for it.
    const record = driveRun(linksafTegenliggers, { yieldToActor: false, anticipate: false });
    const { metres } = closestApproach(record);
    expect(metres).toBeLessThan(1.5);

    expect(record.incidents).toHaveLength(1);
    expect(record.incidents[0]).toMatchObject({
      actorId: 'weggebruiker-1',
      kind: 'emergency_brake',
      wasPerceived: true,
    });
    expect(record.counts.kritiek).toBe(1);
    expect(record.verdict).toBe('gezakt');
  });

  it('en de tegenligger is dus geen decor', () => {
    const { record } = referenceRide(linksafTegenliggers);
    expect(unscoredActors(linksafTegenliggers, record)).toEqual([]);
  });
});

describe('voorrang op de zijweg is geen voorrang op de tegenligger', () => {
  it('geeft de modelrijder voorrang, ook al staan de haaientanden in de zijweg', () => {
    // The misconception the exercise is about, pinned as a property of the harness rather than of
    // the prose: this world says `giveWay: 'side'`, so reading priority off the paint alone gives a
    // model rider that does not wait. It has to wait because it is turning left.
    expect(linksafTegenliggers.world.kind).toBe('junction');
    if (linksafTegenliggers.world.kind !== 'junction') return;
    expect(linksafTegenliggers.world.giveWay).toBe('side');
    expect(linksafTegenliggers.world.manoeuvre).toBe('left');

    const record = referenceRide(linksafTegenliggers).record;
    const waited = record.samples.some((s) => s.speed < 1 && s.d > 0 && s.d < 30);
    expect(waited).toBe(true);
  });

  it('maar laat rechtdoor met voorrang gewoon doorrijden', () => {
    // The other half of the same rule, and the reason it is not simply "always yield": on the
    // crossroads next door the rider has priority and is meant to keep it. If this ever starts
    // waiting, the derivation has been over-applied.
    const record = referenceRide(autoVanRechts).record;
    expect(record.counts).toEqual({ opmerking: 0, fout: 0, kritiek: 0 });
    const crawled = record.samples.some((s) => s.speed < 1 && s.d > 0 && s.d < 30);
    expect(crawled).toBe(false);
  });
});
