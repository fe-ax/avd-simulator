/**
 * The static world: everything that never moves, built once from the scenario.
 *
 * Geometry comes from `roadSurfaces`, the same definition the top-down view fills, so the two can
 * never disagree about where a marking is. What this file adds is the third dimension — kerbs
 * stand slightly proud, hedges and houses extrude upward, and flat markings are lifted onto their
 * own layer so they do not fight with the asphalt for the same depth values.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE } from '../palette';
import {
  roadSurfaces,
  type Facing,
  type RoadExtent,
  type Surface,
  type SurfaceKind,
} from '../sim/roadSurfaces';
import type { Scenario } from '../sim/types';

/**
 * How far the built world extends. Generous enough that the rider never sees an edge, and fixed,
 * because all of this is created once and never rebuilt.
 */
const EXTENT: RoadExtent = { minX: -85, maxX: 95, minY: -150, maxY: 65 };

/**
 * Height of each flat surface above the ground, in metres. Ordering matters more than the
 * absolute values: coplanar polygons at exactly the same height flicker as the camera moves.
 */
const LAYER: Record<SurfaceKind, number> = {
  asphalt: 0.01,
  // The fietspad sits flush with the top of the kerb rather than down at road level, which is how
  // a vrijliggend fietspad actually runs and what gives the kerb a face to show.
  fietspad: 0.12,
  fietspadEdge: 0.13,
  kerb: 0,
  paint: 0.02,
  roof: 0, // drawn only in plan view; the extruded footprint says it better here
  hedge: 0,
  house: 0,
  lamp: 0,
  guardrail: 0,
  hectometerPost: 0,
  tree: 0,
};

/**
 * The frontage: a door and some windows on the side that faces the road.
 *
 * Blank extruded blocks read as scenery you are passing rather than as houses people live in, and
 * from the saddle the front of a terrace is most of what tells you how fast you are going and
 * where the built-up stretch ends. Everything sits a couple of centimetres proud of the wall so it
 * cannot z-fight with it.
 */
const FRONTAGE = {
  /**
   * How far a panel stands off the wall. Frames and the glass they hold sit at *different*
   * depths: coplanar, they fight for the same depth values and the window comes out striped.
   */
  framProud: 0.03,
  paneProud: 0.055,
  doorWidth: 0.95,
  doorHeight: 2.1,
  windowWidth: 1.25,
  windowHeight: 1.15,
  groundSill: 0.95,
  upperSill: 3.5,
  colours: { door: '#5b4634', glass: '#2f3b47', frame: '#e6e2d8' },
};

/** Wall height is in roadSurfaces; this is what the roof adds on top of it, plus its overhang. */
const ROOF_RISE = 1.9;
const EAVES = 0.3;
const ROOF_COLOUR = '#7d5a4a';

const MATERIALS: Record<string, THREE.Material> = {};
const detailMaterials: Record<string, THREE.MeshLambertMaterial> = {};

function detailMaterial(colour: string, doubleSided = false): THREE.MeshLambertMaterial {
  if (!detailMaterials[colour]) {
    detailMaterials[colour] = new THREE.MeshLambertMaterial({
      color: new THREE.Color(colour),
      // Roof slopes are built by hand and their winding is not worth policing; three.js flips the
      // normal for a back face, so the shading comes out right either way.
      side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    });
  }
  return detailMaterials[colour];
}

function material(key: string, colour: string): THREE.Material {
  if (!MATERIALS[key]) {
    MATERIALS[key] = new THREE.MeshLambertMaterial({ color: new THREE.Color(colour) });
  }
  return MATERIALS[key];
}

/** A world-space polygon as a three.js shape on the xz plane. */
function toShape(surface: Surface): THREE.Shape {
  const shape = new THREE.Shape();
  surface.points.forEach((p, i) => {
    if (i === 0) shape.moveTo(p.x, p.y);
    else shape.lineTo(p.x, p.y);
  });
  shape.closePath();
  return shape;
}

/**
 * A flat surface lying on the ground. `ShapeGeometry` builds in the xy plane, so it is rotated
 * onto xz and flipped, which is the same `y -> -z` mapping used everywhere else.
 */
