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
  proud: 0.03,
  doorWidth: 0.95,
  doorHeight: 2.1,
  windowWidth: 1.25,
  windowHeight: 1.15,
  groundSill: 0.95,
  upperSill: 3.5,
  colours: { door: '#5b4634', glass: '#2f3b47', frame: '#e6e2d8' },
};

const MATERIALS: Record<string, THREE.Material> = {};
const detailMaterials: Record<string, THREE.MeshLambertMaterial> = {};

function detailMaterial(colour: string): THREE.MeshLambertMaterial {
  if (!detailMaterials[colour]) {
    detailMaterials[colour] = new THREE.MeshLambertMaterial({ color: new THREE.Color(colour) });
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

/** An upright block standing on its footprint. */
function extrudedGeometry(surface: Surface): THREE.BufferGeometry {
  const geometry = new THREE.ExtrudeGeometry(toShape(surface), {
    depth: surface.height,
    bevelEnabled: false,
  });
  // Extrusion grows along +z, so rotating the footprint flat leaves it standing upright.
  geometry.rotateX(-Math.PI / 2);
  geometry.scale(1, 1, -1);
  return geometry;
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
): THREE.BufferGeometry {
  const xs = surface.points.map((p) => p.x);
  const ys = surface.points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const geometry = new THREE.PlaneGeometry(width, height);
  const out = FRONTAGE.proud;

  if (facing === 'west' || facing === 'east') {
    const wall = facing === 'west' ? minX - out : maxX + out;
    geometry.rotateY(facing === 'west' ? -Math.PI / 2 : Math.PI / 2);
    geometry.translate(wall, bottom + height / 2, -(minY + along));
  } else {
    const wall = facing === 'south' ? minY - out : maxY + out;
    geometry.rotateY(facing === 'south' ? Math.PI : 0);
    geometry.translate(minX + along, bottom + height / 2, -wall);
  }
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

  const add = (colour: string, along: number, bottom: number, w: number, h: number) => {
    out.push({ colour, geometry: panel(surface, facing, along, bottom, w, h) });
  };

  // Door a third of the way along, with a window beside it and two above.
  const doorAt = width * 0.32;
  add(FRONTAGE.colours.frame, doorAt, 0, FRONTAGE.doorWidth + 0.14, FRONTAGE.doorHeight + 0.1);
  add(FRONTAGE.colours.door, doorAt, 0, FRONTAGE.doorWidth, FRONTAGE.doorHeight);

  const groundWindowAt = width * 0.68;
  add(
    FRONTAGE.colours.frame,
    groundWindowAt,
    FRONTAGE.groundSill - 0.07,
    FRONTAGE.windowWidth + 0.14,
    FRONTAGE.windowHeight + 0.14,
  );
  add(
    FRONTAGE.colours.glass,
    groundWindowAt,
    FRONTAGE.groundSill,
    FRONTAGE.windowWidth,
    FRONTAGE.windowHeight,
  );

  for (const fraction of [0.3, 0.7]) {
    add(
      FRONTAGE.colours.frame,
      width * fraction,
      FRONTAGE.upperSill - 0.07,
      FRONTAGE.windowWidth + 0.14,
      FRONTAGE.windowHeight + 0.14,
    );
    add(
      FRONTAGE.colours.glass,
      width * fraction,
      FRONTAGE.upperSill,
      FRONTAGE.windowWidth,
      FRONTAGE.windowHeight,
    );
  }

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
  for (const surface of roadSurfaces(scenario.road, EXTENT)) {
    if (surface.kind === 'roof') continue;
    // Neighbouring houses alternate render, exactly as they do in plan view. Merging them all
    // into one mesh would throw that away and leave a terrace of identical beige blocks.
    const group =
      surface.kind === 'house' && (surface.variant ?? 0) % 2 !== 0 ? 'houseAlt' : surface.kind;
    const list = byKind.get(group) ?? [];
    list.push(
      surface.height > 0 ? extrudedGeometry(surface) : flatGeometry(surface, LAYER[surface.kind]),
    );
    byKind.set(group, list);

    for (const { colour, geometry } of frontage(surface)) {
      const details = byDetail.get(colour) ?? [];
      details.push(geometry);
      byDetail.set(colour, details);
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
  };

  for (const [group, geometries] of byKind) {
    const mesh = mergedMesh(geometries, material(group, colours[group] ?? PALETTE.asphalt), group);
    if (!mesh) continue;
    // Only what stands up casts; the ground it stands on receives.
    mesh.castShadow = group.startsWith('house') || group === 'hedge' || group === 'kerb';
    mesh.receiveShadow = !mesh.castShadow;
    world.add(mesh);
  }

  for (const [colour, geometries] of byDetail) {
    const mesh = mergedMesh(geometries, detailMaterial(colour), 'frontage');
    if (mesh) world.add(mesh);
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
