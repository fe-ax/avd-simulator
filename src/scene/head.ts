/**
 * Where the rider is looking.
 *
 * Pointer lock rather than a draggable or screen-mapped mouse, because a schouderblik is roughly
 * 135° of turn: anything that runs out of screen or needs repeated strokes fails at exactly the
 * moment there is least time.
 *
 * Dragging still works whenever the pointer is not locked, and that is not a nicety. Some contexts
 * grant the lock request and never actually take it — an embedded frame, a window without focus —
 * and there the rider would otherwise be left unable to look at all, which is the one thing this
 * whole simulator is about. Holding the button and dragging costs several strokes for a shoulder
 * check, but it always works.
 *
 * The head returns to the road when the mouse goes idle. Without it a full shoulder check costs
 * about a metre of mouse travel each way, and the head can be parked sideways indefinitely. The
 * idle delay is comfortably longer than the dwell needed to register a look, so the natural
 * rhythm is: turn, hold long enough to actually see, let go, and the road comes back.
 */
export interface HeadPose {
  /** Radians relative to the machine. Positive is left, matching the simulation's bearings. */
  yaw: number;
  /** Radians. Positive is up. */
  pitch: number;
}

/** A rider can manage roughly this much with neck and shoulders together. */
export const YAW_LIMIT = (140 * Math.PI) / 180;
export const PITCH_LIMIT = (45 * Math.PI) / 180;

const RADIANS_PER_PIXEL = 0.0028;
/** Idle time before the head starts coming back. Longer than the dwell, deliberately. */
const RETURN_AFTER_S = 0.45;
/** Exponential rate of the return; about two thirds of the way back in half a second. */
const RETURN_RATE = 2.2;

const clamp = (n: number, limit: number) => Math.max(-limit, Math.min(limit, n));

export class HeadController {
  readonly pose: HeadPose = { yaw: 0, pitch: 0 };
  locked = false;
  /** Set false to keep the head wherever the rider left it. */
  returnsToRoad = true;

  private idleFor = 0;
  private dragging = false;
  private onLockChange: (() => void) | null = null;

  attach(canvas: HTMLCanvasElement, onLockChange?: (locked: boolean) => void): () => void {
    const requestLock = () => {
      if (!this.locked) void canvas.requestPointerLock();
    };

    const move = (e: MouseEvent) => {
      if (!this.locked && !this.dragging) return;
      this.pose.yaw = clamp(this.pose.yaw - e.movementX * RADIANS_PER_PIXEL, YAW_LIMIT);
      this.pose.pitch = clamp(this.pose.pitch - e.movementY * RADIANS_PER_PIXEL, PITCH_LIMIT);
      this.idleFor = 0;
    };

    const lockChange = () => {
      this.locked = document.pointerLockElement === canvas;
      onLockChange?.(this.locked);
    };

    const dragStart = (e: MouseEvent) => {
      if (e.button === 0 && !this.locked) this.dragging = true;
    };
    const dragEnd = () => {
      this.dragging = false;
    };

    this.onLockChange = lockChange;
    canvas.addEventListener('click', requestLock);
    canvas.addEventListener('mousedown', dragStart);
    document.addEventListener('mouseup', dragEnd);
    document.addEventListener('mousemove', move);
    document.addEventListener('pointerlockchange', lockChange);

    return () => {
      canvas.removeEventListener('click', requestLock);
      canvas.removeEventListener('mousedown', dragStart);
      document.removeEventListener('mouseup', dragEnd);
      document.removeEventListener('mousemove', move);
      document.removeEventListener('pointerlockchange', lockChange);
      this.onLockChange = null;
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    };
  }

  update(dt: number) {
    this.idleFor += dt;
    if (!this.returnsToRoad || this.idleFor < RETURN_AFTER_S) return;
    const alpha = 1 - Math.exp(-dt * RETURN_RATE);
    this.pose.yaw -= this.pose.yaw * alpha;
    this.pose.pitch -= this.pose.pitch * alpha;
  }

  reset() {
    this.pose.yaw = 0;
    this.pose.pitch = 0;
    this.idleFor = 0;
    this.dragging = false;
  }

  release() {
    if (this.onLockChange && document.pointerLockElement) document.exitPointerLock();
  }
}
