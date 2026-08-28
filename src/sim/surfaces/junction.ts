/**
 * A plain crossroads: two roads meeting, and nothing else.
 *
 * No fietspad and no lamp posts on every corner — this is the ordinary junction most hazard
 * exercises happen at, where a car comes out of a side road too fast and the only things on the
 * road are you and it. Everything here is deliberately quieter than the Kerkstraat next door: what
 * a rider has to read is the other vehicle, not the furniture.
 *
 * Pure geometry; see `../roadSurfaces.ts` for the vocabulary.
 */
import {
  dashedAlongX,
  dashedAlongY,
  rect,
  sharkTeeth,
  sharkTeethAlongX,
  SEAM,
  type Facing,
  type RoadExtent,
  type Surface,
} from '../roadSurfaces';
import type { JunctionRoad } from '../types';

const KERB_HEIGHT = 0.12;

/**
 * How far short of the junction the kerb and the hedge stop.
 *
 * Wider than the road itself, because a real corner curves over several metres rather than
 * stopping square — and because a turn cuts the corner well before the mouth. A kerb that stopped
 * at the road edge would stand exactly in the line a turning machine takes, and a hedge that ran
 * on would be a green wall across the road you are turning into. Both of those happened next door
 * before anyone thought to check.
 */
const CORNER_GAP = 8.5;

/**
 * The radius the kerb turns through at each corner.
 *
 * Junctions have one; this one did not. The kerbs simply stopped `CORNER_GAP` short and the corners
 * were paved as four squares out to the same distance, so two six-metre roads met in a seventeen
 * metre paved blob with no edge anywhere in it. From the saddle it passed — you are looking along
 * the road and the corner is gone in half a second — and from above it looks like a car park.
 *
 * Derived so the arc is tangent to both kerb lines, which is what makes it read as a curve rather
 * than as a bite taken out of a square: the straight kerbs stop exactly where the arc meets them.
 */
const KERB_RADIUS = 5.5;

/** Segments per quarter turn. Eight is smooth at every zoom the plan view offers. */
const ARC_STEPS = 8;

const HEDGE_HEIGHT = 1;
const HEDGE_DEPTH = 0.6;

const HOUSE_PITCH = 9;
const HOUSE_HEIGHT = 5.2;
const HOUSE_DEPTH = 8;

const LINE = { dash: 3, gap: 3, width: 0.12 };

/**
 * A terrace down one side of a road, index-derived so a replay draws the identical street.
 *
 * The two clearances are the gap at each end, and they differ because a terrace spans two corners:
 * the east side of the main road is the NE corner going north and the SE corner going south, and
 * an exercise about traffic from the right needs one of those open and has no reason to flatten
 * the other.
 */
function terrace(
  out: Surface[],
  along: 'y' | 'x',
  offset: number,
  facing: Facing,
  from: number,
  to: number,
  clearNeg: number,
  clearPos: number,
) {
  for (let i = Math.floor(from / HOUSE_PITCH) - 1; i <= Math.ceil(to / HOUSE_PITCH) + 1; i++) {
    const at = i * HOUSE_PITCH;
    // Leave the corners open, or the junction is a hole in a wall and unreadable from a distance.
    if (at + 7 > -clearNeg && at < clearPos) continue;
    const depth = HOUSE_DEPTH + (((i % 3) + 3) % 3);
    if (along === 'y') {
      const x1 = offset > 0 ? offset : offset - depth;
      out.push(rect('house', x1, at, x1 + depth, at + 7, HOUSE_HEIGHT, i, facing));
    } else {
      const y1 = offset > 0 ? offset : offset - depth;
      out.push(rect('house', at, y1, at + 7, y1 + depth, HOUSE_HEIGHT, i, facing));
    }
  }
}