function flatGeometry(surface: Surface, height: number): THREE.BufferGeometry {
  const geometry = new THREE.ShapeGeometry(toShape(surface));
  geometry.rotateX(Math.PI / 2);
  geometry.scale(1, 1, -1);
  geometry.translate(0, height, 0);
  return geometry;
}

/**
 * An upright block standing on its footprint.
 *
 * `ExtrudeGeometry` builds in the xy plane and grows along +z, so one rotation about x lays the
 * footprint flat *and* stands the extrusion up — and it already lands world y on scene −z, which
 * is the mapping everything else uses. An extra mirror here is not a correction: it flips the
 * buildings to the wrong side of the world and turns every face inside out. It went unnoticed for
 * a while because a repeating terrace looks much the same mirrored — until roofs, built with the
 * correct mapping, started landing on the wrong houses.
 */
function extrudedGeometry(surface: Surface): THREE.BufferGeometry {
  const geometry = new THREE.ExtrudeGeometry(toShape(surface), {
    depth: surface.height,
    bevelEnabled: false,
  });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/**
 * A street light, from the small square footprint that stands for it.
 *
 * The footprint carries only where the post is and how tall; the arm and the head are built here
 * because a bent tube is not a polygon anyone wants in the shared road data. The arm reaches
 * toward the junction centre, which is where a real one reaches: out over the road it lights.
 */
function lampGeometry(surface: Surface): THREE.BufferGeometry[] {
  const xs = surface.points.map((p) => p.x);
  const ys = surface.points.map((p) => p.y);
  const x = (Math.min(...xs) + Math.max(...xs)) / 2;
  const y = (Math.min(...ys) + Math.max(...ys)) / 2;
  const radius = (Math.max(...xs) - Math.min(...xs)) / 2;
  const top = surface.height;

  // Toward the junction, whichever corner this is.
  const len = Math.hypot(x, y) || 1;
  const dx = -x / len;
  const dz = y / len; // world +y is scene −z, so the sign flips once here and nowhere else
  const reach = 1.7;

  const post = new THREE.CylinderGeometry(radius * 0.8, radius, top, 8);
  post.translate(x, top / 2, -y);

  // One segment from the top of the post out to the head, lifted as it goes. Built along +y and
  // swung onto the arm direction, rather than composed out of two Euler angles that have to be
  // reasoned about.
  const rise = 0.35;
  const along = new THREE.Vector3(dx * reach, rise, dz * reach);
  const armLength = along.length();
  const arm = new THREE.CylinderGeometry(radius * 0.55, radius * 0.7, armLength, 6);
  arm.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), along.clone().normalize()),
  );
  arm.translate(x + along.x / 2, top + along.y / 2, -y + along.z / 2);

  const head = new THREE.BoxGeometry(0.52, 0.14, 0.26);
  head.rotateY(Math.atan2(-dz, dx));
  head.translate(x + along.x, top + along.y, -y + along.z);

  return [post, arm, head];
}

function mergedMesh(
  geometries: THREE.BufferGeometry[],
  mat: THREE.Material,
  name: string,
): THREE.Mesh | null {
  if (geometries.length === 0) return null;
  const merged = mergeGeometries(geometries, false);
  geometries.forEach((g) => g.dispose());
  if (!merged) return null;
  const mesh = new THREE.Mesh(merged, mat);
  mesh.name = name;
  return mesh;
}

/**
 * A flat panel on a wall, given in metres along the frontage and up from the ground. `facing` says
 * which wall, so the same description serves a terrace on either side of either road.
 */
