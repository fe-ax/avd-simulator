/**
 * Scenario 2's world: one carriageway of a Dutch motorway, with an invoegstrook on its right.
 *
 * The other carriageway is deliberately not modelled. Beyond the geleiderail there is a treeline,
 * which is both a common middenberm planting and an honest way to say "what is over there is not
 * part of this exercise".
 *
 * Pure geometry; see `../roadSurfaces.ts` for the vocabulary.
 */
import type { RoadExtent, Surface } from '../roadSurfaces';
import type { MotorwayRoad } from '../types';

/**
 * Where every lane boundary sits, derived once from the widths so nothing can disagree about it.
 *
 * Lanes are numbered the Dutch way: rijstrook 1 is the rightmost, and the invoegstrook sits to
 * the right of that again. `centres[0]` is rijstrook 1.
 */
export function motorwayLanes(road: MotorwayRoad) {
  const { laneCount, laneWidth, leftEdgeX, mergeLaneWidth, blockBandWidth, bermWidth } = road;
  const rightEdgeX = leftEdgeX + laneCount * laneWidth;
  const blockFrom = rightEdgeX;
  const blockTo = blockFrom + blockBandWidth;
  const mergeFrom = blockTo;
  const mergeTo = mergeFrom + mergeLaneWidth;

  // Rijstrook 1 first, so lane numbering and array index agree.
  const centres: number[] = [];
  for (let i = 0; i < laneCount; i++) {
    centres.push(rightEdgeX - (i + 0.5) * laneWidth);
  }

  return {
    leftEdgeX,
    rightEdgeX,
    /** Boundaries between through lanes, where the onderbroken strepen are painted. */
    laneBoundaries: Array.from({ length: laneCount - 1 }, (_, i) => leftEdgeX + (i + 1) * laneWidth),
    centres,
    blockFrom,
    blockTo,
    mergeFrom,
    mergeTo,
    mergeCentre: (mergeFrom + mergeTo) / 2,
    bermTo: mergeTo + bermWidth,
  };
}

/**
 * Not yet built. Returning nothing draws an empty world rather than a wrong one, which is the
 * right failure while the seam lands.
 */
export function motorwaySurfaces(road: MotorwayRoad, ext: RoadExtent): Surface[] {
  void road;
  void ext;
  return [];
}
