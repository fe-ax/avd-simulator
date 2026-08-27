/**
 * A flat, north-up plan camera for the scenario builder.
 *
 * The chase camera in `camera.ts` is projective and follows the rider, which is exactly right for
 * watching a ride back and exactly wrong for editing one. It has a horizon, its scale changes with
 * depth, and turning a pixel back into a world point means undoing a perspective divide that is
 * singular a few metres behind the eye. An editor needs the opposite: one metre is one number of
 * pixels everywhere, and `unproject` is the whole point rather than an afterthought.
 *
 * Satisfying `ViewCamera` means every road polygon, marking and vehicle sprite already written
 * draws through this without a line of new painting code.
 */
import type { CameraSpace, Projected, ViewCamera } from './camera';
import type { Vec2 } from '../sim/types';

/**
 * Pixels per metre at the far end of the zoom.
 *
 * Low enough that a three-hundred-metre actor path and a fifteen-metre carriageway can be on
 * screen together. At the old floor of 1.2 you could frame the handles or the road, not both: the
 * whole road came out eighteen pixels across.
 */
const MIN_SCALE = 0.45;
const MAX_SCALE = 40;

export class PlanCamera implements ViewCamera {
  /** Focus point in world metres — the point the middle of the canvas is looking at. */
  x = 0;
  y = 0;
  /** North up: the world angle pointing into the top of the screen. */
  yaw = Math.PI / 2;

  width = 0;
  height = 0;
  /** Pixels per metre, in every direction and at every depth. That is the whole idea. */
  scale = 6;

  resize(cssWidth: number, cssHeight: number) {
    this.width = cssWidth;
    this.height = cssHeight;
  }

  /** World metres to camera-relative forward/lateral metres. Same convention as the chase camera. */
  toCamera(worldX: number, worldY: number): CameraSpace {
    const dx = worldX - this.x;
    const dy = worldY - this.y;
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    return { u: dx * c + dy * s, v: -dx * s + dy * c };
  }

  /** Forward is up the screen, left is left. `q` is 1 everywhere: there is no depth here. */
  projectCamera(u: number, v: number): Projected {
    return { x: this.width / 2 - v * this.scale, y: this.height / 2 - u * this.scale, q: 1 };
  }

  project(worldX: number, worldY: number): Projected {
    const { u, v } = this.toCamera(worldX, worldY);
    return this.projectCamera(u, v);
  }

  /** Canvas CSS pixels back to a world point. The inverse of `project`, and the reason for all this. */
  unproject(px: number, py: number): Vec2 {
    const v = (this.width / 2 - px) / this.scale;
    const u = (this.height / 2 - py) / this.scale;
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    return { x: this.x + u * c - v * s, y: this.y + u * s + v * c };
  }

  /** Sprites are drawn true to plan, not squashed onto a receding ground plane. */
  depthRatioAt(): number {
    return 1;
  }

  /** Nothing is ever behind the eye, so the frustum clip in `paint.ts` never has anything to do. */
  get minU(): number {
    return Number.NEGATIVE_INFINITY;
  }

  worldBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const px of [0, this.width]) {
      for (const py of [0, this.height]) {
        const p = this.unproject(px, py);
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
    }
    return { minX, maxX, minY, maxY };
  }

  /** Drag the world under the cursor, in pixels. */
  panBy(dxPx: number, dyPx: number) {
    const before = this.unproject(0, 0);
    const after = this.unproject(dxPx, dyPx);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  /** Zoom about a pixel, so whatever is under the cursor stays under the cursor. */
  zoomAt(px: number, py: number, factor: number) {
    const anchor = this.unproject(px, py);
    this.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.scale * factor));
    const moved = this.unproject(px, py);
    this.x += anchor.x - moved.x;
    this.y += anchor.y - moved.y;
  }

  /**
   * Frame a world box with a margin in metres, which is how the builder opens a scenario.
   *
   * Reports whether it actually managed it. A canvas that has not been laid out yet has no size to
   * scale against, and a caller that assumes the framing happened anyway leaves the view at
   * whatever the default was — which is how the builder came to open with the handles you are told
   * to drag sitting off the bottom of the screen.
   */
  fit(bounds: { minX: number; maxX: number; minY: number; maxY: number }, marginM = 8): boolean {
    const w = bounds.maxX - bounds.minX + marginM * 2;
    const h = bounds.maxY - bounds.minY + marginM * 2;
    if (w <= 0 || h <= 0 || this.width === 0 || this.height === 0) return false;
    this.x = (bounds.minX + bounds.maxX) / 2;
    this.y = (bounds.minY + bounds.maxY) / 2;
    // North up, so world height maps to canvas height.
    this.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min(this.width / w, this.height / h)));
    return true;
  }
}
