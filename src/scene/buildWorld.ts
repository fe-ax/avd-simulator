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
import { roadSurfaces, type RoadExtent, type Surface, type SurfaceKind } from '../sim/roadSurfaces';
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

const MATERIALS: Partial<Record<SurfaceKind, THREE.Material>> = {};

function material(kind: SurfaceKind, colour: string): THREE.Material {
  if (!MATERIALS[kind]) {
    MATERIALS[kind] = new THREE.MeshLambertMaterial({ color: new THREE.Color(colour) });
  }
  return MATERIALS[kind]!;
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
  world.add(ground);

  const byKind = new Map<SurfaceKind, THREE.BufferGeometry[]>();
  for (const surface of roadSurfaces(scenario.road, EXTENT)) {
    if (surface.kind === 'roof') continue;
    const list = byKind.get(surface.kind) ?? [];
    list.push(
      surface.height > 0 ? extrudedGeometry(surface) : flatGeometry(surface, LAYER[surface.kind]),
    );
    byKind.set(surface.kind, list);
  }

  const colours: Record<string, string> = {
    asphalt: PALETTE.asphalt,
    fietspad: PALETTE.fietspad,
    fietspadEdge: PALETTE.fietspadEdge,
    kerb: PALETTE.kerb,
    paint: PALETTE.paint,
    hedge: PALETTE.hedge,
    house: PALETTE.house,
  };

  for (const [kind, geometries] of byKind) {
    const mesh = mergedMesh(geometries, material(kind, colours[kind] ?? PALETTE.asphalt), kind);
    if (mesh) world.add(mesh);
  }

  return world;
}

export function disposeWorld(world: THREE.Group) {
  world.traverse((node) => {
    if (node instanceof THREE.Mesh) node.geometry.dispose();
  });
  for (const key of Object.keys(MATERIALS) as SurfaceKind[]) {
    MATERIALS[key]?.dispose();
    delete MATERIALS[key];
  }
}
