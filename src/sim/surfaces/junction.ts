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

const HEDGE_HEIGHT = 1;
const HEDGE_DEPTH = 0.6;

const HOUSE_PITCH = 9;
const HOUSE_HEIGHT = 5.2;
const HOUSE_DEPTH = 8;

const LINE = { dash: 3, gap: 3, width: 0.12 };

/** A terrace down one side of a road, index-derived so a replay draws the identical street. */
function terrace(
  out: Surface[],
  along: 'y' | 'x',
  offset: number,
  facing: Facing,
  from: number,
  to: number,
  clear: number,
) {
  for (let i = Math.floor(from / HOUSE_PITCH) - 1; i <= Math.ceil(to / HOUSE_PITCH) + 1; i++) {
    const at = i * HOUSE_PITCH;
    // Leave the corners open, or the junction is a hole in a wall and unreadable from a distance.
    if (at + 7 > -clear && at < clear) continue;
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

  terrace(out, 'y', vergeTo + 1, 'west', ext.minY, ext.maxY, vergeTo + 4);
  terrace(out, 'y', -vergeTo - 1, 'east', ext.minY, ext.maxY, vergeTo + 4);
  terrace(out, 'x', vergeTo + 1, 'south', ext.minX, ext.maxX, vergeTo + 4);
  terrace(out, 'x', -vergeTo - 1, 'north', ext.minX, ext.maxX, vergeTo + 4);

  // Raised kerbs, interrupted at the corners. From the saddle the raised edge running alongside
  // you stopping dead is the strongest cue that a junction is coming; a flat strip is invisible
  // edge-on.
  for (const sign of [1, -1] as const) {
    const inner = sign * (halfWidth - SEAM);
    const outer = sign * (halfWidth + 0.5);
    out.push(rect('kerb', inner, ext.minY, outer, -CORNER_GAP, KERB_HEIGHT));
    out.push(rect('kerb', inner, CORNER_GAP, outer, ext.maxY, KERB_HEIGHT));
    const sInner = sign * (sideHalfWidth - SEAM);
    const sOuter = sign * (sideHalfWidth + 0.5);
    out.push(rect('kerb', ext.minX, sInner, -CORNER_GAP, sOuter, KERB_HEIGHT));
    out.push(rect('kerb', CORNER_GAP, sInner, ext.maxX, sOuter, KERB_HEIGHT));
  }

  out.push(rect('asphalt', -halfWidth, ext.minY, halfWidth, ext.maxY));
  out.push(rect('asphalt', ext.minX, -sideHalfWidth, ext.maxX, sideHalfWidth));

  // Pave the corners where the kerb is interrupted, or the machine cuts across bare ground —
  // invisible from above and gone in half a second from the saddle, which is how it survived so
  // long on the other junction.
  for (const sx of [1, -1] as const) {
    for (const sy of [1, -1] as const) {
      out.push(
        rect(
          'asphalt',
          sx * (halfWidth - SEAM),
          sy * (sideHalfWidth - SEAM),
          sx * CORNER_GAP,
          sy * CORNER_GAP,
        ),
      );
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

  if (giveWay === 'side') {
    // Across both mouths of the side road, so traffic coming out of it yields to you.
    sharkTeeth(out, halfWidth + 0.6, -sideHalfWidth + 0.1, -0.25, -1);
    sharkTeeth(out, -halfWidth - 0.6, 0.25, sideHalfWidth - 0.1, 1);
  } else if (giveWay === 'main') {
    // Across your own road instead: you are the one who has to give way.
    sharkTeethAlongX(out, -sideHalfWidth - 0.6, -halfWidth + 0.1, -0.25, -1);
    sharkTeethAlongX(out, sideHalfWidth + 0.6, 0.25, halfWidth - 0.1, 1);
  }
  return out;
}
