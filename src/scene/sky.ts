/**
 * The sky, the sun, and the fact that they have to agree.
 *
 * A painted blue background and a directional light pointing wherever looked fine while nothing
 * else was physical. Once surfaces respond to light properly, a sun in one place and a bright patch
 * of sky in another is the first thing that reads as wrong — so both come from one elevation and
 * azimuth here, and neither is set anywhere else.
 *
 * **Conditions change the light, never the sight distance.** That is not a style choice: perception
 * is angular and knows nothing about weather, so haze that genuinely hid a lorry would credit the
 * rider with seeing something the screen does not show. It is the same trap the terraces sprang on
 * *Auto van rechts remt*, in a form nobody would question because weather is supposed to hide
 * things. Fog stays where it was — far enough out to hide the edge of the built world and no
 * nearer — and only its colour follows the sky.
 */
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

export type Conditions = 'helder' | 'bewolkt' | 'lage-zon' | 'nat';

export const CONDITION_LABELS: Record<Conditions, string> = {
  helder: 'Helder',
  bewolkt: 'Bewolkt',
  'lage-zon': 'Lage zon',
  nat: 'Nat wegdek',
};

interface Weather {
  /** Degrees above the horizon. Low sun is a real exam hazard and a real lighting problem. */
  elevation: number;
  azimuth: number;
  /** Sky haze. Raises ambient and softens the sun without moving the fog. */
  turbidity: number;
  /**
   * Blue scattering — and it runs the opposite way to intuition here.
   *
   * Raising it makes the sky *whiter*, not bluer: more scattering means a brighter sky, and ACES
   * desaturates as it approaches white. These were swept against the zenith's own colour, and a
   * clear day landed at 0,7 — around #6da6dc overhead fading to #abd2ed at the horizon, which is
   * what a clear Dutch sky actually measures.
   */
  rayleigh: number;
  sunColour: number;
  sunIntensity: number;
  skyLight: number;
  ambient: number;
  /** How wet the road reads: drives roughness on the tarmac, nothing else. */
  wetness: number;
  exposure: number;
  /**
   * How strongly the baked sky lights everything, and the exposure it is viewed at.
   *
   * Both are low because a physical sky is *bright* — its radiance is nothing like the painted blue
   * it replaced, and at an exposure of 1 the whole street washes to white. These were found by
   * sweeping exposure against the tarmac's own luminance until asphalt read as asphalt rather than
   * as paper, which is the only reading in the frame with a right answer.
   */
  envIntensity: number;
}

/**
 * Four conditions, as light rather than as visibility.
 *
 * The numbers are picked to keep the *road* readable in all four — a dark scene is atmospheric and
 * useless for spotting a snorfiets, and the exercise is spotting the snorfiets.
 */
export const WEATHER: Record<Conditions, Weather> = {
  helder: {
    elevation: 42, azimuth: 150, turbidity: 3.2, rayleigh: 0.70,
    sunColour: 0xfff4e2, sunIntensity: 4.4, skyLight: 0.5, ambient: 0.12,
    envIntensity: 0.60, wetness: 0, exposure: 0.62,
  },
  bewolkt: {
    // The sun is still there and still casts, just weakly: a shadowless world looks like a model.
    elevation: 55, azimuth: 150, turbidity: 13, rayleigh: 0.30,
    sunColour: 0xdfe6ee, sunIntensity: 1.5, skyLight: 0.9, ambient: 0.25,
    envIntensity: 0.85, wetness: 0.15, exposure: 0.70,
  },
  'lage-zon': {
    elevation: 9, azimuth: 168, turbidity: 4.6, rayleigh: 0.85,
    sunColour: 0xffd9a0, sunIntensity: 4.8, skyLight: 0.45, ambient: 0.16,
    envIntensity: 0.50, wetness: 0, exposure: 0.58,
  },
  nat: {
    elevation: 30, azimuth: 150, turbidity: 7, rayleigh: 0.50,
    sunColour: 0xeef1f6, sunIntensity: 2.2, skyLight: 0.8, ambient: 0.2,
    envIntensity: 0.75, wetness: 1, exposure: 0.66,
  },
};

