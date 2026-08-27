import { describe, expect, test } from 'vitest';
import type { RoadExtent, Surface } from '../roadSurfaces';
import { motorwayLanes, motorwaySurfaces } from '../surfaces/motorway';
import type { MotorwayRoad, ScenarioWorld } from '../types';

/**
 * A carriageway shaped like the one scenario 2 rides on: two rijstroken, an invoegstrook, and the
 * band of blokmarkering between them. Written out here rather than read from the scenario because
 * these tests are about the geometry a set of widths implies, not about which widths were chosen.
 */
const road: MotorwayRoad = {
  laneCount: 2,
  laneWidth: 3.5,
  leftEdgeX: 0.3,
  mergeLaneWidth: 3.5,
  blockBandWidth: 0.5,
  bermWidth: 4,
};

/**
 * Long, because a motorway is. Over a stretch that holds two hectometerpaaltjes, "every hundred
 * metres" is not something a test can fail.
 */
const ext: RoadExtent = { minX: -60, maxX: 60, minY: -200, maxY: 900 };

const stretch = {
  kind: 'oprit',
  ramp: { radius: 120, sweepDeg: 18, strookStartY: -150 },
  mergeEndY: 0,
  taperM: 100,
  runOutM: 120,
} as const;

const world = { kind: 'motorway', road, stretch } satisfies Extract<
  ScenarioWorld,
  { kind: 'motorway' }
>;

const lanes = motorwayLanes(road);
const everything = motorwaySurfaces(world, ext);

/**
 * The oprit is a curve, so its quads are not axis-aligned. The assertions below are about the
 * straight carriageway and read a surface's extremes as if they said everything about it, which
 * is only true of a rectangle — so they work on the rectangles, and the ramp is checked on its
 * own terms further down.
 */
const isRect = (s: Surface) =>
  new Set(s.points.map((p) => p.x)).size <= 2 && new Set(s.points.map((p) => p.y)).size <= 2;

const all = everything.filter(isRect);

/** Every surface here is a rectangle, so its extremes say everything about where it is. */
const bounds = (s: Surface) => {
  const xs = s.points.map((p) => p.x);
  const ys = s.points.map((p) => p.y);
  return { x1: Math.min(...xs), x2: Math.max(...xs), y1: Math.min(...ys), y2: Math.max(...ys) };
};

const boundsOf = (kind: Surface['kind']) =>
  all
    .filter((s) => s.kind === kind)
    .map(bounds)
    .sort((a, b) => a.y1 - b.y1);

/** The marking sitting on the boundary at `x`, from south to north. */
const paintAt = (x: number) => boundsOf('paint').filter((b) => b.x1 <= x && b.x2 >= x);

/** Where a run of y-spans fails to cover the extent — what "doorgetrokken" must not have. */
const gapsAlongY = (spans: { y1: number; y2: number }[]) => {
  const gaps: [number, number][] = [];
  let reach = ext.minY;
  for (const span of spans) {
    if (span.y1 > reach + 1e-9) gaps.push([reach, span.y1]);
    reach = Math.max(reach, span.y2);
  }
  if (reach < ext.maxY - 1e-9) gaps.push([reach, ext.maxY]);
  return gaps;
};

const LINE_WIDTH = 0.15;

describe('de belijning', () => {
  test('de linker kantstreep is doorgetrokken, nergens een onderbreking', () => {
    const streep = paintAt(lanes.leftEdgeX);
    expect(streep.length).toBeGreaterThan(0);
    expect(gapsAlongY(streep)).toEqual([]);
    for (const deel of streep) expect(deel.x2 - deel.x1).toBeCloseTo(LINE_WIDTH, 6);
  });

  test('en de rechter volgt de weg die hij begrenst', () => {
    // Out at the strook up to the deadline, then in along the puntstuk, then hard against the
    // carriageway. Unbroken, but not straight — an edge line that ran straight on past a lane
    // that has ended would be drawing a lane that is not there.
    const beforeTaper = paintAt(lanes.mergeTo);
    expect(beforeTaper).toHaveLength(1);
    expect(beforeTaper[0].y1).toBeCloseTo(ext.minY, 6);
    expect(beforeTaper[0].y2).toBeCloseTo(stretch.mergeEndY, 6);

    const afterTaper = paintAt(lanes.rightEdgeX).filter((b) => b.y1 >= stretch.mergeEndY);
    expect(afterTaper.length).toBeGreaterThan(0);
    expect(Math.min(...afterTaper.map((b) => b.y1))).toBeCloseTo(stretch.mergeEndY + stretch.taperM, 6);
  });

  test('de invoegstrook houdt een keer op', () => {
    const strook = everything.filter(
      (s) => s.kind === 'asphalt' && s.points.some((p) => p.x > lanes.rightEdgeX + 0.5),
    );
    const end = Math.max(...strook.flatMap((s) => s.points.map((p) => p.y)));
    expect(end).toBeCloseTo(stretch.mergeEndY + stretch.taperM, 6);
    // And it narrows to nothing rather than stopping square, which would be a wall.
    const taper = strook.find((s) => s.points.length === 3);
    expect(taper).toBeDefined();
  });

  test('de strookgrens is 3 m streep en 9 m tussenruimte', () => {
    const strepen = paintAt(lanes.laneBoundaries[0]);
    expect(strepen.length).toBeGreaterThan(50);
    for (const streep of strepen) {
      expect(streep.y2 - streep.y1).toBeCloseTo(3, 6);
      expect(streep.x2 - streep.x1).toBeCloseTo(LINE_WIDTH, 6);
    }
    for (let i = 1; i < strepen.length; i++) {
      expect(strepen[i].y1 - strepen[i - 1].y2).toBeCloseTo(9, 6);
    }
  });

  test('blokmarkering ligt alleen tussen invoegstrook en rijstrook 1', () => {
    // A block is a marking wider than a line; in the geometry that is the whole difference.
    const blokken = boundsOf('paint').filter((b) => b.x2 - b.x1 > LINE_WIDTH * 1.5);
    expect(blokken.length).toBeGreaterThan(100);
    for (const blok of blokken) {
      expect(blok.x1).toBeCloseTo(lanes.blockFrom, 6);
      expect(blok.x2).toBeCloseTo(lanes.blockTo, 6);
      expect(blok.y2 - blok.y1).toBeCloseTo(0.9, 6);
    }

    // And nothing wider than a line sits on any other boundary: blokmarkering on a strookgrens
    // between two through lanes would say that lane ends, which would be a lie about the road.
    for (const x of [lanes.leftEdgeX, ...lanes.laneBoundaries, lanes.mergeTo]) {
      for (const marking of paintAt(x)) {
        expect(marking.x2 - marking.x1).toBeLessThanOrEqual(LINE_WIDTH + 1e-9);
      }
    }
  });
});

