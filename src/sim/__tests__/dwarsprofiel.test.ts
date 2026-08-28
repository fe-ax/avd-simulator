/**
 * The cross-section of the Kerkstraat, which was wrong from the day it was drawn.
 *
 * A metre and a half of raised paving ran between the rijbaan and the fietspad, and it was called a
 * kerb. No Dutch street is built that way: a *vrijliggend* fietspad is separated from the
 * carriageway by **berm**, and the trottoirband is only the lip that holds the fietspad up. It
 * survived because a kerb is scenery — no route, obstruction or scoring rule looks at one, and from
 * the saddle a pale band beside the road reads as a pale band beside the road. An instructor
 * spotted it in one glance.
 *
 * What is asserted here is the *order and the widths*, because that is the thing that was wrong.
 * The kerb's own position is derived from the fietspad's inner edge rather than typed, so this also
 * pins that widening the band would be paving the berm.
 */
import { describe, expect, it } from 'vitest';
import { rechtsafFietspad } from '../scenario.rechtsaf-fietspad';
import { roadSurfaces, type Surface } from '../roadSurfaces';

const EXT = { minX: -85, maxX: 95, minY: -150, maxY: 65 };
/** A slice well clear of the junction, where nothing is interrupted. */
const SLICE_Y = -60;

const road = (rechtsafFietspad.world as Extract<
  typeof rechtsafFietspad.world,
  { kind: 'urbanCrossing' }
>).road;

function bandsAt(y: number): { kind: string; from: number; to: number }[] {
  return roadSurfaces(rechtsafFietspad.world, EXT, rechtsafFietspad.speedLimitKmh)
    .filter((s: Surface) => {
      const ys = s.points.map((p) => p.y);
      return Math.min(...ys) <= y && Math.max(...ys) >= y;
    })
    .map((s) => {
      const xs = s.points.map((p) => p.x);
      return { kind: s.kind, from: Math.min(...xs), to: Math.max(...xs) };
    })
    .sort((a, b) => a.from - b.from);
}

describe('het dwarsprofiel van de Kerkstraat', () => {
  it('legt berm tussen rijbaan en fietspad, geen bestrating', () => {
    const bands = bandsAt(SLICE_Y);
    const paved = bands.filter(
      (b) => b.from >= road.halfWidth && b.to <= road.fietspadFrom && b.kind !== 'kerb',
    );
    // Nothing is emitted there at all, so the ground shows through as berm. Anything laid in that
    // gap other than the trottoirband is paving over the separation this exercise is about.
    expect(paved).toEqual([]);
  });

  it('en elke trottoirband is een band, geen strook grond', () => {
    const kerbs = bandsAt(SLICE_Y).filter((b) => b.kind === 'kerb' && b.from > 0);
    // Three: one on each edge of the fietspad, and one holding up the stoep.
    expect(kerbs).toHaveLength(3);
    for (const k of kerbs) expect(k.to - k.from).toBeLessThan(0.4);
    // They sit against the surface they hold up, rather than out in the berm.
    expect(kerbs[0].to).toBeGreaterThanOrEqual(road.fietspadFrom);
    expect(kerbs[0].from).toBeGreaterThan(road.halfWidth);
    expect(kerbs[1].from).toBeLessThanOrEqual(road.fietspadTo);
  });

  it('en er ligt een stoep tussen het fietspad en de huizen', () => {
    // The thing that was missing, and the reason this file gained a third test.
    //
    // There was four and a bit metres of uninterrupted grass from the fietspad's outer band to the
    // front hedges, so the terrace had front doors and no way to reach them on foot. Nothing
    // caught it: a footway is scenery — no route, obstruction or scoring rule looks at one — and
    // grass beside a road reads as grass beside a road. An instructor spotted it in one glance,
    // for the second time in this same cross-section.
    const walk = bandsAt(SLICE_Y).find((b) => b.kind === 'trottoir' && b.from > 0);
    expect(walk).toBeDefined();
    // Wide enough for two people, and clear of the fietspad rather than butted against it.
    expect(walk!.to - walk!.from).toBeGreaterThan(1.5);
    expect(walk!.from).toBeGreaterThan(road.fietspadTo);
    // And it stops short of the gardens rather than running under the hedge.
    expect(walk!.to).toBeLessThanOrEqual(road.vergeTo);
  });

  it('en de volgorde vanaf de as is rijbaan, berm, band, fietspad, band, band, stoep', () => {
    const order = bandsAt(SLICE_Y)
      .filter((b) => b.from >= 0 && ['asphalt', 'kerb', 'fietspad', 'trottoir'].includes(b.kind))
      .map((b) => b.kind);
    expect(order).toEqual(['kerb', 'fietspad', 'kerb', 'kerb', 'trottoir']);
    // The rijbaan straddles the centreline, so it starts left of zero; the gap before the first
    // band is the berm, and it is the whole point.
    const rijbaan = bandsAt(SLICE_Y).find((b) => b.kind === 'asphalt')!;
    const kerb = bandsAt(SLICE_Y).find((b) => b.kind === 'kerb' && b.from > 0)!;
    expect(kerb.from - rijbaan.to).toBeGreaterThan(1);
  });
});