/**
 * Where the fog begins, and why it begins *there*.
 *
 * It used to start at 95 m while `FORWARD_VIEW.maxDist` is 130 — so for thirty-five metres the model
 * credited the rider with seeing traffic the screen was busy fogging away. That is the same
 * divergence the terraces caused on *Auto van rechts remt*, arrived at from the other direction and
 * never noticed, because haze looks like weather rather than like a bug.
 *
 * Fog now begins past the far edge of what perception will credit, so nothing the model believes
 * you can see is hidden from you. It still exists for its original job — dissolving the edge of the
 * built world instead of letting it end — which happens well beyond anything scored.
 */
const FOG = { near: 136, far: 320 };

/** Comfortably inside the camera's 400 m far plane; see the note where it is used. */
const SKY_SCALE = 600;

/** Half-width of the shadow box, in metres, and how far up the sun sits from its centre. */
const SHADOW_BOX = 90;
const SUN_DISTANCE = 220;

/**
 * How far the rider may move before the shadow map is redrawn.
 *
 * The map is frozen rather than redrawn every frame — the scene casting it is static, and redrawing
 * would cost three passes a frame for a picture that does not change. But a frozen map has to be
 * re-taken when the box it was taken in has moved out from under the rider. Twenty metres is about
 * a fifth of the box: often enough that the edge never comes into view, rarely enough that it is a
 * handful of redraws across a whole ride.
 */
const SHADOW_STEP = 20;

const scratchCentre = new THREE.Vector3();

export class SkyRig {
  readonly sun = new THREE.DirectionalLight(0xffffff, 1);
  readonly sky = new Sky();
  private readonly hemi = new THREE.HemisphereLight(0xdceaf6, 0x8a9c74, 1);
  private readonly ambient = new THREE.AmbientLight(0xffffff, 0.4);
  private readonly fog = new THREE.Fog(0xffffff, FOG.near, FOG.far);
  private readonly pmrem: THREE.PMREMGenerator;
  private readonly scene: THREE.Scene;
  private environment: THREE.Texture | null = null;
  private readonly sunDirection = new THREE.Vector3(0, 1, 0);
  private readonly shadowCentre = new THREE.Vector3(Infinity, 0, Infinity);
  /** Read by the materials that care — the tarmac, and nothing else. */
  wetness = 0;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.scene = scene;
    this.pmrem = new THREE.PMREMGenerator(renderer);

    // Small enough to sit inside the camera's 400 m far plane, and drawn as a pure backdrop.
    //
    // `Sky` is a unit box, and the example scales it to six thousand against a camera that can see
    // that far. Here the far plane is 400 because the world is a street, so a sky at six thousand
    // is clipped away in its entirety and the window behind the houses is black. Depth-testing off
    // and a render order of −1 make it a background rather than a very large object: everything
    // draws over it whatever the distances say.
    this.sky.scale.setScalar(SKY_SCALE);
    this.sky.material.depthTest = false;
    this.sky.material.depthWrite = false;
    this.sky.renderOrder = -1;
    scene.add(this.sky);
    scene.add(this.hemi);
    scene.add(this.ambient);

    this.sun.castShadow = true;
    // A box around the rider rather than around the world.
    //
    // It used to be a fixed ±120 m at the origin, which is a reasonable frame for a crossroads and
    // no frame at all for a motorway: the A12 rides from −620 to +300, so nearly every metre of it
    // fell outside the shadow map and cast nothing. Following the machine means the texels are
    // spent where the rider is looking, and a smaller box spends them harder — 90 m across a 4096
    // map is two centimetres per texel, enough for the edge of a kerb.
    this.sun.shadow.mapSize.set(4096, 4096);
    const cam = this.sun.shadow.camera;
    cam.left = -SHADOW_BOX; cam.right = SHADOW_BOX; cam.top = SHADOW_BOX; cam.bottom = -SHADOW_BOX;
    cam.near = 1; cam.far = SUN_DISTANCE * 2;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    scene.add(this.sun);
    scene.add(this.sun.target);

