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
import { SkyRig, type Conditions } from './sky';
import { Composer } from './composer';
import { setWetness } from './materials';
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
  private readonly sky: SkyRig;
  private composer: Composer | null = null;
  private width = 0;
  private conditions: Conditions = 'helder';

  constructor(canvas: HTMLCanvasElement, scenario: Scenario) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Filmic rather than clipped. With physical light values a plain clamp blows the sky to white
    // and crushes everything in shadow to one flat dark; this is what keeps a kerb readable in the
    // shade of a terrace and the sky still a sky above it.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    // The sky is a real sky and the sun stands where it says it does. Both come out of one place
    // so they cannot disagree — see `sky.ts`, which also explains why weather never shortens the
    // view.
    this.sky = new SkyRig(this.scene, this.renderer);
    this.renderer.toneMappingExposure = this.sky.apply(this.conditions);
    // Everything that casts is static, so the map is drawn once and then frozen. Without this it
    // would be redrawn three times a frame — once for the view and once per mirror — for a
    // picture that never changes. The two vehicles keep their painted blob shadows instead.
    this.sky.sun.shadow.autoUpdate = false;

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

  /** Light and surface only. Never sight distance — `sky.ts` says why at length. */
  setConditions(conditions: Conditions) {
    if (conditions === this.conditions) return;
    this.conditions = conditions;
    this.renderer.toneMappingExposure = this.sky.apply(conditions);
    setWetness(this.world, this.sky.wetness);
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

    // The composer owns its own targets, so it is built once the canvas has a real size and
    // resized with it rather than rebuilt.
    if (!this.composer) {
      this.composer = new Composer(this.renderer, this.scene, this.camera, cssWidth, cssHeight);
    }
    this.composer.setSize(cssWidth, cssHeight);
  }

  /** Move the rig and the traffic to match one instant of the world. */
  sync(view: WorldView, head: HeadPose) {
    this.bike.position.set(view.pose.x, 0, -view.pose.y);
    // Carry the shadow box along with the machine, so the map is spent where the rider is looking
    // rather than on a fixed square at the world origin.
    this.sky.follow(this.bike.position.x, this.bike.position.z);
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
    //
    // They go straight to their own targets rather than through the composer — 200 px of glass
    // does not repay antialiasing, and running the chain three times a frame would make the
    // mirrors the most expensive thing on screen.
    this.mirrors.render(this.renderer, this.scene, this.camera);
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
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
    this.composer?.dispose();
    this.sky.dispose();
    disposeWorld(this.world);
    this.renderer.dispose();
  }
}
