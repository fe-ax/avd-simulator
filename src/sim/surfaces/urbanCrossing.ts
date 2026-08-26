/**
 * Scenario 1's world: a 30-zone carriageway with a vrijliggend fietspad beside it and the
 * Kerkstraat crossing it. Pure geometry; see `../roadSurfaces.ts` for the vocabulary.
 */
import { dashedAlongY, rect, SEAM, type Facing, type RoadExtent, type Surface } from '../roadSurfaces';
import type { UrbanRoad } from '../types';

const HOUSE_PITCH = 9;
const HOUSE_HEIGHT = 5.2;

/**
 * Kerbs stand proud of the carriageway. In plan view this changes nothing, but from the saddle it
 * is the single strongest cue that a junction is coming: the raised edge running alongside you
 * stops dead at the mouth of the side road. A flat strip is invisible edge-on.
 */
const KERB_HEIGHT = 0.12;

const HEDGE_HEIGHT = 1;
/** How far back from the side road's centreline a hedge stops, leaving an open corner. */
const HEDGE_GAP = 4.5;

/**
 * How far back from the side road's centreline the raised kerb stops.
 *
 * Wider than the road itself, because a real junction curves its kerb into the side road over
 * several metres rather than stopping square at the corner. Stopping it square left the raised
 * edge standing across the line a rider actually turns through: the turn cuts the corner well
 * before the mouth, as any turn does.
 */
const KERB_JUNCTION_GAP = 8.5;

/**
 * Blokmarkering: the two rows of white blocks that mark a fietsoversteek.
 *
 * Where a fietspad crosses a side road the red surfacing stops and the crossing is marked out
 * instead, which is what a Dutch junction actually looks like and — more usefully here — what
 * tells a rider from the saddle that they are about to cross a bike path rather than ride along
 * one. An unbroken red carpet reads as *your* lane continuing.
 */
const BLOCK = { length: 0.5, gap: 0.5, width: 0.35 };

/** A street light, and how far its arm reaches out over the road. */
const LAMP = { height: 6, radius: 0.09, armReach: 1.7 };

/**
 * The corners a lamp post stands on: outside the fietspad, outside the side road, in the verge.
 * Vertical things at the corners are what give a junction a shape from a distance — until these
 * went in the mouth of the Kerkstraat was a gap in a hedge and very little else.
 */
const LAMP_CORNER = { x: 7.8, y: 4.8 };


/** One row of blokmarkering blocks running along y, at a fixed x. */
function blocksAlongY(out: Surface[], x1: number, x2: number, fromY: number, toY: number) {
  const step = BLOCK.length + BLOCK.gap;
  const span = toY - fromY;
  const count = Math.max(1, Math.round((span + BLOCK.gap) / step));
  // Centre the run in the gap so it starts and ends with a block rather than half of one.
  const used = count * step - BLOCK.gap;
  const start = fromY + (span - used) / 2;
  for (let i = 0; i < count; i++) {
    const y = start + i * step;
    out.push(rect('paint', x1, y, x2, y + BLOCK.length));
  }
}


function dashedAlongX(
  out: Surface[],
  y: number,
  ext: RoadExtent,
  opts: { dash: number; gap: number; width: number; skips?: [number, number][] },
) {
  const step = opts.dash + opts.gap;
  const start = Math.floor(ext.minX / step) * step;
  for (let x = start; x < ext.maxX; x += step) {
    if (opts.skips?.some(([a, b]) => x + opts.dash > a && x < b)) continue;
    out.push(rect('paint', x, y - opts.width / 2, x + opts.dash, y + opts.width / 2));
  }
}

/**
 * Haaientanden: a row of triangles whose apex points at whoever has to give way. Here they mark
 * that traffic on the Kerkstraat yields to the fietspad — they are not about the rider, who is
 * governed by the afslaan rule.
 */
function sharkTeeth(
  out: Surface[],
  baseX: number,
  fromY: number,
  toY: number,
  pointing: 1 | -1,
) {
  const toothWidth = 0.5;
  const toothLength = 0.6;
  const spacing = 0.85;
  for (let y = fromY; y + toothWidth <= toY; y += spacing) {
    out.push({
      kind: 'paint',
      height: 0,
      points: [
        { x: baseX, y },
        { x: baseX, y: y + toothWidth },
        { x: baseX + toothLength * pointing, y: y + toothWidth / 2 },
      ],
    });
  }
}

