/**
 * Voorrang verlenen op de zijweg — the rider behind the haaientanden, and the car from the left.
 *
 * Two things are worth pinning here, and the second is the interesting one.
 *
 * The first is ordinary: the teeth and the B6 are in the rider's own lane, the model rider arrives
 * slowly enough to stop and stops, and a rider who barges across meets the car at 2,4 m and takes a
 * kritiek for it.
 *
 * The second is a measurement that says the scenario cannot teach what it was written to teach.
 * The last look of the reeks was meant to be the one that finds the car; it is not, and the reason
 * is arithmetic rather than tuning. `EYE_LEFT` turns the head 25° and the forward view reaches 31°
 * beyond, so a glance covers to 56° off the nose. At the give-way line the car is 72,9° off it.
 * Worse, the two requirements are incompatible: a car near enough to sit inside 56° at the line is
 * near enough to be gone before the rider gets there.
 *
 * That is asserted here rather than explained away, because it is exactly the kind of thing that
 * quietly comes right when somebody widens a view for an unrelated reason — and then nobody knows
 * the scenario got better. If these numbers move, this file says so.
 */
import { describe, expect, it } from 'vitest';
import { zijwegVoorrangVerlenen } from '../scenario.zijweg-voorrang-verlenen';
import { analyseScenario, referenceRide, unscoredActors } from '../referenceRide';
import { FORWARD_VIEW, LOOK_DIRECTIONS } from '../perception';
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

describe('de haaientanden liggen bij de rijder', () => {
  it('in zijn eigen rijstrook, met het bord erbij', () => {
    if (zijwegVoorrangVerlenen.world.kind !== 'junction') throw new Error('geen kruispunt');
    // Both come off `giveWay`, so asking the generator is asking the one field. With 'main' the
    // teeth stand off along y — beside the rider's own road — rather than along x.
    const teeth = junctionGiveWay(zijwegVoorrangVerlenen.world.road, 'main');
    expect(teeth.length).toBeGreaterThan(0);
    for (const t of teeth) {
      const cy = (Math.min(...t.points.map((p) => p.y)) + Math.max(...t.points.map((p) => p.y))) / 2;
      const cx = (Math.min(...t.points.map((p) => p.x)) + Math.max(...t.points.map((p) => p.x))) / 2;
      expect(Math.abs(cy)).toBeGreaterThan(Math.abs(cx));
    }
  });
});

describe('de rit', () => {
  it('is schoon te rijden', () => {
    const { record, error } = referenceRide(zijwegVoorrangVerlenen);
    expect(error).toBeNull();
    expect(record.counts).toEqual({ opmerking: 0, fout: 0, kritiek: 0 });
    expect(record.verdict).toBe('geslaagd');
  });

  it('met asfalt onder de hele rit en niets dat erin steekt', () => {
    const { record } = referenceRide(zijwegVoorrangVerlenen);
    const ext = extentOf(record);
    const path = record.samples.map((s) => ({ x: s.x, y: s.y }));
    expect(findOffRoad(zijwegVoorrangVerlenen.world, path, ext)).toEqual([]);
    expect(
      findObstructions(zijwegVoorrangVerlenen.world, buildRoutes(zijwegVoorrangVerlenen), ext),
    ).toEqual([]);
  });

  it('en de rijder staat stil vóór de tanden, niet erop', () => {
    // What giving way at a line actually looks like, and it is not free: from fifty the throttle
    // alone cannot shed enough, so the rider has to brake for the line rather than for the car.
    // Without that it was still doing 42 km/h at twenty metres and provoked the car it was
    // supposed to be waiting for — the model rider failing its own exercise while the rider who
    // barged across passed, because that one was through before the car arrived.
    const { record } = referenceRide(zijwegVoorrangVerlenen);
    const stopped = record.samples.filter((s) => s.speed < 1 && s.d > -30);
    expect(stopped.length).toBeGreaterThan(0);
    for (const s of stopped) expect(s.d).toBeGreaterThan(0);
    expect(record.incidents).toEqual([]);
  });

  it('en wie toch oversteekt, komt hem echt tegen — zonder hem ooit gezien te hebben', () => {
    // `wasPerceived` is false here, and it is the same finding as the one below wearing different
    // clothes: no look this tool has reaches 73° off the nose, so the rider who crosses does it
    // genuinely blind. Which is the right answer to score a kritiek for — you may not cross a
    // priority road on the assumption that it is clear — but it is not the usual one. Everywhere
    // else in this project a kritiek means the rider saw the hazard and went anyway.
    const { record } = referenceRide(zijwegVoorrangVerlenen, { yieldToActor: false });
    expect(closestApproach(record)).toBeLessThan(2.5);
    expect(record.incidents).toHaveLength(1);
    expect(record.incidents[0]).toMatchObject({ kind: 'emergency_brake', wasPerceived: false });
    expect(record.counts.kritiek).toBe(1);
    expect(record.verdict).toBe('gezakt');
  });

  it('en de auto is geen decor', () => {
    const { record } = referenceRide(zijwegVoorrangVerlenen);
    expect(unscoredActors(zijwegVoorrangVerlenen, record)).toEqual([]);
  });
});

describe('de blik naar links haalt hem niet, en dat is meetbaar', () => {
  it('want een blik reikt 56° en de auto staat op 73°', () => {
    // The arithmetic, stated as the two numbers it comes from rather than as a conclusion.
    const reach = LOOK_DIRECTIONS.EYE_LEFT.yaw + FORWARD_VIEW.halfAngleDeg;
    expect(reach).toBeCloseTo(56, 0);

    const { record } = referenceRide(zijwegVoorrangVerlenen);
    const track = record.actorTracks['weggebruiker-1'];
    const looks = record.events.filter((e) => e.control === 'EYE_LEFT' && e.phase === 'press');
    expect(looks.length).toBeGreaterThan(0);

    const last = looks[looks.length - 1];
    const s = record.samples.reduce((a, b) => (Math.abs(b.t - last.t) < Math.abs(a.t - last.t) ? b : a));
    const a = track.reduce((p, q) => (Math.abs(q.t - last.t) < Math.abs(p.t - last.t) ? q : p));
    let off = ((Math.atan2(a.y - s.y, a.x - s.x) - s.heading) * 180) / Math.PI;
    while (off > 180) off -= 360;
    // Off the nose at the give-way line, and well outside what a glance covers.
    expect(off).toBeGreaterThan(reach);
    expect(off).toBeCloseTo(72.9, 0);
  });

  it('dus alle drie de kolommen van de onthullingstabel zijn gelijk', () => {
    // Flat for a reason worth knowing, and not scenario 4's reason. There the traffic is all ahead
    // of you and the forward view finds it whatever you do; here there is something to look at and
    // no look that reaches it. If these ever separate, the view widened — say so in the commit.
    const reveal = analyseScenario(zijwegVoorrangVerlenen).reveals[0];
    expect(reveal.full).not.toBeNull();
    expect(reveal.noMirrors).toBeCloseTo(reveal.full!, 1);
    expect(reveal.noLooks).toBeCloseTo(reveal.full!, 1);
  });

  it('en niets wordt gecrediteerd dat achter een huis staat', () => {
    expect(analyseScenario(zijwegVoorrangVerlenen).hidden).toEqual([]);
  });
});
