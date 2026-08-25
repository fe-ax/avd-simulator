/**
 * The dots, and what it takes to register one.
 *
 * Free mouse-look would otherwise leave "did you check left" a fuzzy judgement about where the
 * gaze happened to be. A dot at each place that has to be checked turns it back into a discrete,
 * timestamped event — the same `ControlId` the engine has always understood — so the scoring, the
 * sequence rule and the replay carry over untouched.
 *
 * The dwell is what makes it honest. Sweeping the head across the cockpit passes over every dot
 * and registers none of them, because none was rested on. That is a far better answer to scanning
 * than the penalty counter it replaces: you cannot look at six things at once, and now you cannot
 * pretend to.
 */
import * as THREE from 'three';
import { MIRROR_POSITION } from './rider';
import { LOOK_DIRECTIONS, SHOULDER_TARGET_DISTANCE } from '../sim/perception';
import type { LookControl } from '../sim/types';

/**
 * Half-angle within which the reticle counts as being on a dot.
 *
 * Measured across the approach, the closest any two dots ever come is 12.7° — the left mirror and
 * the left side-road dot, at about 60 m out, where they sit at nearly the same yaw and are
 * separated almost entirely by the mirror's downward angle. Ten degrees of registration diameter
 * leaves 2.7° of margin, so no two can ever be under the reticle at once. On screen this is still
 * a target about 65 px across, which is far more forgiving than the ring drawn on it.
 */
const REGISTER_HALF_ANGLE = (5 * Math.PI) / 180;
/** How much further the reticle must move away before a dot can be registered again. */
const RELEASE_FACTOR = 1.6;
/** Seconds the reticle must rest on a dot. Long enough that sweeping past does nothing. */
const DWELL_S = 0.3;
/**
 * Seconds a registered check stays green. Matched to the scenario's `minRepeatSeconds`, so the
 * fade doubles as "no point doing this again yet" — and as a reminder that what you saw goes off.
 */
const FRESH_S = 2;

const FOCUS_IN_RATE = 9;
const FOCUS_OUT_RATE = 4;

export interface GazeTargetSpec {
  control: LookControl;
  /** `bike` positions ride with the machine; `world` ones stay where they are. */
  anchor: 'bike' | 'world';
  position: THREE.Vector3;
}

/**
 * Where the six dots live.
 *
 * The two side-road dots sit a good way *down* each arm rather than at its mouth: that is where a
 * rider actually looks for oncoming traffic, and it keeps the pair well separated in angle. At the
 * mouth they would be only a few degrees apart on the approach and impossible to tell apart.
 *
 * The shoulder dots sit out in the blind spot itself — four metres out, two back — so reaching one
 * means turning far enough that the region it covers is genuinely in view.
 */
export function gazeTargetSpecs(): GazeTargetSpec[] {
  return [
    { control: 'MIRROR_LEFT', anchor: 'bike', position: MIRROR_POSITION.left.clone() },
    { control: 'MIRROR_RIGHT', anchor: 'bike', position: MIRROR_POSITION.right.clone() },
    { control: 'SHOULDER_LEFT', anchor: 'bike', position: shoulderTarget('SHOULDER_LEFT') },
    { control: 'SHOULDER_RIGHT', anchor: 'bike', position: shoulderTarget('SHOULDER_RIGHT') },
    { control: 'EYE_LEFT', anchor: 'world', position: new THREE.Vector3(-25, 1.2, 0) },
    { control: 'EYE_RIGHT', anchor: 'world', position: new THREE.Vector3(25, 1.2, 0) },
  ];
}

/**
 * Placed from the canonical aim rather than by hand, so the direction a rider turns to and the
 * direction perception credits can never drift apart.
 */
function shoulderTarget(control: 'SHOULDER_LEFT' | 'SHOULDER_RIGHT'): THREE.Vector3 {
  const bearing = (LOOK_DIRECTIONS[control].yaw * Math.PI) / 180;
  const r = SHOULDER_TARGET_DISTANCE;
  return new THREE.Vector3(-r * Math.sin(bearing), 1, -r * Math.cos(bearing));
}

