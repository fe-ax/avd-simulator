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
  bodywork: '#3d7cc4',
  jacket: '#3a3f4c',
  glove: '#54596a',
  mirrorBack: '#33363d',
  mirrorGlass: '#9dbfdd',
};

/**
 * Where each mirror's glass sits, in bike-local metres.
 *
 * Placed so that both mirrors fall just inside the frame while looking straight ahead — about 28°
 * out and 18° down from the eye. That peripheral position is the whole premise: you can see that
 * something is there without being able to read it, which is what makes looking an action.
 */
export const MIRROR_POSITION = {
  left: new THREE.Vector3(-0.36, 1.2, -0.72),
  right: new THREE.Vector3(0.36, 1.2, -0.72),
};

/** Glass size in metres. Small, like the real thing. */
export const MIRROR_SIZE = { width: 0.14, height: 0.095 };

function box(w: number, h: number, d: number, colour: string): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(colour) }),
  );
}

function mirror(side: 'left' | 'right'): THREE.Group {
  const group = new THREE.Group();
  const sign = side === 'left' ? -1 : 1;
  const at = MIRROR_POSITION[side];

  const stalk = box(0.025, 0.2, 0.025, RIDER.frame);
  stalk.position.set(at.x - sign * 0.03, at.y - 0.13, at.z + 0.02);
  group.add(stalk);

  const housing = box(MIRROR_SIZE.width + 0.022, MIRROR_SIZE.height + 0.022, 0.025, RIDER.mirrorBack);
  housing.position.copy(at);
  group.add(housing);

  // The glass is a separate plane so a mirror camera can render straight onto it. Angled outward
  // and slightly down, the way a rider actually sets a mirror.
  // Double-sided so the glass can never be hidden by getting its facing wrong, and unlit,
  // because in a moment it will be showing a rendered reflection rather than a surface.
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(MIRROR_SIZE.width, MIRROR_SIZE.height),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(RIDER.mirrorGlass),
      side: THREE.DoubleSide,
    }),
  );
  glass.name = `mirror-${side}-glass`;
  glass.position.copy(at);
  glass.position.z += 0.02;
  // Angled outward and slightly down, the way a rider actually sets a mirror.
  glass.rotation.set(-0.12, sign * 0.24, 0);
  group.add(glass);

  return group;
}

export function createRider(): THREE.Group {
  const rider = new THREE.Group();
  rider.name = 'rider';

  // Handlebars and the top of the machine, all ahead and below the eye.
  const bar = box(0.72, 0.032, 0.032, RIDER.frame);
  bar.position.set(0, 1.11, -0.72);
  rider.add(bar);

  const tank = box(0.32, 0.22, 0.55, RIDER.bodywork);
  tank.position.set(0, 0.93, -0.46);
  rider.add(tank);

  const cowl = box(0.24, 0.12, 0.09, RIDER.frame);
  cowl.position.set(0, 1.15, -0.82);
  rider.add(cowl);

  for (const sign of [-1, 1]) {
    const glove = box(0.09, 0.07, 0.13, RIDER.glove);
    glove.position.set(sign * 0.31, 1.11, -0.7);
    rider.add(glove);

    const arm = box(0.1, 0.1, 0.46, RIDER.jacket);
    arm.position.set(sign * 0.27, 1.17, -0.42);
    arm.rotation.x = 0.28;
    rider.add(arm);

    // Your own shoulder, so a schouderblik has something to look past rather than into a void.
    const shoulder = box(0.17, 0.2, 0.2, RIDER.jacket);
    shoulder.position.set(sign * 0.24, 1.24, -0.04);
    rider.add(shoulder);

    rider.add(mirror(sign < 0 ? 'left' : 'right'));
  }

  const back = box(0.42, 0.34, 0.2, RIDER.jacket);
  back.position.set(0, 1.16, 0.11);
  rider.add(back);

  return rider;
}
