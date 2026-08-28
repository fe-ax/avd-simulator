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
import { sign } from './signs';
import type { MotorwayRoad, ScenarioWorld } from '../types';

type MotorwayWorld = Extract<ScenarioWorld, { kind: 'motorway' }>;

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
 * Where signs stand, as fractions of the berm's width and metres along the road.
 *
 * Fractions rather than metres across, so a wider berm moves the signs out with it instead of
 * leaving them stranded on the hard shoulder. The board sits further out than the A1 because it is
 * four metres wide and would otherwise overhang the kantstreep.
 */
const SIGN_BERM = { limit: 0.45, board: 0.6, limitAfterStart: 60, boardBeforeStrook: 220 };

/**
 * A few degrees of extra arc behind where the route starts, so the rider does not begin on the
 * raw cut end of the tarmac with grass in the mirrors.
 */
/** How long the uitvoegstrook takes to widen from nothing to full width. */
const EXIT_LEAD_M = 45;

const RAMP_LEAD_DEG = 7;

/** How finely the arc is chopped into quads. Half a degree is under a metre at these radii. */
const RAMP_STEP_DEG = 0.5;

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
function treeline(
  out: Surface[],
  ext: RoadExtent,
  fromX: number,
  toX: number,
  seed: number,
  /** Leave this stretch of y bare — where the oprit runs there is road, not wood. */
  skipY?: [number, number],
) {
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
      if (skipY && y >= skipY[0] && y <= skipY[1]) continue;
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
/**
 * The oprit: the curve the rider is already on when the ride starts.
 *
 * It was missing entirely, which is not a subtle bug once you sit on it — the first forty metres
 * of the exercise were ridden across the verge, with the motorway visible off to the left and no
 * road under the wheels at all. The arc exists in `buildRoutes`, so the tarmac has to be built
 * from the same three numbers or the two will disagree about where the road is.
 *
 * Built as an annular sector rather than as quads along a centreline: the ramp *is* part of a
 * circle about the same centre the route turns about, so its edges are simply two more radii.
 * Nothing has to be offset perpendicular to anything, and the join with the invoegstrook is exact
 * by construction — at the end of the sweep the two radii land on the strook's own two edges.
 */
function onRamp(out: Surface[], world: MotorwayWorld, lanes: ReturnType<typeof motorwayLanes>) {
  if (world.stretch.kind !== 'oprit') return;
  const { radius, sweepDeg, strookStartY } = world.stretch.ramp;
  const half = world.road.mergeLaneWidth / 2;
  const cx = lanes.mergeCentre + radius;
  const cy = strookStartY;

  const at = (angle: number, r: number) => ({
    x: cx + Math.cos(angle) * r,
    y: cy + Math.sin(angle) * r,
  });

  const from = Math.PI + ((sweepDeg + RAMP_LEAD_DEG) * Math.PI) / 180;
  // A hair past pi so the last quad overlaps the strook instead of meeting it exactly.
  const to = Math.PI - SEAM / radius;
  const steps = Math.max(2, Math.ceil(((from - to) * 180) / Math.PI / RAMP_STEP_DEG));

  for (let i = 0; i < steps; i++) {
    const a0 = from + ((to - from) * i) / steps;
    const a1 = from + ((to - from) * (i + 1)) / steps;
    for (const [kind, rIn, rOut] of [
      ['asphalt', radius - half, radius + half],
      // The two edge lines. Unbroken: an oprit has a hard edge on both sides until the
      // invoegstrook begins and the blokmarkering takes the inner one over.
      ['paint', radius - half - LINE_WIDTH / 2, radius - half + LINE_WIDTH / 2],
      ['paint', radius + half - LINE_WIDTH / 2, radius + half + LINE_WIDTH / 2],
    ] as const) {
      out.push({
        kind,
        height: 0,
        points: [at(a0, rIn), at(a1, rIn), at(a1, rOut), at(a0, rOut)],
      });
    }
  }
}

/**
 * The afrit curving away past the end of the uitvoegstrook.
 *
 * **Drawn and never ridden.** The ride ends at the mouth of the curve, because a lane in this
 * engine is a constant offset from a straight spine and one that bends is machinery for a stretch
 * of road nobody is scored on. It is here so that an exit reads as an exit from the saddle: without
 * it the strook simply stops, which looks like a lay-by or a mistake.
 *
 * That makes it the one piece of tarmac in the project that is scenery, so it is worth saying
 * plainly. `findOffRoad` asks about the ridden path and will never reach it — if a future change
 * puts a rider on it, the route is wrong rather than this.
 *
 * Built as an annular sector about the same centre in the same way as `onRamp`, mirrored: the
 * strook peels off to the *right*, so the centre sits to the right of it and the sweep runs the
 * other way.
 */
function offRamp(out: Surface[], world: MotorwayWorld, lanes: ReturnType<typeof motorwayLanes>) {
  if (world.stretch.kind !== 'afrit') return;
  const { strookStartY, strookLengthM, exit } = world.stretch;
  const half = world.road.mergeLaneWidth / 2;
  const cx = lanes.mergeCentre + exit.radius;
  const cy = strookStartY + strookLengthM;

  const at = (angle: number, r: number) => ({
    x: cx + Math.cos(angle) * r,
    y: cy + Math.sin(angle) * r,
  });

  // Starts where the strook ends, heading north, and sweeps away right.
  //
  // Both ends sit near pi, and which side of it they fall on is the whole difference between an
  // exit and a spur pointing back down the carriageway. Going *up* from pi drives sin negative, so
  // the ramp was drawn 56 m behind where the strook ends — the mirror of `onRamp` in the wrong
  // axis. Down from pi keeps sin positive: forward, and rightward as cos climbs off −1. The seam
  // stays above pi so the first quad overlaps the strook rather than meeting it exactly.
  const from = Math.PI + SEAM / exit.radius;
  const to = Math.PI - (exit.sweepDeg * Math.PI) / 180;
  const steps = Math.max(2, Math.ceil(Math.abs(((to - from) * 180) / Math.PI / RAMP_STEP_DEG)));

  for (let i = 0; i < steps; i++) {
    const a0 = from + ((to - from) * i) / steps;
    const a1 = from + ((to - from) * (i + 1)) / steps;
    for (const [kind, rIn, rOut] of [
      ['asphalt', exit.radius - half, exit.radius + half],
      ['paint', exit.radius - half - LINE_WIDTH / 2, exit.radius - half + LINE_WIDTH / 2],
      ['paint', exit.radius + half - LINE_WIDTH / 2, exit.radius + half + LINE_WIDTH / 2],
    ] as const) {
      out.push({
        kind,
        height: 0,
        points: [at(a0, rIn), at(a1, rIn), at(a1, rOut), at(a0, rOut)],
      });
    }
  }
}

export function motorwaySurfaces(world: MotorwayWorld, ext: RoadExtent): Surface[] {
  const road: MotorwayRoad = world.road;
  const lanes = motorwayLanes(road);
  const out: Surface[] = [];

  // Scenery before road, as in the urban crossing: whatever the two disagree about, the road wins.
  treeline(out, ext, MIDDENBERM_TREES.from, MIDDENBERM_TREES.to, 0);
  guardrail(out, ext, lanes.leftEdgeX);

  const entry = world.stretch.kind === 'oprit' ? world.stretch : null;
  // An exit is the same lane at the other end of its life: it opens rather than runs out, and you
  // cross into it rather than out of it.
  const exit = world.stretch.kind === 'afrit' ? world.stretch : null;
  const exitFrom = exit ? exit.strookStartY : 0;
  const exitTo = exit ? exit.strookStartY + exit.strookLengthM : 0;
  // A short wedge so it opens rather than appearing. The scored mouth is `strookStartY`; this is
  // the widening before it, which is what tells a rider at a distance that a lane is arriving.
  const exitLeadFrom = exitFrom - EXIT_LEAD_M;
  const mergeEndY = entry ? entry.mergeEndY : ext.minY;
  const taperEnd = entry ? mergeEndY + entry.taperM : ext.minY;

  // The through carriageway runs the whole extent; the invoegstrook does not, which is the entire
  // point of it. Full width to the deadline, then a puntstuk narrowing away to nothing.
  out.push(rect('asphalt', lanes.leftEdgeX, ext.minY, lanes.rightEdgeX, ext.maxY));
  if (entry) {
  out.push(rect('asphalt', lanes.rightEdgeX - SEAM, ext.minY, lanes.mergeTo, mergeEndY));
  out.push({
    kind: 'asphalt',
    height: 0,
    points: [
      { x: lanes.rightEdgeX - SEAM, y: mergeEndY },
      { x: lanes.mergeTo, y: mergeEndY },
      { x: lanes.rightEdgeX - SEAM, y: taperEnd },
    ],
  });

  // The left kantstreep is unbroken over the whole extent: a break in an edge line means something
  // this road does not offer — an exit, a bus lane, somewhere to pull off.
  out.push(rect('paint', lanes.leftEdgeX - LINE_WIDTH / 2, ext.minY, lanes.leftEdgeX + LINE_WIDTH / 2, ext.maxY));

  // The right one follows the road it edges: out at the strook, in along the puntstuk, and then
  // hard against the carriageway once there is no strook left.
  out.push(rect('paint', lanes.mergeTo - LINE_WIDTH / 2, ext.minY, lanes.mergeTo + LINE_WIDTH / 2, mergeEndY));
  out.push({
    kind: 'paint',
    height: 0,
    points: [
      { x: lanes.mergeTo - LINE_WIDTH / 2, y: mergeEndY },
      { x: lanes.mergeTo + LINE_WIDTH / 2, y: mergeEndY },
      { x: lanes.rightEdgeX + LINE_WIDTH / 2, y: taperEnd },
      { x: lanes.rightEdgeX - LINE_WIDTH / 2, y: taperEnd },
    ],
  });
  out.push(rect('paint', lanes.rightEdgeX - LINE_WIDTH / 2, taperEnd, lanes.rightEdgeX + LINE_WIDTH / 2, ext.maxY));
  } else if (exit) {
    // The wedge that opens it, then the strook at full width to where the afrit curves away.
    out.push({
      kind: 'asphalt',
      height: 0,
      points: [
        { x: lanes.rightEdgeX - SEAM, y: exitLeadFrom },
        { x: lanes.rightEdgeX - SEAM, y: exitFrom },
        { x: lanes.mergeTo, y: exitFrom },
      ],
    });
    // A seam past the end so the strook and the curve overlap instead of meeting exactly. Without
    // it the last sample of the ride lands on the boundary and reads as off the road.
    out.push(rect('asphalt', lanes.rightEdgeX - SEAM, exitFrom, lanes.mergeTo, exitTo + SEAM));

    out.push(rect('paint', lanes.leftEdgeX - LINE_WIDTH / 2, ext.minY, lanes.leftEdgeX + LINE_WIDTH / 2, ext.maxY));

    // The right kantstreep runs along the carriageway, out around the strook, and back again.
    out.push(rect('paint', lanes.rightEdgeX - LINE_WIDTH / 2, ext.minY, lanes.rightEdgeX + LINE_WIDTH / 2, exitLeadFrom));
    out.push({
      kind: 'paint',
      height: 0,
      points: [
        { x: lanes.rightEdgeX - LINE_WIDTH / 2, y: exitLeadFrom },
        { x: lanes.rightEdgeX + LINE_WIDTH / 2, y: exitLeadFrom },
        { x: lanes.mergeTo + LINE_WIDTH / 2, y: exitFrom },
        { x: lanes.mergeTo - LINE_WIDTH / 2, y: exitFrom },
      ],
    });
    out.push(rect('paint', lanes.mergeTo - LINE_WIDTH / 2, exitFrom, lanes.mergeTo + LINE_WIDTH / 2, exitTo));
    out.push(rect('paint', lanes.rightEdgeX - LINE_WIDTH / 2, exitTo, lanes.rightEdgeX + LINE_WIDTH / 2, ext.maxY));
  } else {
    // Open road: the right-hand kantstreep is simply the edge of the carriageway, all the way.
    out.push(
      rect('paint', lanes.rightEdgeX - LINE_WIDTH / 2, ext.minY, lanes.rightEdgeX + LINE_WIDTH / 2, ext.maxY),
    );
  }

  for (const x of lanes.laneBoundaries) {
    dashedAlongY(out, x, ext, { dash: LANE_DASH.dash, gap: LANE_DASH.gap, width: LINE_WIDTH });
  }

  // The blocks fill the band whole, so their width is the band's rather than a number of their
  // own. A narrower row would leave a strip of bare asphalt on one side of the invoegstrook that
  // belongs to neither lane and means nothing.
  // Blokmarkering only exists to mark a lane that ends, so an open stretch has none.
  if (entry) {
    dashedAlongY(out, (lanes.blockFrom + lanes.blockTo) / 2, { ...ext, maxY: mergeEndY }, {
      dash: BLOCK.length,
      gap: BLOCK.gap,
      width: lanes.blockTo - lanes.blockFrom,
    });
  }
  // The same band on an exit, and it starts where the road starts splitting rather than where the
  // strook reaches full width. Those are `EXIT_LEAD_M` apart, and in between sat a widening wedge of
  // bare tarmac with no marking on it at all — which from the saddle reads as a shoulder, not as a
  // lane you may cross into. The blocks running up the gore are what say otherwise, and they are
  // what a rider sees first: the band arrives before the lane it belongs to is wide enough to hold
  // anything.
  if (exit) {
    dashedAlongY(out, (lanes.blockFrom + lanes.blockTo) / 2, { ...ext, minY: exitLeadFrom, maxY: exitTo }, {
      dash: BLOCK.length,
      gap: BLOCK.gap,
      width: lanes.blockTo - lanes.blockFrom,
    });
  }

  onRamp(out, world, lanes);
  offRamp(out, world, lanes);

  const roadEdgeX = entry || exit ? lanes.mergeTo : lanes.rightEdgeX;
  hectometerPosts(out, ext, roadEdgeX + HM_POST.offset);
  treeline(
    out,
    ext,
    roadEdgeX + road.bermWidth + BERM_TREES.clearance,
    roadEdgeX + road.bermWidth + BERM_TREES.clearance + BERM_TREES.depth,
    1,
    // The oprit swings out through this band; a wood standing in it would be a wood on the road.
    entry ? [ext.minY, entry.ramp.strookStartY + 4] : undefined,
  );

  return out;
}

/**
 * The signs a stretch of motorway carries.
 *
 * Kept apart from `motorwaySurfaces` because they answer a different question: that function
 * describes the road, this one describes what the road tells you about itself. Both are derived
 * from the same layout, so neither can drift from the other.
 *
 * Placement is in the berm, outboard of the hectometerpaaltjes and inboard of the wood — the strip
 * a real sign stands in. Nothing here picks an x of its own: they all come off `motorwayLanes()`,
 * for the same reason no marking does.
 */
export function motorwaySigns(
  world: MotorwayWorld,
  ext: RoadExtent,
  speedLimitKmh?: number,
): Surface[] {
  const lanes = motorwayLanes(world.road);
  const stretch = world.stretch;
  const exit = stretch.kind === 'afrit' ? stretch : null;
  const roadEdgeX = stretch.kind === 'doorgaand' ? lanes.rightEdgeX : lanes.mergeTo;
  const vergeX = roadEdgeX + world.road.bermWidth * SIGN_BERM.limit;
  const out: Surface[] = [];

  // Where the ride begins, whatever kind of stretch this is. An A1 is only worth standing up where
  // a rider will pass it, and the three kinds start in three different places.
  const startY =
    stretch.kind === 'oprit' ? stretch.ramp.strookStartY : stretch.startY;

  const inView = (y: number) => y >= ext.minY && y <= ext.maxY;

  if (speedLimitKmh !== undefined && inView(startY + SIGN_BERM.limitAfterStart)) {
    out.push(...sign({ x: vergeX, y: startY + SIGN_BERM.limitAfterStart }, {
      type: 'speedLimit',
      kmh: speedLimitKmh,
    }));
  }

  // The board goes well before the gore opens, which is where one stands on a real afrit: it has to
  // be read and acted on while there is still road left to act in.
  if (exit) {
    const boardY = exit.strookStartY - SIGN_BERM.boardBeforeStrook;
    if (inView(boardY)) {
      out.push(...sign({ x: roadEdgeX + world.road.bermWidth * SIGN_BERM.board, y: boardY }, {
        type: 'exit',
        destination: exit.destination,
        ...(exit.exitNumber === undefined ? {} : { exitNumber: exit.exitNumber }),
      }));
    }
  }

  return out;
}
