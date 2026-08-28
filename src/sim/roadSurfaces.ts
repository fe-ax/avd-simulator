/**
 * The road as pure geometry: where every surface and every marking is, in world metres, with no
 * idea of how it will be drawn.
 *
 * This is the single definition both renderers read. The top-down view fills these polygons flat;
 * the first-person scene lays them as meshes and extrudes what stands up. Before this existed the
 * top-down renderer both decided where the haaientanden went *and* painted them, which would have
 * guaranteed the two views eventually disagreed about where a marking is.
 *
 * Surfaces come back in painter's order — verge outward, then road, then paint — so a 2D renderer
 * can fill them straight down the list and a 3D one can map that order onto layer offsets.
 *
 * This file owns the vocabulary and dispatches on the kind of world; each generator lives in
 * `surfaces/`.
 */
import type { ScenarioWorld, Vec2 } from './types';
import { urbanCrossingSigns, urbanCrossingSurfaces } from './surfaces/urbanCrossing';
import { junctionGiveWay, junctionSigns, junctionSurfaces } from './surfaces/junction';
import { motorwaySigns, motorwaySurfaces } from './surfaces/motorway';

export type SurfaceKind =
  | 'hedge'
  | 'house'
  | 'roof'
  | 'kerb'
  | 'asphalt'
  | 'fietspad'
  | 'fietspadEdge'
  | 'paint'
  | 'lamp'
  | 'guardrail'
  | 'hectometerPost'
  | 'tree'
  | 'sign';

/** Which way a building fronts. Only the 3D scene uses it, to hang a door and windows there. */
export type Facing = 'north' | 'south' | 'east' | 'west';

/**
 * What a sign *says*, not what it looks like.
 *
 * The five the exercises need, by their RVV codes. Each renderer decides how to draw one — a plate
 * with a canvas texture in the scene, a coloured mark from above — and neither gets to decide what
 * it means. That split is the same one the rest of this file exists for: the day a sign's face is
 * described in a renderer is the day the two views can disagree about what the road is telling you.
 *
 * Every one of these is **derived from something the scenario is already scored against** — the
 * limit, `giveWay`, the presence of a fietspad — so a sign cannot contradict the rule beside it.
 * Only `destination` is typed by an author, because no geometry implies "Deventer".
 */
export type SignFace =
  /** A1. The number is the scenario's own limit, never a second copy of it. */
  | { type: 'speedLimit'; kmh: number }
  /** B1 voorrangsweg: yellow diamond. Stands on the arm that has priority. */
  | { type: 'priorityRoad' }
  /** B6 verleen voorrang: white triangle, point down, red border. Faces the arm with the teeth. */
  | { type: 'giveWay' }
  /** G11 verplicht fietspad: blue disc, white bicycle. */
  | { type: 'cyclePath' }
  /** The blue board over an afrit. */
  | { type: 'exit'; destination: string; exitNumber?: string };

export interface Surface {
  kind: SurfaceKind;
  /** Closed polygon, world metres. */
  points: Vec2[];
  /** Metres to extrude upward. Zero for anything lying on the ground. */
  height: number;
  /** Index-derived, so neighbouring buildings differ without anything being random. */
  variant?: number;
  /**
   * Which way this thing fronts: for a building the side carrying the front door, for a sign the
   * way its plate looks. One field because it is one question, and a sign that fronts the wrong
   * way is as wrong as a terrace whose doors open into its own back garden.
   */
  facing?: Facing;
  /** For signs: what it says. The footprint is the post; the plate is the renderer's to place. */
  sign?: SignFace;
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
/**
 * Every surface visible inside `ext`, in painter's order.
 *
 * The uniform ground is deliberately not included: it is a single flat expanse that each renderer
 * can lay down in whatever way suits it, and emitting it as a polygon would only make both of
 * them slower.
 */
/**
 * @param speedLimitKmh The scenario's limit, so the road can carry the sign that states it.
 *
 * Optional because it lives on `Scenario` and this function is handed a `ScenarioWorld` — the
 * validators ask about geometry and have no scenario to hand. Passing it is what makes an A1
 * appear; omitting it emits no sign at all rather than inventing a number, which is the one thing
 * a sign must never do. Every other sign here is derivable from the world alone.
 */
export function roadSurfaces(
  world: ScenarioWorld,
  ext: RoadExtent,
  speedLimitKmh?: number,
): Surface[] {
  switch (world.kind) {
    case 'motorway':
      return [...motorwaySurfaces(world, ext), ...motorwaySigns(world, ext, speedLimitKmh)];
    case 'junction':
      return [
        ...junctionSurfaces(world.road, ext),
        // Who yields is the scenario's choice, not the geometry's: the same crossroads teaches a
        // different lesson depending on which way the teeth point.
        ...junctionGiveWay(world.road, world.giveWay),
        // And the signs say the same thing standing up: the teeth and the B6 come off one field,
        // so they cannot end up in different arms.
        ...junctionSigns(world.road, world.giveWay, speedLimitKmh),
      ];
    default:
      return [
        ...urbanCrossingSurfaces(world.road, ext),
        ...urbanCrossingSigns(world.road, ext, speedLimitKmh),
      ];
  }
}

// ---------------------------------------------------------------------------
// Shared helpers, used by every generator
// ---------------------------------------------------------------------------

/**
 * Adjoining surfaces overlap by this much so that a projected seam between two trapezoids does
 * not show a one-pixel line of whatever was underneath. In 3D the same overlap is harmless
 * because each kind sits on its own layer offset.
 */
export const SEAM = 0.06;

export function rect(
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

/** A run of dashes along y at a fixed x: lane lines, centre lines, blokmarkering. */
export function dashedAlongY(
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

export function dashedAlongX(
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
export function sharkTeeth(
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

/**
 * The same teeth, across a road running north–south instead of east–west.
 *
 * A transposed twin rather than an axis parameter on the original: the two differ only in which
 * coordinate steps, and reading `sharkTeethAlongX` at the call site says which road is being
 * painted more plainly than a boolean would.
 */
export function sharkTeethAlongX(
  out: Surface[],
  baseY: number,
  fromX: number,
  toX: number,
  pointing: 1 | -1,
) {
  const toothWidth = 0.5;
  const toothLength = 0.6;
  const spacing = 0.85;
  for (let x = fromX; x + toothWidth <= toX; x += spacing) {
    out.push({
      kind: 'paint',
      height: 0,
      points: [
        { x, y: baseY },
        { x: x + toothWidth, y: baseY },
        { x: x + toothWidth / 2, y: baseY + toothLength * pointing },
      ],
    });
  }
}
