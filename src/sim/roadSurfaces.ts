/**
 * The road as pure geometry: where every surface and every marking is, in world metres, with no
 * idea of how it will be drawn.
 *
 * This is the single definition both renderers read. The top-down view fills these polygons flat;
 * the first-person scene lays them as meshes and extrudes the buildings. Before this existed the
 * top-down renderer both decided where the haaientanden went *and* painted them, which would have
 * guaranteed the two views eventually disagreed about where a marking is.
 *
 * Surfaces come back in painter's order — verge outward, then road, then paint — so a 2D renderer
 * can fill them straight down the list and a 3D one can map that order onto layer offsets.
 */
import type { RoadLayout, Vec2 } from './types';

export type SurfaceKind =
  | 'hedge'
  | 'house'
  | 'roof'
  | 'kerb'
  | 'asphalt'
  | 'fietspad'
  | 'fietspadEdge'
  | 'paint';

/** Which way a building fronts. Only the 3D scene uses it, to hang a door and windows there. */
export type Facing = 'north' | 'south' | 'east' | 'west';

export interface Surface {
  kind: SurfaceKind;
  /** Closed polygon, world metres. */
  points: Vec2[];
  /** Metres to extrude upward. Zero for anything lying on the ground. */
  height: number;
  /** Index-derived, so neighbouring buildings differ without anything being random. */
  variant?: number;
  /** For buildings: the side that faces the road, and so carries the front door. */
  facing?: Facing;
}

export interface RoadExtent {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Adjoining surfaces overlap by this much so that a projected seam between two trapezoids does
 * not show a one-pixel line of whatever was underneath. In 3D the same overlap is harmless
 * because each kind sits on its own layer offset.
 */
const SEAM = 0.06;

const HOUSE_PITCH = 9;
const HOUSE_HEIGHT = 6;

/**
 * Kerbs stand proud of the carriageway. In plan view this changes nothing, but from the saddle it
 * is the single strongest cue that a junction is coming: the raised edge running alongside you
 * stops dead at the mouth of the side road. A flat strip is invisible edge-on.
 */
const KERB_HEIGHT = 0.12;

function rect(
  kind: SurfaceKind,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  height = 0,
  variant?: number,
  facing?: Facing,
): Surface {
  return {
    kind,
    height,
    variant,
    facing,
    points: [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
      { x: x1, y: y2 },
    ],
  };
}

function dashedAlongY(
  out: Surface[],
  x: number,
  ext: RoadExtent,
  opts: { dash: number; gap: number; width: number; skip?: [number, number] },
) {
  const step = opts.dash + opts.gap;
  const start = Math.floor(ext.minY / step) * step;
  for (let y = start; y < ext.maxY; y += step) {
    if (opts.skip && y + opts.dash > opts.skip[0] && y < opts.skip[1]) continue;
    out.push(rect('paint', x - opts.width / 2, y, x + opts.width / 2, y + opts.dash));
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
function buildings(out: Surface[], road: RoadLayout, ext: RoadExtent) {
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
export function roadSurfaces(road: RoadLayout, ext: RoadExtent): Surface[] {
  const { halfWidth, kerbTo, fietspadFrom, fietspadTo, vergeTo, sideHalfWidth } = road;
  const out: Surface[] = [];

  // Hedges and houses first: everything after them is road, and road wins.
  // A metre, not shoulder height. Taller is just as Dutch and walls off the front doors it is
  // supposed to be standing in front of.
  out.push(rect('hedge', vergeTo - 0.6, ext.minY, vergeTo, ext.maxY, 1));
  out.push(rect('hedge', -vergeTo, ext.minY, -vergeTo + 0.6, ext.maxY, 1));
  buildings(out, road, ext);

  // Kerb strips between carriageway and fietspad, interrupted where the side road crosses.
  for (const sign of [1, -1] as const) {
    const inner = sign * (halfWidth - SEAM);
    const outer = sign * (kerbTo + SEAM);
    out.push(rect('kerb', inner, ext.minY, outer, -sideHalfWidth, KERB_HEIGHT));
    out.push(rect('kerb', inner, sideHalfWidth, outer, ext.maxY, KERB_HEIGHT));
  }

  out.push(rect('asphalt', -halfWidth, ext.minY, halfWidth, ext.maxY));
  out.push(rect('asphalt', ext.minX, -sideHalfWidth, ext.maxX, sideHalfWidth));

  // The fietspaden run continuously across the mouth of the side road: that is the Dutch way of
  // showing the bike path keeps its priority, and it is the whole point of this exercise.
  for (const sign of [1, -1] as const) {
    const from = sign > 0 ? fietspadFrom : -fietspadTo;
    const to = sign > 0 ? fietspadTo : -fietspadFrom;
    out.push(rect('fietspad', from, ext.minY, to, ext.maxY));
    out.push(rect('fietspadEdge', from, ext.minY, from + 0.12, ext.maxY));
    out.push(rect('fietspadEdge', to - 0.12, ext.minY, to, ext.maxY));
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

  return out;
}
