/**
 * Where the shark's teeth go, and which way they point.
 *
 * Two rules, and both were broken the same way for as long as the junction has existed. Nothing
 * caught it: the teeth are paint, so no test about routes, obstructions or tarmac ever looks at
 * them, and from the saddle a row of triangles a metre to one side of where it belongs reads as a
 * row of triangles.
 *
 * **The lane is the one arriving.** `junctionLanes` puts westbound on the north half of the side
 * road, so the row at the east mouth belongs on the north half. Painted on the south half it sits
 * across the lane of somebody leaving the junction, who has nothing to give way to.
 *
 * **The apex points at whoever must yield** — outwards, away from the junction. A driver should
 * meet the points head on. Pointing them inwards aims them at the traffic with priority.
 */
import { describe, expect, it } from 'vitest';
import { junctionGiveWay } from '../surfaces/junction';
import { junctionLanes } from '../route';
import type { JunctionRoad } from '../types';

const road: JunctionRoad = { halfWidth: 3, sideHalfWidth: 3, vergeTo: 11 };
const lanes = junctionLanes(road);

/** Each row of teeth, reduced to where it sits and which way it points. */
function rows(giveWay: 'side' | 'main' | 'none') {
  return junctionGiveWay(road, giveWay).map((t) => {
    const xs = t.points.map((p) => p.x);
    const ys = t.points.map((p) => p.y);
    return {
      cx: (Math.min(...xs) + Math.max(...xs)) / 2,
      cy: (Math.min(...ys) + Math.max(...ys)) / 2,
      // The apex is the vertex that does not share its coordinate with the other two.
      apexX: xs.find((x) => xs.filter((o) => o === x).length === 1),
      apexY: ys.find((y) => ys.filter((o) => o === y).length === 1),
      spanX: Math.max(...xs) - Math.min(...xs),
    };
  });
}

describe('haaientanden op de zijweg', () => {
  const all = rows('side');

  it('staan er, aan beide monden', () => {
    expect(all.filter((t) => t.cx > 0).length).toBeGreaterThan(1);
    expect(all.filter((t) => t.cx < 0).length).toBeGreaterThan(1);
  });

  it('liggen in de rijstrook die aankomt, niet in die die wegrijdt', () => {
    // East mouth is approached heading west, and westbound is the north half.
    for (const t of all.filter((t) => t.cx > 0)) {
      expect(Math.sign(t.cy)).toBe(Math.sign(lanes.westbound));
    }
    // West mouth is approached heading east, and eastbound is the south half.
    for (const t of all.filter((t) => t.cx < 0)) {
      expect(Math.sign(t.cy)).toBe(Math.sign(lanes.eastbound));
    }
  });

  it('en wijzen naar buiten, naar wie voorrang moet verlenen', () => {
    // Apex further from the junction than the base, on both sides.
    for (const t of all.filter((t) => t.cx > 0)) expect(t.apexX!).toBeGreaterThan(t.cx);
    for (const t of all.filter((t) => t.cx < 0)) expect(t.apexX!).toBeLessThan(t.cx);
  });

  it('en liggen buiten de kruising, niet erin', () => {
    for (const t of all) expect(Math.abs(t.cx)).toBeGreaterThan(road.halfWidth);
  });
});

describe('haaientanden op je eigen weg', () => {
  const all = rows('main');

  it('liggen in de rijstrook die aankomt', () => {
    // South mouth is approached heading north, and northbound is the east half.
    for (const t of all.filter((t) => t.cy < 0)) {
      expect(Math.sign(t.cx)).toBe(Math.sign(lanes.northbound));
    }
    // North mouth is approached heading south, which is the other half.
    for (const t of all.filter((t) => t.cy > 0)) {
      expect(Math.sign(t.cx)).toBe(-Math.sign(lanes.northbound));
    }
  });

  it('en wijzen naar buiten', () => {
    for (const t of all.filter((t) => t.cy < 0)) expect(t.apexY!).toBeLessThan(t.cy);
    for (const t of all.filter((t) => t.cy > 0)) expect(t.apexY!).toBeGreaterThan(t.cy);
  });
});

describe('en waar niemand voorrang verleent', () => {
  it('staan er geen', () => {
    expect(junctionGiveWay(road, 'none')).toEqual([]);
  });
});
