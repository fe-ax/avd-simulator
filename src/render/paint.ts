/**
 * World-space painting under the perspective camera.
 *
 * The projection is projective, so a straight edge in the world stays a straight edge on
 * screen: a world rectangle becomes a trapezoid and nothing needs subdividing. What does need
 * care is the region behind the eye, where the projection inverts — polygons are clipped
 * against that plane in camera space before any of them reach the canvas.
 */
import type { Camera, CameraSpace } from './camera';

export interface WorldPoint {
  x: number;
  y: number;
}

/** Sutherland–Hodgman against the single half-plane `u >= minU`. */
function clipToFrustum(poly: CameraSpace[], minU: number): CameraSpace[] {
  const out: CameraSpace[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const aIn = a.u >= minU;
    const bIn = b.u >= minU;
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const t = (minU - a.u) / (b.u - a.u);
      out.push({ u: minU, v: a.v + (b.v - a.v) * t });
    }
  }
  return out;
}

export function pathWorldPoly(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  points: WorldPoint[],
): boolean {
  const clipped = clipToFrustum(
    points.map((p) => cam.toCamera(p.x, p.y)),
    cam.minU,
  );
  if (clipped.length < 3) return false;

  ctx.beginPath();
  for (let i = 0; i < clipped.length; i++) {
    const s = cam.projectCamera(clipped[i].u, clipped[i].v);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  }
  ctx.closePath();
  return true;
}

export function fillWorldPoly(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  points: WorldPoint[],
  color: string,
) {
  if (!pathWorldPoly(ctx, cam, points)) return;
  ctx.fillStyle = color;
  ctx.fill();
}

/** Axis-aligned world rectangle. Corners are ordered so the trapezoid never self-intersects. */
export function fillWorldRect(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
) {
  fillWorldPoly(
    ctx,
    cam,
    [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
      { x: x1, y: y2 },
    ],
    color,
  );
}