function house(
  out: Surface[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  variant: number,
  facing: Facing,
) {
  out.push(rect('house', x1, y1, x2, y2, HOUSE_HEIGHT, variant, facing));
  // A darker band reads as a roof ridge from above. In three dimensions the extruded footprint
  // says it better, so the scene ignores this kind.
  const mid = (y1 + y2) / 2;
  out.push(rect('roof', x1, mid - 0.35, x2, mid + 0.35));
}

/** Index-derived rather than random, so a replay draws the identical street. */
function buildings(out: Surface[], road: UrbanRoad, ext: RoadExtent) {
  const { vergeTo, sideHalfWidth } = road;

  for (let i = Math.floor(ext.minY / HOUSE_PITCH) - 1; i <= Math.ceil(ext.maxY / HOUSE_PITCH) + 1; i++) {
    const y = i * HOUSE_PITCH;
    if (y + 7 > -sideHalfWidth - 4 && y < sideHalfWidth + 4) continue;
    const depth = 7 + (((i % 3) + 3) % 3);
    house(out, vergeTo + 1, y, vergeTo + 1 + depth, y + 7, i, 'west');
    house(out, -vergeTo - 1 - depth, y + 2, -vergeTo - 1, y + 9, i + 1, 'east');
  }

  // Terraces along both Kerkstraat arms so the side road does not read as empty space.
  for (let i = Math.floor(ext.minX / HOUSE_PITCH) - 1; i <= Math.ceil(ext.maxX / HOUSE_PITCH) + 1; i++) {
    const x = i * HOUSE_PITCH;
    if (x + 7 > -vergeTo - 1 && x < vergeTo + 1) continue;
    house(out, x, sideHalfWidth + 3, x + 7, sideHalfWidth + 10, i, 'south');
    house(out, x, -sideHalfWidth - 10, x + 7, -sideHalfWidth - 3, i + 1, 'north');
  }
}

/**
 * Every surface visible inside `ext`, in painter's order.
 *
 * The uniform ground is deliberately not included: it is a single flat expanse that each renderer
 * can lay down in whatever way suits it, and emitting it as a polygon would only make both of
 * them slower.
 */
export function urbanCrossingSurfaces(road: UrbanRoad, ext: RoadExtent): Surface[] {
  const { halfWidth, kerbTo, fietspadFrom, fietspadTo, vergeTo, sideHalfWidth } = road;
  const out: Surface[] = [];

  // Hedges and houses first: everything after them is road, and road wins.
  //
  // A metre tall, not shoulder height: taller is just as Dutch and walls off the front doors it is
  // supposed to stand in front of. And interrupted at the junction, like the kerb — a plan view
  // hides an uninterrupted hedge under the side road it paints on top, but standing in the street
  // it is a green wall across the road you are turning into.
  for (const sign of [1, -1] as const) {
    const inner = sign * (vergeTo - 0.6);
    const outer = sign * vergeTo;
    out.push(rect('hedge', inner, ext.minY, outer, -HEDGE_GAP, HEDGE_HEIGHT));
    out.push(rect('hedge', inner, HEDGE_GAP, outer, ext.maxY, HEDGE_HEIGHT));
  }
  buildings(out, road, ext);

  // Kerb strips between carriageway and fietspad, interrupted where the side road crosses.
  for (const sign of [1, -1] as const) {
    const inner = sign * (halfWidth - SEAM);
    const outer = sign * (kerbTo + SEAM);
    out.push(rect('kerb', inner, ext.minY, outer, -KERB_JUNCTION_GAP, KERB_HEIGHT));
    out.push(rect('kerb', inner, KERB_JUNCTION_GAP, outer, ext.maxY, KERB_HEIGHT));
  }

  out.push(rect('asphalt', -halfWidth, ext.minY, halfWidth, ext.maxY));
  out.push(rect('asphalt', ext.minX, -sideHalfWidth, ext.maxX, sideHalfWidth));

  // Pave the corners, where the kerb is interrupted.
  //
  // The kerb stops well short of the junction so it does not stand in the line a turn actually
  // takes — but nothing was laid in its place, so the rider cut the corner across bare ground.
  // Invisible from above, because a plan view fills the verge and the road in similar greys, and
  // invisible from the saddle because it goes past in half a second. `findOffRoad` walked the
  // ride and found it.
  for (const sign of [1, -1] as const) {
    out.push(
      rect(
        'asphalt',
        sign * (halfWidth - SEAM),
        -KERB_JUNCTION_GAP,
        sign * (kerbTo + SEAM),
        KERB_JUNCTION_GAP,
      ),
    );
  }

  // The red stops at the mouth of the side road and blokmarkering takes over, which is how a
  // Dutch fietsoversteek is laid out. The bike path still has priority — the haaientanden below
  // say so — but the surfacing no longer pretends the crossing is not a crossing.
  const cross = sideHalfWidth;
  for (const sign of [1, -1] as const) {
    const from = sign > 0 ? fietspadFrom : -fietspadTo;
    const to = sign > 0 ? fietspadTo : -fietspadFrom;
    for (const [a, b] of [
      [ext.minY, -cross],
      [cross, ext.maxY],
    ] as const) {
      out.push(rect('fietspad', from, a, to, b));
      out.push(rect('fietspadEdge', from, a, from + 0.12, b));
      out.push(rect('fietspadEdge', to - 0.12, a, to, b));
    }
    blocksAlongY(out, from, from + BLOCK.width, -cross, cross);
    blocksAlongY(out, to - BLOCK.width, to, -cross, cross);
  }

  // Centre line of the Dorpsstraat, interrupted across the junction.
  dashedAlongY(out, 0, ext, {
    dash: 3,
    gap: 3,
    width: 0.12,
    skip: [-sideHalfWidth - 1, sideHalfWidth + 1],
  });

  // Centre line of the Kerkstraat, interrupted across the junction and both fietspaden.
  dashedAlongX(out, 0, ext, {
    dash: 3,
    gap: 3,
    width: 0.12,
    skips: [
      [-halfWidth - 1, halfWidth + 1],
      [fietspadFrom - 1, fietspadTo + 1],
      [-fietspadTo - 1, -fietspadFrom + 1],
    ],
  });

  sharkTeeth(out, fietspadTo + 0.5, 0.25, sideHalfWidth - 0.1, 1);
  sharkTeeth(out, -fietspadTo - 0.5, -sideHalfWidth + 0.1, -0.25, -1);

  for (const sx of [1, -1] as const) {
    for (const sy of [1, -1] as const) {
      const x = sx * LAMP_CORNER.x;
      const y = sy * LAMP_CORNER.y;
      out.push(rect('lamp', x - LAMP.radius, y - LAMP.radius, x + LAMP.radius, y + LAMP.radius, LAMP.height));
    }
  }

  return out;
}
