/**
 * Painting the top-down view of the street. Where every surface *is* comes from
 * `roadSurfaces` in the simulation layer; this file only decides what colour it is and hands the
 * polygons to the projection.
 */
import type { ViewCamera } from './camera';
import { fillWorldPoly } from './paint';
import { roadSurfaces, type RoadExtent, type SurfaceKind } from '../sim/roadSurfaces';
import { plateFootprint, signGroups } from '../sim/surfaces/signs';
import type { SignFace } from '../sim/roadSurfaces';
import type { WorldView } from '../sim/types';
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
  guardrail: PALETTE.guardrail,
  hectometerPost: PALETTE.hectometerPost,
  tree: PALETTE.tree,
  sign: PALETTE.signPost,
};

/**
 * A sign from above is a dot, so the dot is the colour of its face rather than of its post.
 * Otherwise the blue board, the red-ringed disc and the yellow diamond all read as the same speck
 * of grey — and the plan view is the one place an author checks that a sign is where they meant.
 */
const SIGN_COLOURS: Record<SignFace['type'], string> = {
  speedLimit: PALETTE.signRed,
  priorityRoad: PALETTE.signYellow,
  giveWay: PALETTE.signRed,
  cyclePath: PALETTE.signBlue,
  exit: PALETTE.signBlue,
};

/**
 * Takes the whole `WorldView` rather than just its world, and that is deliberate.
 *
 * It used to take a `ScenarioWorld`, and when signs arrived the speed limit had to reach here from
 * `Scenario` — as an optional argument, which the compiler cannot insist on. The plan view duly
 * drew every sign except the one that needed it, silently, which is precisely the drift layout
 * rule 4 exists to stop. Handed the view, anything the sim later adds to the contract is already
 * here.
 */
export function drawRoad(ctx: CanvasRenderingContext2D, cam: ViewCamera, view: WorldView) {
  const world = view.world;
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

  const surfaces = roadSurfaces(world, extent, view.speedLimitKmh);
  for (const surface of surfaces) {
    // The post is a tenth of a metre and vanishes at any plan scale; the plate is drawn below,
    // once per sign rather than once per leg.
    if (surface.sign) continue;
    const colour =
      surface.kind === 'house' && surface.variant !== undefined && surface.variant % 2 !== 0
        ? PALETTE.houseAlt
        : COLOURS[surface.kind];
    fillWorldPoly(ctx, cam, surface.points, colour);
  }

  for (const group of signGroups(surfaces)) {
    fillWorldPoly(ctx, cam, plateFootprint(group), SIGN_COLOURS[group.face.type]);
  }
}
