/**
 * The first-person stage: renderer, scene, and the camera rig that sits on the rider.
 *
 * The rig is three nested objects — bike, head, camera — so that each rotation means exactly one
 * thing. The bike carries the machine's heading, the head carries where the rider is looking
 * relative to it, and the camera carries nothing at all. A schouderblik is then just a large
 * `head.rotation.y`, and the mirrors can hang off the bike without inheriting the head.
 */
import * as THREE from 'three';
import { buildWorld, disposeWorld } from './buildWorld';
import { createSnorfiets, placeActor } from './actors3d';
import { headingToYaw } from './coords';
import { PALETTE } from '../palette';
import type { Scenario, WorldView } from '../sim/types';

/** Metres above the road. A rider's eyes sit a little over the roof of a hatchback. */
export const EYE_HEIGHT = 1.45;

/** Vertical field of view. Wide enough not to feel like a tunnel, tight enough that a junction
 * forty metres off is still worth looking at. */
const FOV = 50;

export interface HeadPose {
  /** Radians relative to the machine. Positive is left, matching the simulation's bearings. */
  yaw: number;
  /** Radians. Positive is up. */
  pitch: number;
}

export class Stage {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  /** Carries the machine's position and heading. */
  readonly bike = new THREE.Group();
  /** Carries where the rider is looking. */
  readonly head = new THREE.Group();

  private readonly renderer: THREE.WebGLRenderer;
  private readonly world: THREE.Group;
  private readonly actors = new Map<string, THREE.Group>();
  private width = 0;

  constructor(canvas: HTMLCanvasElement, scenario: Scenario) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene.background = new THREE.Color(PALETTE.sky);
    // Fog starts beyond the junction so it never greys out the thing being judged; it exists to
    // hide the edge of the built world, not to shorten the view.
    this.scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 95, 260);

    // Enough sky light that nothing reads as a black void, and enough sun that vertical faces —
    // kerbs, hedges, house walls — separate from the horizontal ones they sit on. Without that
    // directional component every surface facing up is the same tone and the world goes flat.
    this.scene.add(new THREE.HemisphereLight(0xdceaf6, 0x8a9c74, 2.4));
    const sun = new THREE.DirectionalLight(0xfff3e0, 2.2);
    sun.position.set(-40, 60, 30);
    this.scene.add(sun);

    this.world = buildWorld(scenario);
    this.scene.add(this.world);

    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 400);
    this.head.position.y = EYE_HEIGHT;
    this.head.add(this.camera);
    this.bike.add(this.head);
    this.scene.add(this.bike);
  }

  resize(cssWidth: number, cssHeight: number) {
    this.width = cssWidth;
    this.renderer.setSize(cssWidth, cssHeight, false);
    this.camera.aspect = cssWidth / Math.max(1, cssHeight);
    this.camera.updateProjectionMatrix();
  }

  /** Move the rig and the traffic to match one instant of the world. */
  sync(view: WorldView, head: HeadPose) {
    this.bike.position.set(view.pose.x, 0, -view.pose.y);
    this.bike.rotation.y = headingToYaw(view.pose.heading);
    this.head.rotation.y = head.yaw;
    this.camera.rotation.x = head.pitch;

    for (const actor of view.actors) {
      let mesh = this.actors.get(actor.spec.id);
      if (!mesh) {
        mesh = createSnorfiets();
        this.actors.set(actor.spec.id, mesh);
        this.scene.add(mesh);
      }
      // Unlike the plan view there is no perception filter here: in first person you see what is
      // in front of you, and that is the whole point of the exercise.
      placeActor(mesh, actor);
    }
  }

  render() {
    if (this.width === 0) return;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    for (const mesh of this.actors.values()) {
      mesh.traverse((n) => {
        if (n instanceof THREE.Mesh) {
          n.geometry.dispose();
          (n.material as THREE.Material).dispose();
        }
      });
    }
    this.actors.clear();
    disposeWorld(this.world);
    this.renderer.dispose();
  }
}