function panel(
  surface: Surface,
  facing: Facing,
  along: number,
  bottom: number,
  width: number,
  height: number,
  proud: number,
): THREE.BufferGeometry {
  const xs = surface.points.map((p) => p.x);
  const ys = surface.points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const geometry = new THREE.PlaneGeometry(width, height);

  if (facing === 'west' || facing === 'east') {
    const wall = facing === 'west' ? minX - proud : maxX + proud;
    geometry.rotateY(facing === 'west' ? -Math.PI / 2 : Math.PI / 2);
    geometry.translate(wall, bottom + height / 2, -(minY + along));
  } else {
    // Scene z runs opposite to world y, so a wall fronting world −y faces scene +z — which is
    // where an unrotated plane already points. Rotating it here turned every Kerkstraat frontage
    // to face into its own house.
    const wall = facing === 'south' ? minY - proud : maxY + proud;
    geometry.rotateY(facing === 'south' ? 0 : Math.PI);
    geometry.translate(minX + along, bottom + height / 2, -wall);
  }
  return geometry;
}

/**
 * A gable roof over an axis-aligned footprint, ridged along its longer side and overhanging a
 * little. A bare extruded block reads as a crate; from the saddle the roofline is what tells you
 * these are houses and where the built-up stretch ends.
 */
