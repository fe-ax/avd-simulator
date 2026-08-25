/**
 * The mirrors, as actual mirrors.
 *
 * Each one renders the scene from its own position, looking along the reflection of the line from
 * the rider's eye to the glass. What appears in it is therefore whatever a mirror aimed that way
 * would show, and the dode hoek is not declared anywhere: it is simply the region neither
 * reflection reaches, which is the entire reason a schouderblik exists.
 *
 * Two details that are easy to get wrong and obvious once wrong:
 *
 *   - The image is flipped horizontally. A camera pointed backwards is not a mirror — something
 *     behind your right shoulder lands on the left of a raw rear-facing image and on the right of
 *     a real mirror.
 *   - The field is far wider than a flat mirror of this size would give. Bike mirrors are convex,
 *     which is precisely why they show a useful slice of the road at all, and how convex they are
 *     is what sets the size of the blind spot.
 *
 * Focus is a haze over the glass rather than a blur. Without eye tracking there is no way to know
 * whether the rider is looking at a mirror, so the mirror shows that something is there and
 * withholds what it is until the look is made. A blur would be prettier; haze is unambiguous.
 */
import * as THREE from 'three';
import { EYE_HEIGHT, MIRROR_POSITION, MIRROR_SIZE } from './rider';
import { MIRROR_VIEW } from '../sim/perception';

const TEXTURE_WIDTH = 320;
const TEXTURE_HEIGHT = 216;

/**
 * Vertical field of the reflection. A flat mirror this size would give about 7°; convex glass is
 * what turns that into something a rider can use, and how convex it is sets how big the blind
 * spot ends up being.
 */
const MIRROR_FOV = 40;

/**
 * How far each mirror is angled outward and down, in radians.
 *
 * Outward is zero, which looks wrong and is not. The rider's eye sits inboard of the glass, so a
 * mirror mounted square across the machine already reflects about 26° outboard; splaying it
 * further swings the view off the road entirely. Measured with these values, the mirror covers
 * from just inboard of dead astern out to 54°, which means:
 *
 *   - a snorfiets four to ten metres back on the fietspad is in the mirror
 *   - the same snorfiets two metres back, alongside, is not
 *
 * That second line is the dode hoek. It is not declared anywhere and there is no constant for it;
 * it is simply where this reflection stops reaching.
 */
const SPLAY = 0;

/**
 * How far below level a mirror looks, in degrees. Small: a mirror aimed level shows half sky, and
 * one aimed much further down shows the road immediately behind you rather than the traffic on it.
 */
const MIRROR_PITCH_DEG = -3.3;

/**
 * The tilt of the glass needed to produce that aim, from where the eye actually is.
 *
 * This used to be a constant, and it was a constant that silently depended on eye height: raise
 * the rider ten centimetres and the same piece of glass points six degrees further down, at the
 * tarmac. Since the whole premise here is that what perception credits is what the glass really
 * shows, the tilt has to follow the eye rather than be re-guessed whenever the riding position
 * moves.
 *
 * Working in the vertical plane through the mirror — legitimate because the glass is square
 * across the machine, so the normal has no sideways component and the reflection leaves the
 * lateral part of the ray alone. There a reflection is just an angle: a ray arriving at angle a
 * leaves at 2t + 180° − a for glass tilted by t. Solve that for the tilt that lands the outgoing
 * ray at MIRROR_PITCH_DEG and you get the number below.
 */
function glassTilt(side: MirrorSide): number {
  const at = MIRROR_POSITION[side];
  // Incident ray, eye to glass, as a unit vector; then its part in the vertical plane.
  const incident = at.clone().sub(new THREE.Vector3(0, EYE_HEIGHT, 0)).normalize();
  const vertical = Math.hypot(incident.y, incident.z);
  const arriving = Math.atan2(incident.y, incident.z);
  // The outgoing ray keeps the lateral component, so the vertical plane has to supply all of the
  // wanted rise on its own — hence dividing by how much of the ray lives in that plane.
  const wanted = Math.asin(Math.sin((MIRROR_PITCH_DEG * Math.PI) / 180) / vertical);
  return (wanted + Math.PI + arriving) / 2;
}

const HOUSING_COLOUR = '#33363d';
const HAZE_COLOUR = new THREE.Color('#c2d0dd');
/** Opacity of the haze when the mirror is not being looked at. */
const HAZE_MAX = 0.8;

export type MirrorSide = 'left' | 'right';
export const MIRROR_SIDES: MirrorSide[] = ['left', 'right'];

interface MirrorParts {
  head: THREE.Group;
  glass: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  haze: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  target: THREE.WebGLRenderTarget;
  camera: THREE.PerspectiveCamera;
}

const scratch = {
  glassPos: new THREE.Vector3(),
  normal: new THREE.Vector3(),
  eye: new THREE.Vector3(),
  toGlass: new THREE.Vector3(),
  reflected: new THREE.Vector3(),
  lookAt: new THREE.Vector3(),
};

export class Mirrors {
  private readonly parts: Record<MirrorSide, MirrorParts>;
  private readonly focus: Record<MirrorSide, number> = { left: 0, right: 0 };
  private checked = false;

  constructor(parent: THREE.Object3D) {
    this.parts = {
      left: this.build('left', parent),
      right: this.build('right', parent),
    };
  }

