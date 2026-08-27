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
import { createActorMesh, placeActor } from './actors3d';
import { headingToYaw } from './coords';
import { createRider, EYE_HEIGHT, INSTRUMENT_POSITION } from './rider';
import { Instrument } from './instrument';
import { Mirrors } from './mirrors';
import { PALETTE } from '../palette';
import type { HeadPose } from './head';
import type { Scenario, WorldView } from '../sim/types';

export type { HeadPose };

/** Metres above the road. A rider's eyes sit a little over the roof of a hatchback. */
export { EYE_HEIGHT };

/**
 * Vertical field of view. Wide enough that both mirrors fall inside the frame while looking
 * ahead — without that the whole mirror mechanic has nothing to hang on — and no wider, because
 * every extra degree shrinks a junction forty metres off.
 */
const FOV = 55;

/** The mirrors sit about 27° off-axis; keep at least this much horizontal half-angle for them. */
const MIN_HORIZONTAL_HALF_FOV = (30 * Math.PI) / 180;

export class Stage {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  /** Carries the machine's position and heading. */
  readonly bike = new THREE.Group();
  /** Carries where the rider is looking. */
  readonly head = new THREE.Group();

  readonly mirrors: Mirrors;
  readonly instrument: Instrument;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly world: THREE.Group;
  private readonly actors = new Map<string, THREE.Group>();
  private width = 0;

  constructor(canvas: HTMLCanvasElement, scenario: Scenario) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

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
    sun.castShadow = true;
    // One orthographic box over the whole built stretch. At this size a 2048 map is about twelve
    // centimetres per texel, which is plenty for the edge of a terrace.
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -120;
    sun.shadow.camera.right = 120;
    sun.shadow.camera.top = 120;
    sun.shadow.camera.bottom = -120;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 260;
    sun.shadow.bias = -0.0015;
    sun.shadow.normalBias = 0.02;
    // Everything that casts is static, so the map is drawn once and then frozen. Without this it
    // would be redrawn three times a frame — once for the view and once per mirror — for a
    // picture that never changes. The two vehicles keep their painted blob shadows instead.
    sun.shadow.autoUpdate = false;
    sun.shadow.needsUpdate = true;
    this.scene.add(sun);
    this.scene.add(sun.target);
    // A little fill so surfaces facing the rider — the back of the mirrors, their own arms — are
    // shaded rather than silhouetted.
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    this.world = buildWorld(scenario);
    this.scene.add(this.world);

    // A near plane of 5 cm so the rider's own shoulders and tank do not clip away when looked at.
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 400);
    this.head.position.y = EYE_HEIGHT;
    this.head.add(this.camera);
    this.bike.add(this.head);
    // The machine hangs off the bike, not the head: turning to look leaves the bars where they
    // are, which is most of what makes a schouderblik feel like turning round.
    this.bike.add(createRider());
    this.instrument = new Instrument(
      INSTRUMENT_POSITION.clone().add(new THREE.Vector3(0, 0.017, 0.042)),
      scenario.speedLimitKmh,
    );
    this.bike.add(this.instrument.mesh);
    this.mirrors = new Mirrors(this.bike);
    this.scene.add(this.bike);
  }

  resize(cssWidth: number, cssHeight: number) {
    this.width = cssWidth;
    this.renderer.setSize(cssWidth, cssHeight, false);
    const aspect = cssWidth / Math.max(1, cssHeight);
    this.camera.aspect = aspect;
    // Widen the vertical field of view on a narrow window rather than let the mirrors fall off
    // the sides. Losing them would take the whole mirror mechanic with them.
    const neededVertical = 2 * Math.atan(Math.tan(MIN_HORIZONTAL_HALF_FOV) / aspect);
    this.camera.fov = Math.max(FOV, (neededVertical * 180) / Math.PI);
    this.camera.updateProjectionMatrix();
  }

  /** Move the rig and the traffic to match one instant of the world. */
  sync(view: WorldView, head: HeadPose) {
    this.bike.position.set(view.pose.x, 0, -view.pose.y);
    this.bike.rotation.y = headingToYaw(view.pose.heading);
    this.head.rotation.y = head.yaw;
    this.camera.rotation.x = head.pitch;
    this.instrument.update(
      view.speedKmh,
      view.gear,
      view.indicator,
      view.time,
      view.targetSpeedKmh,
    );

    for (const actor of view.actors) {
      let mesh = this.actors.get(actor.spec.id);
      if (!mesh) {
        mesh = createActorMesh(actor.spec.kind);
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
    // Reflections first: they need the scene as it is this frame, and the mirrors hide
    // themselves while rendering so they cannot appear inside one another.
    this.mirrors.render(this.renderer, this.scene, this.camera);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    for (const mesh of this.actors.values()) {
      // Detach as well as free. Leaving them parented left a disposed Stage still holding a scene
      // full of actors whose geometry had been released — which reads, to anything inspecting it,
      // as a live scene that has lost its actor map.
      this.scene.remove(mesh);
      mesh.traverse((n) => {
        if (n instanceof THREE.Mesh) {
          n.geometry.dispose();
          (n.material as THREE.Material).dispose();
        }
      });
    }
    this.actors.clear();
    this.instrument.dispose();
    this.mirrors.dispose();
    disposeWorld(this.world);
    this.renderer.dispose();
  }
}
