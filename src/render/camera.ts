/**
 * Perspective ground-plane camera.
 *
 * A pure top-down view can only ever show as much road ahead as it has pixels, which is nothing
 * like riding: in the saddle you read the junction from a long way off. So the ground plane is
 * projected instead — near things stay large and legible, far things compress toward a horizon
 * that sits just off the top of the canvas. That buys roughly four times the forward view for
 * the same screen height.
 *
 * Everything is derived from three numbers with obvious meaning: how many metres the top edge
 * shows (`aheadM`), how many the bottom edge shows (`behindM`), and how squashed the near field
 * is (`NEAR_ASPECT`). The rest — the eye distance, the projection constant, the horizon row —
 * falls out of those.
 *
 * The camera yaws to follow the rider's heading, heavily smoothed. A rotating *top-down* map is
 * disorienting, but a perspective view that does not turn with you is worse: after the right
 * turn it would be staring down a road you are no longer on.
 */

/** Vertical pixels per metre ÷ lateral pixels per metre, at the rider's own row. */
const NEAR_ASPECT = 0.8;
/** Eye distance as a multiple of the rear view. Larger flattens the perspective. */
const REAR_HEADROOM = 2.2;
/** Exponential rate at which yaw catches up with heading. */
const YAW_RATE = 2.2;
/** How far ahead of the rider the focus point drifts at the road's speed limit. */
const LEAD_MAX_M = 8;

export interface CameraSpace {
  /** Metres ahead of the focus point along the camera's yaw. */
  u: number;
  /** Metres to the left of the focus point. */
  v: number;
}

export interface Projected {
  x: number;
  y: number;
  /** Depth factor: 1 at the rider's row, approaching 0 at the horizon. */
  q: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export class Camera {
  /** Focus point in world metres. */
  x = 0;
  y = 0;
  /** World angle that points into the screen. */
  yaw = Math.PI / 2;

  width = 0;
  height = 0;
  /** Lateral pixels per metre at the rider's row. */
  scale = 18;

  aheadM = 85;
  behindM = 13;

  /** Eye distance; the projection is singular at u = -u0. */
  private u0 = 28.6;
  private k = 380;
  private horizonY = -95;
  private initialised = false;

  resize(cssWidth: number, cssHeight: number) {
    this.width = cssWidth;
    this.height = cssHeight;

    this.u0 = this.behindM * REAR_HEADROOM;
    const qTop = this.u0 / (this.aheadM + this.u0);
    const qBottom = this.u0 / (this.u0 - this.behindM);
    this.k = cssHeight / (qBottom - qTop);
    this.horizonY = -this.k * qTop;

    // The height fixes the vertical scale; the width only gets a say through the clamp, so a
    // very wide or very narrow window cannot turn the road into a thread or a wall.
    const verticalNear = this.k / this.u0;
    this.scale = clamp(verticalNear / NEAR_ASPECT, cssWidth / 70, cssWidth / 26);
  }

  reset() {
    this.initialised = false;
  }

  follow(targetX: number, targetY: number, heading: number, speedFactor: number, dt: number) {
    const lead = LEAD_MAX_M * clamp(speedFactor, 0, 1);
    const wantX = targetX + Math.cos(heading) * lead;
    const wantY = targetY + Math.sin(heading) * lead;

    if (!this.initialised) {
      this.x = wantX;
      this.y = wantY;
      this.yaw = heading;
      this.initialised = true;
      return;
    }

    // More than a screenful behind — a backgrounded tab, a burst of dropped frames — means
    // snapping is the only way not to trail the rider off the edge.
    if (Math.hypot(wantX - this.x, wantY - this.y) > this.aheadM) {
      this.x = wantX;
      this.y = wantY;
      this.yaw = heading;
      return;
    }

    const positionAlpha = 1 - Math.exp(-dt * 4);
    this.x += (wantX - this.x) * positionAlpha;
    this.y += (wantY - this.y) * positionAlpha;

    let delta = heading - this.yaw;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    this.yaw += delta * (1 - Math.exp(-dt * YAW_RATE));
  }

  /** World metres to camera-relative forward/lateral metres. */
  toCamera(worldX: number, worldY: number): CameraSpace {
    const dx = worldX - this.x;
    const dy = worldY - this.y;
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    return { u: dx * c + dy * s, v: -dx * s + dy * c };
  }

  /** Camera-relative metres to canvas CSS pixels. Straight lines stay straight. */
  projectCamera(u: number, v: number): Projected {
    const q = this.u0 / (u + this.u0);
    return { x: this.width / 2 - v * this.scale * q, y: this.horizonY + this.k * q, q };
  }

  project(worldX: number, worldY: number): Projected {
    const { u, v } = this.toCamera(worldX, worldY);
    return this.projectCamera(u, v);
  }

  /**
   * Ratio of vertical to lateral pixels per metre at a given depth. Sprites are drawn flat and
   * then squashed by this, which is what makes them sit on the ground plane rather than float
   * above it.
   */
  depthRatioAt(q: number): number {
    return (this.k / (this.u0 * this.scale)) * q;
  }

  /**
   * Anything nearer than this is behind the eye, where the projection inverts. Polygons must be
   * clipped against it before they are drawn.
   */
  get minU(): number {
    return -this.behindM - 8;
  }

  /** World-space bounding box of the visible frustum, for deciding how much road to draw. */
  worldBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const u of [this.minU, this.aheadM]) {
      const q = this.u0 / (u + this.u0);
      const halfV = this.width / 2 / (this.scale * q);
      for (const v of [-halfV, halfV]) {
        const wx = this.x + u * c - v * s;
        const wy = this.y + u * s + v * c;
        minX = Math.min(minX, wx);
        maxX = Math.max(maxX, wx);
        minY = Math.min(minY, wy);
        maxY = Math.max(maxY, wy);
      }
    }
    return { minX, maxX, minY, maxY };
  }
}
