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

  it('en de trottoirband is een band, geen strook grond', () => {
    const kerb = bandsAt(SLICE_Y).find((b) => b.kind === 'kerb' && b.from > 0);
    expect(kerb).toBeDefined();
    // A band, not a metre and a half of it. The seam it overlaps the fietspad by is allowed for.
    expect(kerb!.to - kerb!.from).toBeLessThan(0.4);
    // And it sits against the fietspad, holding it up, rather than out by the carriageway.
    expect(kerb!.to).toBeGreaterThanOrEqual(road.fietspadFrom);
    expect(kerb!.from).toBeGreaterThan(road.halfWidth);
  });

  it('en de volgorde vanaf de as is rijbaan, berm, band, fietspad', () => {
    const order = bandsAt(SLICE_Y)
      .filter((b) => b.from >= 0 && ['asphalt', 'kerb', 'fietspad'].includes(b.kind))
      .map((b) => b.kind);
    expect(order).toEqual(['kerb', 'fietspad']);
    // The rijbaan straddles the centreline, so it starts left of zero; the gap before the kerb is
    // the berm, and it is the whole point.
    const rijbaan = bandsAt(SLICE_Y).find((b) => b.kind === 'asphalt')!;
    const kerb = bandsAt(SLICE_Y).find((b) => b.kind === 'kerb' && b.from > 0)!;
    expect(kerb.from - rijbaan.to).toBeGreaterThan(1);
  });
});
