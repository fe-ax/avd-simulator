/**
 * The other road users, as simple upright blocks. Deliberately plain: what has to read at a
 * glance is where a vehicle is and which way it faces, not what model it is.
 */
import * as THREE from 'three';
import { headingToYaw } from './coords';
import type { ActorState } from '../sim/types';

const SNORFIETS = {
  deck: '#d8d4cc',
  rider: '#2c3140',
  helmet: '#f0ede6',
  /** The blue plate is the detail that says "snorfiets, 25 km/u, hoort op het fietspad". */
  plate: '#1f5fbf',
  brakeLight: '#ff3b30',
};

function box(w: number, h: number, d: number, colour: string): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(colour) }),
  );
}

/** Modelled facing −z, so `headingToYaw` orients it without further correction. */
export function createSnorfiets(): THREE.Group {
  const group = new THREE.Group();

  const deck = box(0.42, 0.5, 1.5, SNORFIETS.deck);
  deck.position.y = 0.55;
  group.add(deck);

  const front = box(0.36, 0.75, 0.24, SNORFIETS.deck);
  front.position.set(0, 0.95, -0.62);
  group.add(front);

  const rider = box(0.5, 0.72, 0.34, SNORFIETS.rider);
  rider.position.set(0, 1.2, 0.06);
  group.add(rider);

  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 12, 8),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(SNORFIETS.helmet) }),
  );
  helmet.position.set(0, 1.66, 0.02);
  group.add(helmet);

  const plate = box(0.16, 0.13, 0.03, SNORFIETS.plate);
  plate.position.set(0, 0.6, 0.76);
  group.add(plate);

  const brake = box(0.1, 0.07, 0.03, SNORFIETS.brakeLight);
  brake.position.set(0, 0.78, 0.76);
  brake.name = 'brake';
  brake.visible = false;
  group.add(brake);

  // A flat blob rather than a real shadow: cheap, and it grounds the vehicle just as well.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.75, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  shadow.scale.set(0.7, 1.5, 1);
  group.add(shadow);

  return group;
}

export function placeActor(group: THREE.Group, actor: ActorState) {
  group.position.set(actor.x, 0, -actor.y);
  group.rotation.y = headingToYaw(actor.heading);
  const brake = group.getObjectByName('brake');
  if (brake) brake.visible = actor.mode === 'braking' || actor.mode === 'stopped';
}