  private build(side: MirrorSide, parent: THREE.Object3D): MirrorParts {
    const sign = side === 'left' ? -1 : 1;
    const at = MIRROR_POSITION[side];

    const target = new THREE.WebGLRenderTarget(TEXTURE_WIDTH, TEXTURE_HEIGHT);
    target.texture.colorSpace = THREE.SRGBColorSpace;
    // The horizontal flip that makes it a mirror rather than a reversing camera.
    target.texture.wrapS = THREE.ClampToEdgeWrapping;
    target.texture.repeat.x = -1;
    target.texture.offset.x = 1;

    // Housing, glass and haze are one rotated head. Built as separate objects each carrying the
    // same rotation, the aimed glass ends up half buried inside its own unrotated housing.
    const head = new THREE.Group();
    head.name = `mirror-${side}`;
    head.position.copy(at);
    head.rotation.set(-glassTilt(side), sign * SPLAY, 0);
    parent.add(head);

    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(MIRROR_SIZE.width + 0.022, MIRROR_SIZE.height + 0.022, 0.028),
      new THREE.MeshLambertMaterial({ color: new THREE.Color(HOUSING_COLOUR) }),
    );
    housing.position.z = -0.016;
    head.add(housing);

    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(MIRROR_SIZE.width, MIRROR_SIZE.height),
      new THREE.MeshBasicMaterial({ map: target.texture, side: THREE.DoubleSide }),
    );
    glass.name = `mirror-${side}-glass`;
    head.add(glass);

    const haze = new THREE.Mesh(
      new THREE.PlaneGeometry(MIRROR_SIZE.width, MIRROR_SIZE.height),
      new THREE.MeshBasicMaterial({
        color: HAZE_COLOUR,
        transparent: true,
        opacity: HAZE_MAX,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    haze.name = `mirror-${side}-haze`;
    haze.position.z = 0.003;
    head.add(haze);

    const camera = new THREE.PerspectiveCamera(
      MIRROR_FOV,
      MIRROR_SIZE.width / MIRROR_SIZE.height,
      0.2,
      300,
    );
    return { head, glass, haze, target, camera };
  }

  /**
   * Render both reflections. Must run before the main pass, and with the mirrors themselves
   * hidden so they cannot appear inside each other.
   */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, eyeCamera: THREE.Camera) {
    eyeCamera.getWorldPosition(scratch.eye);

    for (const side of MIRROR_SIDES) this.parts[side].head.visible = false;

    for (const side of MIRROR_SIDES) {
      const { glass, target, camera } = this.parts[side];
      glass.getWorldPosition(scratch.glassPos);
      glass.getWorldDirection(scratch.normal);

      // Reflect the eye-to-glass direction about the glass normal, and look along it.
      scratch.toGlass.copy(scratch.glassPos).sub(scratch.eye).normalize();
      scratch.reflected
        .copy(scratch.toGlass)
        .addScaledVector(scratch.normal, -2 * scratch.toGlass.dot(scratch.normal));

      camera.position.copy(scratch.glassPos);
      camera.lookAt(scratch.lookAt.copy(scratch.glassPos).add(scratch.reflected));
      camera.updateMatrixWorld();

      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
    }

    renderer.setRenderTarget(null);
    if (import.meta.env.DEV && !this.checked) {
      this.checked = true;
      this.warnIfModelDrifted();
    }

    for (const side of MIRROR_SIDES) this.parts[side].head.visible = true;
  }

  /**
   * Perception is computed in the simulation from `MIRROR_VIEW`, which is a description of *this*
   * geometry. Nothing enforces that at compile time, so say so loudly if the two ever part company
   * — a mirror that shows more than perception credits would quietly make the dode hoek a lie.
   */
  private warnIfModelDrifted() {
    const camera = this.parts.right.camera;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const aim = Math.abs((Math.atan2(dir.x, dir.z) * 180) / Math.PI);
    const half =
      (Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect) * 180) / Math.PI;

    // Pitch too. Perception does not model elevation, so a mirror quietly aimed at the tarmac
    // would credit the rider with seeing traffic that is not in the glass at all.
    const pitch = (Math.asin(dir.y) * 180) / Math.PI;

    const aimOff = Math.abs(aim - MIRROR_VIEW.aimOutOfAsternDeg);
    const halfOff = Math.abs(half - MIRROR_VIEW.halfAngleDeg);
    const pitchOff = Math.abs(pitch - MIRROR_VIEW.pitchDeg);
    if (aimOff <= 2 && halfOff <= 2 && pitchOff <= 2) return;
    console.warn(
      `[mirrors] rendered geometry has drifted from the perception model: aim ${aim.toFixed(1)}° ` +
        `vs ${MIRROR_VIEW.aimOutOfAsternDeg}°, half-field ${half.toFixed(1)}° vs ` +
        `${MIRROR_VIEW.halfAngleDeg}°, pitch ${pitch.toFixed(1)}° vs ${MIRROR_VIEW.pitchDeg}°. ` +
        `Update MIRROR_VIEW in sim/perception.ts.`,
    );
  }

  /** `amount` is 0 when the rider is looking elsewhere and 1 while the mirror is being read. */
  setFocus(side: MirrorSide, amount: number) {
    this.focus[side] = Math.max(0, Math.min(1, amount));
    this.parts[side].haze.material.opacity = HAZE_MAX * (1 - this.focus[side]);
  }

  getFocus(side: MirrorSide): number {
    return this.focus[side];
  }

  glass(side: MirrorSide): THREE.Object3D {
    return this.parts[side].glass;
  }

  /** The camera a mirror sees through, for working out what it can actually reach. */
  camera(side: MirrorSide): THREE.PerspectiveCamera {
    return this.parts[side].camera;
  }

  dispose() {
    for (const side of MIRROR_SIDES) {
      const { glass, haze, target } = this.parts[side];
      glass.geometry.dispose();
      glass.material.dispose();
      haze.geometry.dispose();
      haze.material.dispose();
      target.dispose();
    }
  }
}