export interface GazeTargetState {
  control: LookControl;
  /** Screen position in CSS pixels, valid only when `onScreen`. */
  x: number;
  y: number;
  onScreen: boolean;
  /** 0 to 1 while the reticle rests on the dot. */
  dwell: number;
  /** 1 immediately after registering, decaying to 0 as the check goes stale. */
  freshness: number;
  /** True while the reticle is on this dot. */
  under: boolean;
}

interface Target extends GazeTargetState {
  spec: GazeTargetSpec;
  world: THREE.Vector3;
  armed: boolean;
}

const scratch = {
  eye: new THREE.Vector3(),
  forward: new THREE.Vector3(),
  toTarget: new THREE.Vector3(),
  projected: new THREE.Vector3(),
};

export class GazeTargets {
  private readonly targets: Target[];

  constructor(private readonly bike: THREE.Object3D) {
    this.targets = gazeTargetSpecs().map((spec) => ({
      spec,
      control: spec.control,
      world: new THREE.Vector3(),
      x: 0,
      y: 0,
      onScreen: false,
      dwell: 0,
      freshness: 0,
      under: false,
      armed: true,
    }));
  }

  reset() {
    for (const t of this.targets) {
      t.dwell = 0;
      t.freshness = 0;
      t.armed = true;
      t.under = false;
    }
  }

  /**
   * Advance every dot. `register` is called the moment a dwell completes, and is the only way a
   * look ever enters the simulation.
   */
  update(
    dt: number,
    camera: THREE.Camera,
    viewport: { width: number; height: number },
    register: (control: LookControl) => void,
  ) {
    camera.getWorldPosition(scratch.eye);
    camera.getWorldDirection(scratch.forward);

    for (const t of this.targets) {
      if (t.spec.anchor === 'bike') {
        t.world.copy(t.spec.position).applyMatrix4(this.bike.matrixWorld);
      } else {
        t.world.copy(t.spec.position);
      }

      scratch.toTarget.copy(t.world).sub(scratch.eye).normalize();
      const angle = Math.acos(
        Math.max(-1, Math.min(1, scratch.forward.dot(scratch.toTarget))),
      );

      t.under = angle <= REGISTER_HALF_ANGLE;
      if (!t.armed && angle > REGISTER_HALF_ANGLE * RELEASE_FACTOR) t.armed = true;

      if (t.under && t.armed) {
        t.dwell = Math.min(1, t.dwell + dt / DWELL_S);
        if (t.dwell >= 1) {
          t.dwell = 0;
          t.armed = false;
          t.freshness = 1;
          register(t.control);
        }
      } else if (!t.under) {
        t.dwell = Math.max(0, t.dwell - (dt / DWELL_S) * 2);
      }

      t.freshness = Math.max(0, t.freshness - dt / FRESH_S);

      scratch.projected.copy(t.world).project(camera);
      t.onScreen =
        scratch.projected.z < 1 &&
        Math.abs(scratch.projected.x) < 1.05 &&
        Math.abs(scratch.projected.y) < 1.05;
      t.x = (scratch.projected.x * 0.5 + 0.5) * viewport.width;
      t.y = (-scratch.projected.y * 0.5 + 0.5) * viewport.height;
    }
  }

  /**
   * How much a mirror should be in focus, from whether the reticle is on it. Looking clears the
   * glass immediately; registering the check is what the dwell is for.
   */
  focusFor(side: 'left' | 'right', current: number, dt: number): number {
    const control: LookControl = side === 'left' ? 'MIRROR_LEFT' : 'MIRROR_RIGHT';
    const target = this.targets.find((t) => t.control === control);
    const wanted = target?.under ? 1 : 0;
    const rate = wanted > current ? FOCUS_IN_RATE : FOCUS_OUT_RATE;
    return current + (wanted - current) * (1 - Math.exp(-dt * rate));
  }

  states(): readonly GazeTargetState[] {
    return this.targets;
  }
}
