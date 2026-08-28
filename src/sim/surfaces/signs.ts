/**
 * Road signs as geometry: a post at a place, carrying a face.
 *
 * The footprint a generator emits is the **post**, exactly as it is for a lamp or a
 * hectometerpaaltje — small, and the thing that has to clear the route. Where the plate hangs and
 * how big it is belongs to whoever is drawing it, which is why `PLATE` lives here as shared
 * measurements rather than in either renderer: the plan view needs the same width to draw a board
 * from above that the scene needs to build one.
 *
 * **The sizes are RVV nominals, not taste.** A Dutch A1 is a 600 mm disc in a built-up area and
 * 900 on a motorway, a B1 is a 600 mm diamond, and bewegwijzering over an afrit is metres wide on
 * two posts. If one of these looks wrong from the saddle the answer is the mounting height or the
 * viewing distance, not the sign — it is the same rule as `mirrors.ts:glassTilt()`. Adjust one and
 * say what you measured.
 */
import type { Facing, SignFace, Surface } from '../roadSurfaces';
import type { Vec2 } from '../types';

/**
 * Post footprint. Square, and small: this is what `findObstructions` tests against the route.
 *
 * Exported because a renderer hanging a plate on one has to clear it. Half of this is how far the
 * post's front face stands from its centre, and a plate mounted any less proud than that comes out
 * with a post-shaped stripe down the middle of it.
 */
export const POST = { side: 0.12 };

/**
 * Plate sizes and mounting heights, in metres.
 *
 * `height` is the top of the post — signs are hung from it downward, so a taller post raises the
 * plate rather than stretching it. Urban signs sit lower than motorway ones because a rider is
 * closer to them and a 2,2 m plate at four metres is unreadable.
 */
export const PLATE: Record<SignFace['type'], { width: number; height: number; post: number }> = {
  // A1: 600 mm disc, bottom of the plate about 2,2 m up in a built-up area.
  speedLimit: { width: 0.6, height: 0.6, post: 2.8 },
  // B1: 600 mm diamond, on its point.
  priorityRoad: { width: 0.6, height: 0.6, post: 2.8 },
  // B6: 600 mm triangle. Mounted a little lower — it is read from close to, at a stop line.
  giveWay: { width: 0.6, height: 0.53, post: 2.5 },
  // G11: 600 mm disc.
  cyclePath: { width: 0.6, height: 0.6, post: 2.4 },
  // Bewegwijzering over an afrit: a board, not a plate, and the reason it needs two posts.
  exit: { width: 4.2, height: 1.6, post: 4.4 },
};

/**
 * How far a plate has to stand from its post's centre.
 *
 * A post has depth, and the plate is hung on the front of it: mount one less proud than half the
 * post and the post comes through the middle of the sign. Five centimetres looked like ample
 * clearance and is less than the six the post's own front face already occupies, so every sign in
 * the scene rendered with a grey stripe down it. It read as a gap in a colour — invisible in a
 * screenshot, obvious the moment the pixels were swept — which is why the number is derived here
 * rather than picked in the renderer.
 */
export const PLATE_CLEARANCE = POST.side / 2 + 0.02;

/** A board this wide gets a post at each end rather than one in the middle. */
const TWO_POSTS_FROM = 2;

/**
 * One sign, as the surfaces that hold it up.
 *
 * Returns a post per upright. The face rides on every one of them, so a renderer can group the
 * pair and draw a single plate spanning them — which is what makes an exit board one board on two
 * legs rather than two boards.
 *
 * `facing` is which way the plate looks, and it is placement rather than content: the same B6
 * stands on both arms of a crossroads pointing opposite ways. The default faces back down a
 * northbound road, which is the direction every scenario's rider travels.
 */
export function sign(at: Vec2, face: SignFace, facing: Facing = 'south'): Surface[] {
  const spec = PLATE[face.type];
  const half = POST.side / 2;
  const offsets =
    spec.width >= TWO_POSTS_FROM ? [-spec.width / 2 + 0.3, spec.width / 2 - 0.3] : [0];

  return offsets.map((dx) => ({
    kind: 'sign' as const,
    facing,
    points: [
      { x: at.x + dx - half, y: at.y - half },
      { x: at.x + dx + half, y: at.y - half },
      { x: at.x + dx + half, y: at.y + half },
      { x: at.x + dx - half, y: at.y + half },
    ] satisfies Vec2[],
    height: spec.post,
    sign: face,
  }));
}

/** One sign, as both renderers need it: the face, where its plate is centred, and which way it looks. */
export interface SignGroup {
  face: SignFace;
  /** Midpoint of the posts, which is the middle of the plate. */
  at: Vec2;
  /** Top of the tallest post; the plate hangs down from here. */
  top: number;
  facing: Facing;
}

/**
 * Gather sign posts into the signs they hold up.
 *
 * Here rather than in either renderer because it is a fact about signs, not about drawing them:
 * an exit board is **one** board on two legs, and a scene that merged its legs while a plan view
 * drew each of them separately would be two views disagreeing about how many signs there are. That
 * is the whole class of bug `roadSurfaces` exists to prevent, so the answer lives beside it.
 *
 * Grouped by what the sign says and where along the road it stands. Reference equality would be
 * neater and is not available — these surfaces have crossed a `roadSurfaces` call.
 */
export function signGroups(surfaces: readonly Surface[]): SignGroup[] {
  const groups = new Map<string, Surface[]>();
  for (const s of surfaces) {
    if (!s.sign) continue;
    const key = `${JSON.stringify(s.sign)}|${s.points[0].y.toFixed(1)}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }

  return [...groups.values()].map((posts) => {
    const xs = posts.flatMap((p) => p.points.map((q) => q.x));
    const ys = posts.flatMap((p) => p.points.map((q) => q.y));
    return {
      face: posts[0].sign!,
      at: {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: (Math.min(...ys) + Math.max(...ys)) / 2,
      },
      top: Math.max(...posts.map((p) => p.height)),
      facing: posts[0].facing ?? 'south',
    };
  });
}

/**
 * The plate as it looks from directly above: a line the width of the sign, across its facing.
 *
 * The post is what stands in the verge and what `findObstructions` cares about, but at any sane
 * plan-view scale it is a fraction of a pixel — so from above a sign was simply not there. The
 * plate is the part with any width to it, and drawing that is both the truthful answer and the
 * visible one.
 */
export function plateFootprint(group: SignGroup): Vec2[] {
  const spec = PLATE[group.face.type];
  const alongX = group.facing === 'south' || group.facing === 'north';
  const half = spec.width / 2;
  const depth = 0.2;
  const dx = alongX ? half : depth;
  const dy = alongX ? depth : half;
  return [
    { x: group.at.x - dx, y: group.at.y - dy },
    { x: group.at.x + dx, y: group.at.y - dy },
    { x: group.at.x + dx, y: group.at.y + dy },
    { x: group.at.x - dx, y: group.at.y + dy },
  ];
}