    scene.fog = this.fog;
  }

  /**
   * Point everything at one sun.
   *
   * Returns the exposure the renderer should use, because that is part of the same decision: a low
   * sun with the same exposure as noon is a photograph taken wrong, not an evening.
   */
  apply(conditions: Conditions): number {
    const w = WEATHER[conditions];
    const phi = THREE.MathUtils.degToRad(90 - w.elevation);
    const theta = THREE.MathUtils.degToRad(w.azimuth);
    const direction = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);

    const u = this.sky.material.uniforms;
    u.turbidity.value = w.turbidity;
    u.rayleigh.value = w.rayleigh;
    u.mieCoefficient.value = 0.005;
    u.mieDirectionalG.value = 0.8;
    u.sunPosition.value.copy(direction);

    // The light sits where the sky says the sun is, so shadows fall the way the picture implies.
    this.sunDirection.copy(direction);
    this.sun.position.copy(this.sun.target.position).addScaledVector(direction, SUN_DISTANCE);
    this.sun.color.setHex(w.sunColour);
    this.sun.intensity = w.sunIntensity;
    this.sun.shadow.needsUpdate = true;

    this.hemi.intensity = w.skyLight;
    this.ambient.intensity = w.ambient;
    this.wetness = w.wetness;

    // Fog takes the sky's colour near the horizon so the far edge dissolves instead of ending. Its
    // *distance* never moves — see the note at the top of this file.
    this.fog.color.copy(horizonColour(w));

    // Bake the sky into an environment map, so every standard material is lit by the sky it is
    // standing under rather than by a flat ambient guess. This is most of what makes wet tarmac
    // look wet and a car roof look like a car roof — and it costs one render here, not one a frame.
    this.environment?.dispose();
    this.environment = this.pmrem.fromScene(this.sky as unknown as THREE.Scene, 0, 1, 1000).texture;
    this.scene.environment = this.environment;
    this.scene.environmentIntensity = w.envIntensity;

    return w.exposure;
  }

  /**
   * Keep the shadow box over the rider.
   *
   * Called every frame and does nothing almost every time: the map is only re-taken once the
   * machine has left the middle of the box by `SHADOW_STEP`, so a whole ride costs a few redraws
   * rather than three a frame.
   */
  follow(x: number, z: number) {
    if (this.shadowCentre.distanceTo(scratchCentre.set(x, 0, z)) < SHADOW_STEP) return;
    this.shadowCentre.copy(scratchCentre);
    this.sun.target.position.copy(this.shadowCentre);
    this.sun.target.updateMatrixWorld();
    this.sun.position.copy(this.shadowCentre).addScaledVector(this.sunDirection, SUN_DISTANCE);
    this.sun.shadow.needsUpdate = true;
  }

  dispose() {
    this.environment?.dispose();
    this.pmrem.dispose();
    this.sky.geometry.dispose();
    (this.sky.material as THREE.Material).dispose();
  }
}

/**
 * Roughly what the sky looks like at the horizon under these conditions.
 *
 * Approximated rather than sampled: reading the real value back means rendering the sky to a target
 * and pulling a pixel, which is three frames of work to pick a fog colour nobody can name. What
 * matters is that it tracks — pale and flat when overcast, warm when the sun is low.
 */
function horizonColour(w: Weather): THREE.Color {
  const warm = new THREE.Color(0xd9c3a4);
  const pale = new THREE.Color(0xc6d2dd);
  const blue = new THREE.Color(0xa8c4dd);
  const lowness = THREE.MathUtils.clamp(1 - w.elevation / 35, 0, 1);
  const overcast = THREE.MathUtils.clamp((w.turbidity - 3) / 7, 0, 1);
  return blue.clone().lerp(pale, overcast).lerp(warm, lowness * 0.7);
}
