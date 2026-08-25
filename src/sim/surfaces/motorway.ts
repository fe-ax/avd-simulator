/**
 * Scenario 2's world: one carriageway of a Dutch motorway, with an invoegstrook on its right.
 *
 * The other carriageway is deliberately not modelled. Beyond the geleiderail there is a treeline,
 * which is both a common middenberm planting and an honest way to say "what is over there is not
 * part of this exercise".
 *
 * Pure geometry; see `../roadSurfaces.ts` for the vocabulary.
 */
import { dashedAlongY, rect, SEAM, type RoadExtent, type Surface } from '../roadSurfaces';
import type { MotorwayRoad } from '../types';

/**
 * Every line on this road is 0.15 m wide, broken or not; the width is not what distinguishes them.
 */
const LINE_WIDTH = 0.15;

/**
 * The onderbroken streep between two rijstroken: 3 m of paint to 9 m of gap. Those are the real
 * dimensions on a Dutch autosnelweg, and the 1:3 ratio is the point of them — it is what tells a
 * rider at speed that this is a lane divider and not the 1:1 rhythm of a waarschuwingsstreep
 * warning that the lane is about to end.
 */
const LANE_DASH = { dash: 3, gap: 9 };

/**
 * Blokmarkering: blocks rather than a line, and the only place on this carriageway where they
 * appear. They mark invoegstrook against rijstrook 1, which is a different kind of boundary from
 * the one between two through lanes — crossing it is the merge, and it goes one way.
 */
const BLOCK = { length: 0.9, gap: 0.9 };

/**
 * Geleiderail. Beam height, not the height of something you cannot see over: from the saddle it
 * has to read as a rail with a treeline standing behind it.
 */
const GUARDRAIL = { depth: 0.35, height: 0.75, segment: 4 };

/**
 * Shoulder between the *outside* of the kantstreep and the face of the rail — measured from the
 * paint rather than from the lane boundary, because the paint is the edge a rider sees the rail
 * standing back from. Flush against the line it would read as a wall growing out of the marking.
 */
const GUARDRAIL_CLEARANCE = 0.5;

/**
 * Hectometerpaaltje: knee high, green (see `palette.ts`), and on the right-hand side only, which
 * is where they stand on a Dutch carriageway. One on the left would belong to the other
 * carriageway, and this scenario does not model that one.
 */
const HM_POST = { footprint: 0.12, height: 1, offset: 1 };

/**
 * Trees stand for everything that is not part of this exercise: the middenberm hides the
 * carriageway that is deliberately not modelled, the berm hides the fact that there is nothing
 * out there at all. The footprint is a trunk — the crown belongs to whoever draws it.
 */
const TREE = { footprint: 0.35, minHeight: 9, heightSpread: 4 };

/** One tree per this much y, and one column per this much band width. */
const TREE_PITCH = { alongY: 7, acrossX: 4.5 };

/**
 * The middenberm wood. It starts 6 m out so the geleiderail has air in front of it, and stops at
 * 24 m because there is nothing to say past that.
 */
const MIDDENBERM_TREES = { from: -24, to: -6 };

/** The wood in the right-hand berm: this far clear of the berm's outer edge, and this deep. */
const BERM_TREES = { clearance: 2, depth: 10 };

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
 * A hash, not a random number.
 *
 * A wood has to look unplanned, but `Math.random()` would draw a different wood every time the
 * same recording is replayed, and a replay that does not show what was recorded is not a replay.
 * The same index always yields the same fraction instead — on every machine, because `Math.imul`
 * is exact 32-bit arithmetic. The usual `sin(i) * 43758.5453` shortcut rides on the last bit of a
 * sine, which is specified only to within an ulp, and a hash amplifies that bit into a tree
 * standing somewhere else entirely.
 */
