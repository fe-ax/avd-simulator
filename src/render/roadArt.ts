/**
 * Painting the top-down view of the street. Where every surface *is* comes from
 * `roadSurfaces` in the simulation layer; this file only decides what colour it is and hands the
 * polygons to the projection.
 */
import type { Camera } from './camera';
import { fillWorldPoly } from './paint';
import { roadSurfaces, type RoadExtent, type SurfaceKind } from '../sim/roadSurfaces';
import type { RoadLayout } from '../sim/types';
import { PALETTE } from '../palette';

export { PALETTE };

const COLOURS: Record<SurfaceKind, string> = {
  hedge: PALETTE.hedge,
  house: PALETTE.house,
  roof: PALETTE.roof,
  kerb: PALETTE.kerb,
  asphalt: PALETTE.asphalt,
  fietspad: PALETTE.fietspad,
  fietspadEdge: PALETTE.fietspadEdge,
  paint: PALETTE.paint,
  lamp: PALETTE.lamp,
};

export function drawRoad(ctx: CanvasRenderingContext2D, cam: Camera, road: RoadLayout) {
  const b = cam.worldBounds();
  const extent: RoadExtent = {
    minX: b.minX - 5,
    maxX: b.maxX + 5,
    minY: b.minY - 5,
    maxY: b.maxY + 5,
  };

  // The verge is uniform, so it is a single fill rather than a projected polygon; everything
  // else is carved out of it in painter's order.
  ctx.fillStyle = PALETTE.grass;
  ctx.fillRect(0, 0, cam.width, cam.height);

  for (const surface of roadSurfaces(road, extent)) {
    const colour =
      surface.kind === 'house' && surface.variant !== undefined && surface.variant % 2 !== 0
        ? PALETTE.houseAlt
        : COLOURS[surface.kind];
    fillWorldPoly(ctx, cam, surface.points, colour);
  }
}
