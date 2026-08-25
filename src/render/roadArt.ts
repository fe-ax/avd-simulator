/**
 * Flat-vector Dutch street furniture, painted in world metres and projected by the perspective
 * camera. The scenario's layout is the only source of truth for the geometry.
 *
 * Shapes that share an edge overlap by a hair, because a projected seam between two trapezoids
 * will otherwise show a one-pixel line of whatever was underneath.
 */
import type { Camera } from './camera';
import { fillWorldPoly, fillWorldRect } from './paint';
import type { RoadLayout } from '../sim/types';

export const PALETTE = {
  grass: '#7d9c66',
  asphalt: '#4c4d51',
  fietspad: '#a04a3f',
  fietspadEdge: '#b3564a',
  kerb: '#b7b3a9',
  paint: '#eceae3',
  house: '#c3ab93',
  houseAlt: '#b09a86',
  roof: '#7d5a4a',
  hedge: '#5f7f4d',
};

type Ctx = CanvasRenderingContext2D;

/** Overlap between adjoining surfaces, in metres. Hides projected seams. */
const SEAM = 0.06;

interface Extent {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function dashedAlongY(
  ctx: Ctx,
  cam: Camera,
  x: number,
  ext: Extent,
  opts: { dash: number; gap: number; width: number; skip?: [number, number] },
) {
  const step = opts.dash + opts.gap;
  const start = Math.floor(ext.minY / step) * step;
  for (let y = start; y < ext.maxY; y += step) {
    if (opts.skip && y + opts.dash > opts.skip[0] && y < opts.skip[1]) continue;
    fillWorldRect(ctx, cam, x - opts.width / 2, y, x + opts.width / 2, y + opts.dash, PALETTE.paint);
  }
}

function dashedAlongX(
  ctx: Ctx,
  cam: Camera,
  y: number,
  ext: Extent,
  opts: { dash: number; gap: number; width: number; skips?: [number, number][] },
) {
  const step = opts.dash + opts.gap;
  const start = Math.floor(ext.minX / step) * step;
  for (let x = start; x < ext.maxX; x += step) {
    if (opts.skips?.some(([a, b]) => x + opts.dash > a && x < b)) continue;
    fillWorldRect(ctx, cam, x, y - opts.width / 2, x + opts.dash, y + opts.width / 2, PALETTE.paint);
  }
}

/**
 * Haaientanden: a row of triangles whose apex points at whoever has to give way. Here they mark
 * that traffic on the Kerkstraat yields to the fietspad.
 */
function sharkTeeth(
  ctx: Ctx,
  cam: Camera,
  baseX: number,
  fromY: number,
  toY: number,
  pointing: 1 | -1,
) {
  const toothWidth = 0.5;
  const toothLength = 0.6;
  const spacing = 0.85;
  for (let y = fromY; y + toothWidth <= toY; y += spacing) {
    fillWorldPoly(
      ctx,
      cam,
      [
        { x: baseX, y },
        { x: baseX, y: y + toothWidth },
        { x: baseX + toothLength * pointing, y: y + toothWidth / 2 },
      ],
      PALETTE.paint,
    );
  }
}

function house(ctx: Ctx, cam: Camera, x1: number, y1: number, x2: number, y2: number, i: number) {
  fillWorldRect(ctx, cam, x1, y1, x2, y2, i % 2 === 0 ? PALETTE.house : PALETTE.houseAlt);
  // A darker band reads as a roof ridge from above without needing any texture.
  const mid = (y1 + y2) / 2;
  fillWorldRect(ctx, cam, x1, mid - 0.35, x2, mid + 0.35, PALETTE.roof);
}

export function drawRoad(ctx: Ctx, cam: Camera, road: RoadLayout) {
  const b = cam.worldBounds();
  const ext: Extent = {
    minX: b.minX - 5,
    maxX: b.maxX + 5,
    minY: b.minY - 5,
    maxY: b.maxY + 5,
  };

  // Verge everywhere, then carve the roads out of it.
  ctx.fillStyle = PALETTE.grass;
  ctx.fillRect(0, 0, cam.width, cam.height);

  const { halfWidth, kerbTo, fietspadFrom, fietspadTo, vergeTo, sideHalfWidth } = road;

  // Hedges and houses first: everything drawn after them is road, and road wins.
  fillWorldRect(ctx, cam, vergeTo - 0.6, ext.minY, vergeTo, ext.maxY, PALETTE.hedge);
  fillWorldRect(ctx, cam, -vergeTo, ext.minY, -vergeTo + 0.6, ext.maxY, PALETTE.hedge);
  drawHouses(ctx, cam, road, ext);

  // Kerb strips between carriageway and fietspad, interrupted where the side road crosses.
  for (const sign of [1, -1] as const) {
    const inner = sign * (halfWidth - SEAM);
    const outer = sign * (kerbTo + SEAM);
    fillWorldRect(ctx, cam, inner, ext.minY, outer, -sideHalfWidth, PALETTE.kerb);
    fillWorldRect(ctx, cam, inner, sideHalfWidth, outer, ext.maxY, PALETTE.kerb);
  }

  // Carriageways.
  fillWorldRect(ctx, cam, -halfWidth, ext.minY, halfWidth, ext.maxY, PALETTE.asphalt);
  fillWorldRect(ctx, cam, ext.minX, -sideHalfWidth, ext.maxX, sideHalfWidth, PALETTE.asphalt);

  // The fietspaden run continuously across the mouth of the side road: that is the Dutch way of
  // showing the bike path keeps its priority, and it is the whole point of this exercise.
  for (const sign of [1, -1] as const) {
    const from = sign > 0 ? fietspadFrom : -fietspadTo;
    const to = sign > 0 ? fietspadTo : -fietspadFrom;
    fillWorldRect(ctx, cam, from, ext.minY, to, ext.maxY, PALETTE.fietspad);
    fillWorldRect(ctx, cam, from, ext.minY, from + 0.12, ext.maxY, PALETTE.fietspadEdge);
    fillWorldRect(ctx, cam, to - 0.12, ext.minY, to, ext.maxY, PALETTE.fietspadEdge);
  }

  drawMarkings(ctx, cam, road, ext);
}

function drawMarkings(ctx: Ctx, cam: Camera, road: RoadLayout, ext: Extent) {
  const { halfWidth, fietspadFrom, fietspadTo, sideHalfWidth } = road;

  // Centre line of the Dorpsstraat, interrupted across the junction.
  dashedAlongY(ctx, cam, 0, ext, {
    dash: 3,
    gap: 3,
    width: 0.12,
    skip: [-sideHalfWidth - 1, sideHalfWidth + 1],
  });

  // Centre line of the Kerkstraat, interrupted across the junction and both fietspaden.
  dashedAlongX(ctx, cam, 0, ext, {
    dash: 3,
    gap: 3,
    width: 0.12,
    skips: [
      [-halfWidth - 1, halfWidth + 1],
      [fietspadFrom - 1, fietspadTo + 1],
      [-fietspadTo - 1, -fietspadFrom + 1],
    ],
  });

  // Kerkstraat gives way to the fietspad on both sides.
  sharkTeeth(ctx, cam, fietspadTo + 0.5, 0.25, sideHalfWidth - 0.1, 1);
  sharkTeeth(ctx, cam, -fietspadTo - 0.5, -sideHalfWidth + 0.1, -0.25, -1);
}

function drawHouses(ctx: Ctx, cam: Camera, road: RoadLayout, ext: Extent) {
  const { vergeTo, sideHalfWidth } = road;
  const pitch = 9;

  // Index-derived rather than random, so a replay draws the identical street.
  for (let i = Math.floor(ext.minY / pitch) - 1; i <= Math.ceil(ext.maxY / pitch) + 1; i++) {
    const y = i * pitch;
    if (y + 7 > -sideHalfWidth - 4 && y < sideHalfWidth + 4) continue;
    const depth = 7 + (((i % 3) + 3) % 3);
    house(ctx, cam, vergeTo + 1, y, vergeTo + 1 + depth, y + 7, i);
    house(ctx, cam, -vergeTo - 1 - depth, y + 2, -vergeTo - 1, y + 9, i + 1);
  }

  // Terraces along both Kerkstraat arms so the side road does not read as empty space.
  for (let i = Math.floor(ext.minX / pitch) - 1; i <= Math.ceil(ext.maxX / pitch) + 1; i++) {
    const x = i * pitch;
    if (x + 7 > -vergeTo - 1 && x < vergeTo + 1) continue;
    house(ctx, cam, x, sideHalfWidth + 3, x + 7, sideHalfWidth + 10, i);
    house(ctx, cam, x, -sideHalfWidth - 10, x + 7, -sideHalfWidth - 3, i + 1);
  }
}