function hash01(i: number, salt: number): number {
  let h = Math.imul(i | 0, 374761393) + Math.imul(salt | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * A wood filling the band between two x, the length of the extent.
 *
 * Every tree is nudged inside its own cell of a grid rather than scattered across the band
 * freely: a free scatter clumps, and where it clumps it tears a hole you can see the unmodelled
 * world through — which is the one thing this treeline exists to prevent. `seed` gives each wood
 * its own run of salts, otherwise the two would come out twins and the symmetry would show.
 */
function treeline(out: Surface[], ext: RoadExtent, fromX: number, toX: number, seed: number) {
  const columns = Math.max(1, Math.round((toX - fromX) / TREE_PITCH.acrossX));
  const cellWidth = (toX - fromX) / columns;
  const radius = TREE.footprint / 2;
  const salt = seed * 4;

  const firstRow = Math.floor(ext.minY / TREE_PITCH.alongY);
  const lastRow = Math.ceil(ext.maxY / TREE_PITCH.alongY);
  for (let row = firstRow; row <= lastRow; row++) {
    for (let column = 0; column < columns; column++) {
      const i = row * columns + column;
      const x = fromX + (column + hash01(i, salt + 1)) * cellWidth;
      const y = (row + hash01(i, salt + 2)) * TREE_PITCH.alongY;
      const height = TREE.minHeight + hash01(i, salt + 3) * TREE.heightSpread;
      out.push(
        rect('tree', x - radius, y - radius, x + radius, y + radius, height, Math.floor(hash01(i, salt + 4) * 4)),
      );
    }
  }
}

/**
 * The geleiderail, as a run of sections rather than one polygon the length of the world.
 *
 * A rail is built in bolted lengths and neither renderer wants a single kilometre-long quad. The
 * sections overlap by a seam because the run still has to read as continuous — daylight between
 * two of them is a hole in the barrier, which says something about the road that is not true.
 */
function guardrail(out: Surface[], ext: RoadExtent, leftEdgeX: number) {
  const inner = leftEdgeX - LINE_WIDTH / 2 - GUARDRAIL_CLEARANCE;
  const outer = inner - GUARDRAIL.depth;
  for (let y = ext.minY; y < ext.maxY; y += GUARDRAIL.segment) {
    out.push(rect('guardrail', outer, y, inner, Math.min(y + GUARDRAIL.segment + SEAM, ext.maxY), GUARDRAIL.height));
  }
}

/**
 * Hectometerpaaltjes, at every whole hundred metres of *world* y rather than every hundred metres
 * of the extent. The number on a paaltje is a position on the road; posts spaced from wherever
 * the extent happened to begin would be spaced correctly and mean nothing.
 */
function hectometerPosts(out: Surface[], ext: RoadExtent, x: number) {
  const radius = HM_POST.footprint / 2;
  for (let hm = Math.ceil(ext.minY / 100); hm * 100 <= ext.maxY; hm++) {
    const y = hm * 100;
    out.push(rect('hectometerPost', x - radius, y - radius, x + radius, y + radius, HM_POST.height));
  }
}

/**
 * Every surface visible inside `ext`, in painter's order, laid out left to right: middenberm,
 * geleiderail, the carriageway and its markings, then the berm with the paaltjes and the wood.
 *
 * Every x comes from `motorwayLanes()` and none is recomputed here, so no marking can end up on a
 * boundary the lanes themselves do not have. Ground goes down before paint; the standing things
 * carry a height and can be emitted wherever they read best.
 */
export function motorwaySurfaces(road: MotorwayRoad, ext: RoadExtent): Surface[] {
  const lanes = motorwayLanes(road);
  const out: Surface[] = [];

  // Scenery before road, as in the urban crossing: whatever the two disagree about, the road wins.
  treeline(out, ext, MIDDENBERM_TREES.from, MIDDENBERM_TREES.to, 0);
  guardrail(out, ext, lanes.leftEdgeX);

  out.push(rect('asphalt', lanes.leftEdgeX, ext.minY, lanes.mergeTo, ext.maxY));

  // The two doorgetrokken kantstrepen. Unbroken over the whole extent, because a break in an edge
  // line means something this road does not offer — an exit, a bus lane, somewhere to pull off.
  // The invoegstrook is the only lane that ends here, and blokmarkering is what says so.
  for (const x of [lanes.leftEdgeX, lanes.mergeTo]) {
    out.push(rect('paint', x - LINE_WIDTH / 2, ext.minY, x + LINE_WIDTH / 2, ext.maxY));
  }

  for (const x of lanes.laneBoundaries) {
    dashedAlongY(out, x, ext, { dash: LANE_DASH.dash, gap: LANE_DASH.gap, width: LINE_WIDTH });
  }

  // The blocks fill the band whole, so their width is the band's rather than a number of their
  // own. A narrower row would leave a strip of bare asphalt on one side of the invoegstrook that
  // belongs to neither lane and means nothing.
  dashedAlongY(out, (lanes.blockFrom + lanes.blockTo) / 2, ext, {
    dash: BLOCK.length,
    gap: BLOCK.gap,
    width: lanes.blockTo - lanes.blockFrom,
  });

  hectometerPosts(out, ext, lanes.mergeTo + HM_POST.offset);
  treeline(
    out,
    ext,
    lanes.bermTo + BERM_TREES.clearance,
    lanes.bermTo + BERM_TREES.clearance + BERM_TREES.depth,
    1,
  );

  return out;
}
