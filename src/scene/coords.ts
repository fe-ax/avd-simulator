/**
 * Between the simulation's world and three.js.
 *
 * The simulation is a plan view: x east, y north, heading in radians with 0 = east. three.js is
 * y-up, so the ground is the xz plane and north has to go somewhere. It goes to −z, which is the
 * direction a default camera already looks, so "forward" needs no correction anywhere else.
 *
 *     sim (x, y)  ->  three (x, height, −y)
 *
 * A mesh modelled facing −z then needs `rotation.y = heading − π/2`: at heading π/2 (north) that
 * is zero, and at heading 0 (east) it is −π/2, which swings it to +x.
 */
import * as THREE from 'three';
import type { Vec2 } from '../sim/types';

export function toScene(p: Vec2, height = 0): THREE.Vector3 {
  return new THREE.Vector3(p.x, height, -p.y);
}

export function headingToYaw(heading: number): number {
  return heading - Math.PI / 2;
}

/** Unit vector in the scene pointing along a simulation heading. */
export function headingToDirection(heading: number): THREE.Vector3 {
  return new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
}
