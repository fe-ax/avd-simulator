/**
 * The rider's own machine and body, seen from the saddle.
 *
 * All of it hangs off the bike, never the head, so turning to look over your shoulder swings the
 * view while the handlebars stay where they are. That fixed frame is most of what makes a
 * shoulder check feel like turning round rather than like the world sliding past.
 *
 * Bike-local axes: −z forward, +x right, +y up.
 */
import * as THREE from 'three';

const RIDER = {
  frame: '#4a4d55',
  bodywork: '#3c4a5e',
  jacket: '#3a3f4c',
  glove: '#54596a',
  mirrorBack: '#33363d',
};

/**
 * Where each mirror's glass sits, in bike-local metres.
 *
 * On a stalk above the bars, not level with them. Placed level, the rider's own forearm runs
 * straight along the line from the eye to the glass and blocks most of it — which is exactly
 * why mirror stalks are as tall as they are.
 *
 * Placed so that both mirrors fall just inside the frame while looking straight ahead — about 28°
 * out and 18° down from the eye. That peripheral position is the whole premise: you can see that
 * something is there without being able to read it, which is what makes looking an action.
 */
export const MIRROR_POSITION = {
  left: new THREE.Vector3(-0.36, 1.27, -0.72),
  right: new THREE.Vector3(0.36, 1.27, -0.72),
};

/** Where the instrument binnacle sits, in bike-local metres: ahead and below the eye, so reading
 * it means dropping your eyes off the road. */
export const INSTRUMENT_POSITION = new THREE.Vector3(0, 1.2, -0.8);

/**
 * Eye height above the road, in metres. Lives here with the rest of the riding position rather
 * than with the renderer, because the mirrors are aimed off it: where the eye is decides what a
 * flat piece of glass in front of it reflects.
 */
export const EYE_HEIGHT = 1.55;

/** Glass size in metres. Small, like the real thing. */
export const MIRROR_SIZE = { width: 0.14, height: 0.095 };

/**
 * The cockpit's own surfaces.
 *
 * This is the one part of the scene that is always on screen and always close, so it is the part
 * where flat shading shows most. Painted bodywork and mirror shells take a sheen; the jacket and
 * gloves are cloth and leather and take none. Metalness stays low throughout — bike bodywork is
 * paint over metal, and a high value turns the tank into a mirror of the sky.
 */
const CLOTH = new Set([RIDER.jacket, RIDER.glove]);
const cockpitMaterials = new Map<string, THREE.MeshStandardMaterial>();

function cockpitMaterial(colour: string): THREE.MeshStandardMaterial {
  const hit = cockpitMaterials.get(colour);
  if (hit) return hit;
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(colour),
    roughness: CLOTH.has(colour) ? 0.92 : 0.42,
    metalness: CLOTH.has(colour) ? 0 : 0.2,
  });
  cockpitMaterials.set(colour, material);
  return material;
}

function box(w: number, h: number, d: number, colour: string): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cockpitMaterial(colour));
}

function mirror(side: 'left' | 'right'): THREE.Group {
  const group = new THREE.Group();
  const sign = side === 'left' ? -1 : 1;
  const at = MIRROR_POSITION[side];

  const stalk = box(0.025, 0.24, 0.025, RIDER.frame);
  stalk.position.set(at.x - sign * 0.03, at.y - 0.15, at.z + 0.02);
  group.add(stalk);

  // The mirror head itself — housing, glass and haze — belongs to the mirror module, which needs
  // them to share one rotation. This is only the stalk that holds it up.
  return group;
}

export function createRider(): THREE.Group {
  const rider = new THREE.Group();
  rider.name = 'rider';

  // Handlebars and the top of the machine, all ahead and below the eye.
  const bar = box(0.72, 0.032, 0.032, RIDER.frame);
  bar.position.set(0, 1.06, -0.72);
  rider.add(bar);

  const tank = box(0.32, 0.22, 0.55, RIDER.bodywork);
  tank.position.set(0, 0.93, -0.46);
  rider.add(tank);

  // A bezel for the instrument rather than a blank block; the display itself is added by Stage.
  const cowl = box(0.28, 0.155, 0.07, RIDER.frame);
  cowl.position.copy(INSTRUMENT_POSITION);
  cowl.rotation.x = -0.45;
  rider.add(cowl);

  for (const sign of [-1, 1]) {
    const glove = box(0.09, 0.07, 0.13, RIDER.glove);
    glove.position.set(sign * 0.31, 1.06, -0.7);
    rider.add(glove);

    const arm = box(0.1, 0.1, 0.46, RIDER.jacket);
    arm.position.set(sign * 0.27, 1.12, -0.42);
    arm.rotation.x = 0.28;
    rider.add(arm);

    // Your own shoulder, so a schouderblik has something to look past rather than into a void.
    const shoulder = box(0.17, 0.2, 0.2, RIDER.jacket);
    shoulder.position.set(sign * 0.24, 1.22, -0.04);
    rider.add(shoulder);

    rider.add(mirror(sign < 0 ? 'left' : 'right'));
  }

  const back = box(0.42, 0.34, 0.2, RIDER.jacket);
  back.position.set(0, 1.16, 0.11);
  rider.add(back);

  return rider;
}