export function junctionSurfaces(road: JunctionRoad, ext: RoadExtent): Surface[] {
  const out: Surface[] = [];
  const { halfWidth, sideHalfWidth, vergeTo } = road;

  // Scenery first: everything after this is road, and road wins.
  for (const sign of [1, -1] as const) {
    const inner = sign * (vergeTo - HEDGE_DEPTH);
    const outer = sign * vergeTo;
    out.push(rect('hedge', inner, ext.minY, outer, -CORNER_GAP, HEDGE_HEIGHT));
    out.push(rect('hedge', inner, CORNER_GAP, outer, ext.maxY, HEDGE_HEIGHT));
    out.push(rect('hedge', ext.minX, inner, -CORNER_GAP, outer, HEDGE_HEIGHT));
    out.push(rect('hedge', CORNER_GAP, inner, ext.maxX, outer, HEDGE_HEIGHT));
  }

  // How far back the terraces stand is the sight line, and the sight line is the exercise: a rider
  // cannot read traffic on the side road through a house. See `JunctionRoad.openCorners`.
  //
  // Each terrace runs between two corners, so it takes the clearance of whichever corner is at
  // each end — negative along its axis first, then positive.
  const shut = vergeTo + 4;
  const o = road.openCorners ?? {};
  const at = (corner: 'ne' | 'nw' | 'se' | 'sw') => o[corner] ?? shut;
  terrace(out, 'y', vergeTo + 1, 'west', ext.minY, ext.maxY, at('se'), at('ne'));
  terrace(out, 'y', -vergeTo - 1, 'east', ext.minY, ext.maxY, at('sw'), at('nw'));
  terrace(out, 'x', vergeTo + 1, 'south', ext.minX, ext.maxX, at('nw'), at('ne'));
  terrace(out, 'x', -vergeTo - 1, 'north', ext.minX, ext.maxX, at('sw'), at('se'));

  // Raised kerbs, interrupted at the corners. From the saddle the raised edge running alongside
  // you stopping dead is the strongest cue that a junction is coming; a flat strip is invisible
  // edge-on.
  // Each straight stops where the corner arc becomes tangent to it, so the two meet without a
  // step. That is further out than the hedges' gap, which is why they are separate numbers.
  const tangentY = sideHalfWidth + KERB_RADIUS;
  const tangentX = halfWidth + KERB_RADIUS;
  for (const sign of [1, -1] as const) {
    const inner = sign * (halfWidth - SEAM);
    const outer = sign * (halfWidth + 0.5);
    out.push(rect('kerb', inner, ext.minY, outer, -tangentY, KERB_HEIGHT));
    out.push(rect('kerb', inner, tangentY, outer, ext.maxY, KERB_HEIGHT));
    const sInner = sign * (sideHalfWidth - SEAM);
    const sOuter = sign * (sideHalfWidth + 0.5);
    out.push(rect('kerb', ext.minX, sInner, -tangentX, sOuter, KERB_HEIGHT));
    out.push(rect('kerb', tangentX, sInner, ext.maxX, sOuter, KERB_HEIGHT));
  }

  out.push(rect('asphalt', -halfWidth, ext.minY, halfWidth, ext.maxY));
  out.push(rect('asphalt', ext.minX, -sideHalfWidth, ext.maxX, sideHalfWidth));

  // Pave each corner up to the arc, and lay the kerb around it.
  //
  // The pavement is the curved triangle between the two road edges and the fillet — the bit a
  // vehicle actually drives over when it turns — rather than the whole square, which is road nobody
  // uses and which is what made the junction look like a forecourt.
  for (const sx of [1, -1] as const) {
    for (const sy of [1, -1] as const) {
      const cx = sx * tangentX;
      const cy = sy * tangentY;
      // From the point on the main road edge round to the point on the side road edge. Signs put
      // the sweep in the right quadrant without four separate cases.
      const arc = (r: number) =>
        Array.from({ length: ARC_STEPS + 1 }, (_, i) => {
          const u = i / ARC_STEPS;
          const th = (u * Math.PI) / 2;
          return { x: cx - sx * r * Math.cos(th), y: cy - sy * r * Math.sin(th) };
        });

      out.push({
        kind: 'asphalt',
        height: 0,
        points: [
          { x: sx * (halfWidth - SEAM), y: sy * (sideHalfWidth - SEAM) },
          { x: sx * (halfWidth - SEAM), y: cy },
          ...arc(KERB_RADIUS),
          { x: cx, y: sy * (sideHalfWidth - SEAM) },
        ],
      });

      // The kerb band sits on the verge side of the arc, so the raised edge follows the curve the
      // way it follows the straights either side of it.
      out.push({
        kind: 'kerb',
        height: KERB_HEIGHT,
        points: [...arc(KERB_RADIUS), ...arc(KERB_RADIUS - 0.5).reverse()],
      });
    }
  }

  dashedAlongY(out, 0, ext, {
    dash: LINE.dash,
    gap: LINE.gap,
    width: LINE.width,
    skip: [-sideHalfWidth - 1, sideHalfWidth + 1],
  });
  dashedAlongX(out, 0, ext, {
    dash: LINE.dash,
    gap: LINE.gap,
    width: LINE.width,
    skips: [[-halfWidth - 1, halfWidth + 1]],
  });

  return out;
}

/**
 * Haaientanden across whichever arm has to give way, apex pointing at whoever must yield.
 *
 * Painted separately from the road because who yields is a property of the scenario, not of the
 * geometry: the same crossroads teaches a different lesson depending on which way the teeth face.
 */
export function junctionGiveWay(
  road: JunctionRoad,
  giveWay: 'side' | 'main' | 'none',
): Surface[] {
  const out: Surface[] = [];
  const { halfWidth, sideHalfWidth } = road;

  // Two rules decide where a row goes, and both were wrong here in the same way.
  //
  // **The lane is the one arriving, not the one leaving.** Traffic reaching the east mouth is
  // heading west, and westbound is the *north* half — `junctionLanes` says so, and the scenario's
  // car sits at y=+1,5 doing exactly that. A row painted across the south half is across the lane
  // of somebody driving away from the junction, who has nothing to give way to.
  //
  // **The apex points at whoever must yield**, which is outwards, away from the junction. Pointing
  // it inwards aims the teeth at the driver with priority.
  if (giveWay === 'side') {
    // Across both mouths of the side road, so traffic coming out of it yields to you.
    sharkTeeth(out, halfWidth + 0.6, 0.25, sideHalfWidth - 0.1, 1);
    sharkTeeth(out, -halfWidth - 0.6, -sideHalfWidth + 0.1, -0.25, -1);
  } else if (giveWay === 'main') {
    // Across your own road instead: you are the one who has to give way.
    sharkTeethAlongX(out, -sideHalfWidth - 0.6, 0.25, halfWidth - 0.1, -1);
    sharkTeethAlongX(out, sideHalfWidth + 0.6, -halfWidth + 0.1, -0.25, 1);
  }
  return out;
}