describe('de berm', () => {
  test('de hectometerpaaltjes staan om de honderd meter, rechts van de weg', () => {
    const paaltjes = boundsOf('hectometerPost');
    const midden = (b: { y1: number; y2: number }) => (b.y1 + b.y2) / 2;
    // −200 tot en met 900: elke hele hectometer binnen het gebied, geen enkele erbuiten.
    expect(paaltjes).toHaveLength(12);
    for (let i = 1; i < paaltjes.length; i++) {
      expect(midden(paaltjes[i]) - midden(paaltjes[i - 1])).toBeCloseTo(100, 9);
    }
    for (const paaltje of paaltjes) {
      // Op een hele hectometer, niet slechts honderd meter uit elkaar: het nummer op een paaltje
      // is een plaats op de weg, en die telt vanaf de weg en niet vanaf de rand van het gebied.
      expect(midden(paaltje) / 100).toBeCloseTo(Math.round(midden(paaltje) / 100), 9);
      expect(paaltje.x1).toBeGreaterThan(lanes.mergeTo);
    }
  });

  test('niets wat overeind staat komt op de rijbaan', () => {
    // Anything with height is a wall once there is a third dimension, and the plan view hides
    // that: a tree drawn under the asphalt looks like nothing at all from above.
    const staand = all.filter((s) => s.height > 0);
    expect(staand.length).toBeGreaterThan(0);
    expect(new Set(staand.map((s) => s.kind))).toEqual(
      new Set(['tree', 'guardrail', 'hectometerPost']),
    );

    for (const surface of staand) {
      const b = bounds(surface);
      const linksVanDeWeg = b.x2 <= lanes.leftEdgeX;
      const rechtsVanDeWeg = b.x1 >= lanes.mergeTo;
      expect(linksVanDeWeg || rechtsVanDeWeg).toBe(true);
    }

    // The geleiderail stands outside the left kantstreep, the paaltjes and the bomen beyond the
    // right one — which side each is on is as load-bearing as being off the road at all.
    for (const rail of boundsOf('guardrail')) expect(rail.x2).toBeLessThan(lanes.leftEdgeX);
    for (const paaltje of boundsOf('hectometerPost')) expect(paaltje.x1).toBeGreaterThan(lanes.mergeTo);
  });
});

describe('de oprit', () => {
  // Non-rectangles south of where the strook begins: the puntstuk is a triangle too, but it
  // lives at the far end of the road.
  const ramp = everything.filter(
    (s) => !isRect(s) && s.points.every((p) => p.y < stretch.ramp.strookStartY),
  );

  test('bestaat', () => {
    expect(ramp.filter((s) => s.kind === 'asphalt').length).toBeGreaterThan(20);
  });

  test('sluit precies aan op de invoegstrook', () => {
    // At the end of the sweep the two radii have to land on the strook's own two edges, or
    // there is a step in the road where the curve meets the straight.
    const asphalt = ramp.filter((s) => s.kind === 'asphalt');
    const last = asphalt.reduce((a, b) => (Math.max(...b.points.map((p) => p.y)) > Math.max(...a.points.map((p) => p.y)) ? b : a));
    const xs = last.points.map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(lanes.mergeFrom, 1);
    expect(Math.max(...xs)).toBeCloseTo(lanes.mergeTo, 1);
  });

  test('is overal even breed', () => {
    for (const quad of ramp.filter((s) => s.kind === 'asphalt')) {
      // Opposite corners of each quad sit on the two radii, so the gap between them is the width.
      const inner = Math.hypot(quad.points[0].x - quad.points[3].x, quad.points[0].y - quad.points[3].y);
      expect(inner).toBeCloseTo(road.mergeLaneWidth, 2);
    }
  });

  test('heeft aan weerszijden een doorgetrokken kantstreep', () => {
    expect(ramp.filter((s) => s.kind === 'paint').length).toBe(
      ramp.filter((s) => s.kind === 'asphalt').length * 2,
    );
  });

  test('en er staat geen bos op', () => {
    const trees = everything.filter((s) => s.kind === 'tree');
    const onRamp = trees.filter((t) => {
      const y = t.points[0].y;
      const x = t.points[0].x;
      return y < -150 && x > lanes.mergeTo && x < 20;
    });
    expect(onRamp).toEqual([]);
  });
});