function roofGeometry(surface: Surface, wallHeight: number): THREE.BufferGeometry {
  const xs = surface.points.map((p) => p.x);
  const ys = surface.points.map((p) => p.y);
  const minX = Math.min(...xs) - EAVES;
  const maxX = Math.max(...xs) + EAVES;
  const minY = Math.min(...ys) - EAVES;
  const maxY = Math.max(...ys) + EAVES;

  const eave = wallHeight;
  const ridge = wallHeight + ROOF_RISE;
  const zNear = -minY;
  const zFar = -maxY;

  const positions: number[] = [];
  type P = [number, number, number];
  const tri = (a: P, b: P, c: P) => positions.push(...a, ...b, ...c);
  const quad = (a: P, b: P, c: P, d: P) => {
    tri(a, b, c);
    tri(a, c, d);
  };

  if (maxX - minX >= maxY - minY) {
    const zMid = (zNear + zFar) / 2;
    const a: P = [minX, eave, zNear];
    const b: P = [maxX, eave, zNear];
    const c: P = [maxX, ridge, zMid];
    const d: P = [minX, ridge, zMid];
    const e: P = [maxX, eave, zFar];
    const f: P = [minX, eave, zFar];
    quad(a, b, c, d);
    quad(d, c, e, f);
    tri(a, d, f);
    tri(b, e, c);
  } else {
    const xMid = (minX + maxX) / 2;
    const a: P = [minX, eave, zNear];
    const b: P = [xMid, ridge, zNear];
    const c: P = [xMid, ridge, zFar];
    const d: P = [minX, eave, zFar];
    const e: P = [maxX, eave, zNear];
    const f: P = [maxX, eave, zFar];
    quad(a, b, c, d);
    quad(b, e, f, c);
    tri(a, e, b);
    tri(d, c, f);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Frontage width available on the wall a building fronts. */
function frontageWidth(surface: Surface, facing: Facing): number {
  const values = surface.points.map((p) => (facing === 'west' || facing === 'east' ? p.y : p.x));
  return Math.max(...values) - Math.min(...values);
}

function frontage(surface: Surface): { colour: string; geometry: THREE.BufferGeometry }[] {
  const facing = surface.facing;
  if (!facing) return [];
  const width = frontageWidth(surface, facing);
  const out: { colour: string; geometry: THREE.BufferGeometry }[] = [];

  const add = (
    colour: string,
    along: number,
    bottom: number,
    w: number,
    h: number,
    proud: number,
  ) => {
    out.push({ colour, geometry: panel(surface, facing, along, bottom, w, h, proud) });
  };

  // Door a third of the way along, with a window beside it and two above.
  const window = (along: number, sill: number) => {
    add(
      FRONTAGE.colours.frame,
      along,
      sill - 0.07,
      FRONTAGE.windowWidth + 0.14,
      FRONTAGE.windowHeight + 0.14,
      FRONTAGE.framProud,
    );
    add(
      FRONTAGE.colours.glass,
      along,
      sill,
      FRONTAGE.windowWidth,
      FRONTAGE.windowHeight,
      FRONTAGE.paneProud,
    );
  };

  const doorAt = width * 0.32;
  add(
    FRONTAGE.colours.frame,
    doorAt,
    0,
    FRONTAGE.doorWidth + 0.14,
    FRONTAGE.doorHeight + 0.1,
    FRONTAGE.framProud,
  );
  add(
    FRONTAGE.colours.door,
    doorAt,
    0,
    FRONTAGE.doorWidth,
    FRONTAGE.doorHeight,
    FRONTAGE.paneProud,
  );

  window(width * 0.68, FRONTAGE.groundSill);
  for (const fraction of [0.3, 0.7]) window(width * fraction, FRONTAGE.upperSill);

  return out;
}

export function buildWorld(scenario: Scenario): THREE.Group {
  const world = new THREE.Group();
  world.name = 'world';

  // The verge is uniform, so it is one plane rather than thousands of polygons.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    material('hedge', PALETTE.grass),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.name = 'verge';
  ground.receiveShadow = true;
  world.add(ground);

  const byKind = new Map<string, THREE.BufferGeometry[]>();
  const byDetail = new Map<string, THREE.BufferGeometry[]>();
  for (const surface of roadSurfaces(scenario.world, EXTENT)) {
    if (surface.kind === 'roof') continue;
    // Neighbouring houses alternate render, exactly as they do in plan view. Merging them all
    // into one mesh would throw that away and leave a terrace of identical beige blocks.
    const group =
      surface.kind === 'house' && (surface.variant ?? 0) % 2 !== 0 ? 'houseAlt' : surface.kind;
    const list = byKind.get(group) ?? [];
    if (surface.kind === 'lamp') {
      list.push(...lampGeometry(surface));
    } else {
      list.push(
        surface.height > 0 ? extrudedGeometry(surface) : flatGeometry(surface, LAYER[surface.kind]),
      );
    }
    byKind.set(group, list);

    for (const { colour, geometry } of frontage(surface)) {
      const details = byDetail.get(colour) ?? [];
      details.push(geometry);
      byDetail.set(colour, details);
    }

    if (surface.kind === 'house') {
      const roofs = byDetail.get(ROOF_COLOUR) ?? [];
      roofs.push(roofGeometry(surface, surface.height));
      byDetail.set(ROOF_COLOUR, roofs);
    }
  }

  const colours: Record<string, string> = {
    asphalt: PALETTE.asphalt,
    fietspad: PALETTE.fietspad,
    fietspadEdge: PALETTE.fietspadEdge,
    kerb: PALETTE.kerb,
    paint: PALETTE.paint,
    hedge: PALETTE.hedge,
    house: PALETTE.house,
    houseAlt: PALETTE.houseAlt,
    lamp: PALETTE.lamp,
  };

  for (const [group, geometries] of byKind) {
    const mesh = mergedMesh(geometries, material(group, colours[group] ?? PALETTE.asphalt), group);
    if (!mesh) continue;
    // Only what stands up casts; the ground it stands on receives.
    mesh.castShadow =
      group.startsWith('house') || group === 'hedge' || group === 'kerb' || group === 'lamp';
    mesh.receiveShadow = !mesh.castShadow;
    world.add(mesh);
  }

  for (const [colour, geometries] of byDetail) {
    const isRoof = colour === ROOF_COLOUR;
    const mesh = mergedMesh(
      geometries,
      detailMaterial(colour, isRoof),
      isRoof ? 'roof' : 'frontage',
    );
    if (!mesh) continue;
    // Frontages have to take the shadow the wall around them is in, or a door lights up like a
    // lamp on a wall that is plainly in shade.
    mesh.receiveShadow = true;
    mesh.castShadow = isRoof;
    world.add(mesh);
  }

  return world;
}

export function disposeWorld(world: THREE.Group) {
  world.traverse((node) => {
    if (node instanceof THREE.Mesh) node.geometry.dispose();
  });
  for (const key of Object.keys(MATERIALS)) {
    MATERIALS[key].dispose();
    delete MATERIALS[key];
  }
  for (const key of Object.keys(detailMaterials)) {
    detailMaterials[key].dispose();
    delete detailMaterials[key];
  }
}
