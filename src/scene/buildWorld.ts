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
import { PLATE, PLATE_CLEARANCE, POST, signGroups, type SignGroup } from '../sim/surfaces/signs';
import { disposeMaterials, surfaceMaterial } from './materials';
import { signMaterial } from './signFaces';
import { buildRoutes, poseAt } from '../sim/route';
import type { Scenario } from '../sim/types';

/**
 * How far the built world reaches past the ridden line.
 *
 * This is the fog's near plane (`Stage`): beyond it the world fades to sky, so an edge that far
 * from every point of the route is an edge nobody can see. It used to be a hand-picked rectangle,
 * which was honest while there was one scenario and wrong the moment there were two — the
 * motorway's oprit starts 187 m south of the origin and its run-out ends 120 m north of it, so a
 * box sized for a 30-zone kruising ended the world mid-ride and left the hectometerpaaltjes, which
 * stand on whole hundreds of world y, with two of their number inside it.
 */
const WORLD_MARGIN = 95;

/**
 * The extent to build, from the line the rider actually rides.
 *
 * Derived from the route rather than from the road layout on purpose: a scenario's scenery is
 * placed relative to where the rider goes, not relative to how wide its carriageway happens to be,
 * and the route is the one description every scenario has to have.
 */
function worldExtent(scenario: Scenario): RoadExtent {
  const routes = buildRoutes(scenario);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  // A metre at a time. The widest arc in any scenario has a 120 m radius, where a metre of chord
  // departs from the curve by a millimetre — far below anything a 95 m margin cares about.
  for (const route of [routes.turn, routes.straight]) {
    for (let s = 0; s <= route.total + 1; s += 1) {
      const { x, y } = poseAt(route, Math.min(s, route.total));
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  return {
    minX: minX - WORLD_MARGIN,
    maxX: maxX + WORLD_MARGIN,
    minY: minY - WORLD_MARGIN,
    maxY: maxY + WORLD_MARGIN,
  };
}

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
  sign: 0,
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
const detailMaterials: Record<string, THREE.MeshStandardMaterial> = {};

function detailMaterial(colour: string, doubleSided = false): THREE.MeshStandardMaterial {
  if (!detailMaterials[colour]) {
    detailMaterials[colour] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colour),
      // Roof slopes are built by hand and their winding is not worth policing; three.js flips the
      // normal for a back face, so the shading comes out right either way.
      side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
      // Doors and frames are painted joinery; glass is glass. Told apart by how dark they are,
      // which is crude and holds for the four colours a frontage actually uses.
      roughness: colour === FRONTAGE.colours.glass ? 0.12 : 0.62,
      metalness: colour === FRONTAGE.colours.glass ? 0.1 : 0,
    });
  }
  return detailMaterials[colour];
}

/**
 * Shared materials, one per key.
 *
 * The cache is keyed by name and *checked* against the colour, because it silently was not: the
 * ground plane asked for `('hedge', PALETTE.grass)` and every hedge built afterwards asked for
 * `('hedge', PALETTE.hedge)` and got grass back. The hedges had been the wrong green the whole
 * time, and the top-down view — which reads the same palette but caches nothing — was drawing
 * them correctly, so the two views quietly disagreed about a colour. That is exactly the class of
 * bug `roadSurfaces` exists to prevent, turning up one layer down.
 *
 * Now asking for a key with a different colour throws instead of handing back the first one.
 */
function material(key: string, colour: string): THREE.Material {
  const existing = MATERIALS[key];
  if (existing) {
    if (import.meta.env.DEV) {
      const held = (existing as THREE.MeshStandardMaterial).color.getHexString();
      const want = new THREE.Color(colour).getHexString();
      if (held !== want) {
        throw new Error(
          `[buildWorld] materiaal "${key}" bestaat al als #${held}, maar wordt nu als #${want} ` +
            `opgevraagd. Twee dingen delen een naam en niet een kleur.`,
        );
      }
    }
    return existing;
  }
  MATERIALS[key] = surfaceMaterial(key, colour);
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
 * One piece of a standing roadside detail. Most pieces take the colour of the kind they belong to;
 * `group` names the exceptions, the way `houseAlt` does — a tree's trunk and the band on a
 * hectometerpaaltje are the whole reason those two read as what they are.
 */
interface Part {
  geometry: THREE.BufferGeometry;
  group?: string;
}

const TREE_TRUNK = 'treeTrunk';
const HECTOMETER_BAND = 'hectometerBand';
const TRUNK_COLOUR = '#584434';

/** Centre and spans of a footprint, in world metres. */
function footprint(surface: Surface) {
  const xs = surface.points.map((p) => p.x);
  const ys = surface.points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    width: maxX - minX,
    depth: maxY - minY,
  };
}

/**
 * A street light, from the small square footprint that stands for it.
 *
 * The footprint carries only where the post is and how tall; the arm and the head are built here
 * because a bent tube is not a polygon anyone wants in the shared road data. The arm reaches
 * toward the junction centre, which is where a real one reaches: out over the road it lights.
 */
function lampGeometry(surface: Surface): Part[] {
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

  return [post, arm, head].map((geometry) => ({ geometry }));
}

/**
 * A geleiderail, from the long thin run that stands for it.
 *
 * The footprint says where the rail is, how far it reaches and — as `height` — where the top of
 * the beam sits. The profile is not the footprint's to choose: a W-beam is a rolled section, so
 * two flanges and a web set back between them are built here at fixed proportions of whatever
 * envelope the footprint allows.
 */
const GUARDRAIL = {
  /** A real W-beam is 0.31 m deep, in two corrugations. */
  beamDepth: 0.31,
  flange: 0.09,
  /** How much of the footprint's thickness the beam takes, and how much the posts behind it take. */
  beamOfEnvelope: 0.3,
  postOfEnvelope: 0.6,
  /** Along the run. */
  postWidth: 0.14,
  spacing: 4,
  /** Where the beam sits if the footprint forgot to say. Knee-high, as a middenberm rail is. */
  fallbackHeight: 0.75,
};

function guardrailGeometry(surface: Surface): Part[] {
  const fp = footprint(surface);
  const alongY = fp.depth >= fp.width;
  const run = alongY ? fp.depth : fp.width;
  const from = alongY ? fp.y - fp.depth / 2 : fp.x - fp.width / 2;
  const envelope = Math.max(alongY ? fp.width : fp.depth, 0.12);
  const top = surface.height > 0 ? surface.height : GUARDRAIL.fallbackHeight;
  const bottom = top - GUARDRAIL.beamDepth;
  const out: Part[] = [];

  /** A bar the length of the run, `thick` across it, occupying the height between y0 and y1. */
  const bar = (thick: number, y0: number, y1: number) => {
    const geometry = alongY
      ? new THREE.BoxGeometry(thick, y1 - y0, run)
      : new THREE.BoxGeometry(run, y1 - y0, thick);
    geometry.translate(fp.x, (y0 + y1) / 2, -fp.y);
    out.push({ geometry });
  };

  // Symmetric about the run, because a middenberm rail is seen from both sides and the footprint
  // does not say which one the road is on. The web is held a centimetre clear of the flanges top
  // and bottom so no two faces end up coplanar and fighting for the same depth.
  const beam = envelope * GUARDRAIL.beamOfEnvelope;
  bar(beam, top - GUARDRAIL.flange, top);
  bar(beam, bottom, bottom + GUARDRAIL.flange);
  bar(beam * 0.55, bottom + 0.01, top - 0.01);

  // Posts on a grid of whole world metres rather than on this run's own ends. A rail arrives in
  // bolted lengths that overlap by a seam, and one post per end would put two of them in the same
  // hole at every joint — which is exactly the rhythm the eye uses to read speed off a barrier.
  const postTop = top - 0.04;
  const postThick = envelope * GUARDRAIL.postOfEnvelope;
  const first = Math.ceil(from / GUARDRAIL.spacing) * GUARDRAIL.spacing;
  for (let at = first; at < from + run - GUARDRAIL.spacing / 8; at += GUARDRAIL.spacing) {
    const geometry = alongY
      ? new THREE.BoxGeometry(postThick, postTop, GUARDRAIL.postWidth)
      : new THREE.BoxGeometry(GUARDRAIL.postWidth, postTop, postThick);
    geometry.translate(alongY ? fp.x : at, postTop / 2, alongY ? -at : -fp.y);
    out.push({ geometry });
  }

  return out;
}

/**
 * A hectometerpaaltje: green blade, white band near the top.
 *
 * The blade is clamped rather than taken from the footprint, because a paaltje is a rolled section
 * and not a size — a square footprint copied from the lamp would otherwise stand a fence post at
 * the roadside. What is emphatically not attempted is the number on it: at 100 km/h the band is
 * the whole of what anyone sees, and a legible board would be a lie about how much a rider can
 * read going past.
 */
const HECTOMETER = {
  fallbackHeight: 1,
  minSide: 0.08,
  maxSide: 0.16,
  /** How far below the top the band starts, and how deep it is. */
  bandDrop: 0.04,
  bandDepth: 0.19,
  bandProud: 0.008,
};

function hectometerPostGeometry(surface: Surface): Part[] {
  const fp = footprint(surface);
  const top = surface.height > 0 ? surface.height : HECTOMETER.fallbackHeight;
  const side = (v: number) => Math.min(Math.max(v, HECTOMETER.minSide), HECTOMETER.maxSide);
  const width = side(fp.width);
  const depth = side(fp.depth);

  const post = new THREE.BoxGeometry(width, top, depth);
  post.translate(fp.x, top / 2, -fp.y);

  const proud = HECTOMETER.bandProud * 2;
  const band = new THREE.BoxGeometry(width + proud, HECTOMETER.bandDepth, depth + proud);
  band.translate(fp.x, top - HECTOMETER.bandDrop - HECTOMETER.bandDepth / 2, -fp.y);

  return [{ geometry: post }, { geometry: band, group: HECTOMETER_BAND }];
}

/**
 * A tree: trunk plus crown.
 *
 * The road data's footprint is the *trunk* — the crown is the renderer's to decide — so the crown
 * comes off the height and the variant, which are what the road data does vary. A treeline runs
 * for three hundred metres here, and a row of identically proportioned copies at different scales
 * reads as wallpaper rather than as a wood.
 */
/** The three lobes a crown is built from: a big one, and two smaller ones pushed off its axis. */
const LOBES = [
  { scale: 1.0, squash: 1.0, out: 0.0, up: 1.0 },
  { scale: 0.66, squash: 0.9, out: 0.55, up: 0.78 },
  { scale: 0.54, squash: 0.85, out: 0.5, up: 1.32 },
];

const TREE = {
  fallbackHeight: 9,
  /** Crown radius as a fraction of the tree's height, and how far the variant moves it. */
  crownOfHeight: 0.21,
  crownSpread: 0.04,
  /** Where the crown starts, likewise. */
  trunkOfHeight: 0.3,
  trunkSpread: 0.05,
};

/**
 * The post a sign stands on. The plate is not here: it needs a texture of its own and this path
 * merges by colour, which is exactly the thing a "50" cannot survive.
 */
function signPostGeometry(surface: Surface): Part[] {
  const fp = footprint(surface);
  const post = new THREE.BoxGeometry(SIGN_POST.side, surface.height, SIGN_POST.side);
  post.translate(fp.x, surface.height / 2, -fp.y);
  return [{ geometry: post, group: 'sign' }];
}

const SIGN_POST = { side: POST.side };

/** How far the plate stands off the post's centre. The rule lives with the post; see `signs.ts`. */
const PLATE_PROUD = PLATE_CLEARANCE;

/** How far the sign's back sits behind its face. Enough not to z-fight, small enough to read flat. */
const BACK_GAP = 0.01;

/**
 * One plate for one sign. Which posts belong to it is `signGroups`' answer, not this file's — the
 * plan view has to reach the same one, and two renderers each deciding how many signs there are is
 * the drift `roadSurfaces` exists to rule out.
 */
function plateMesh({ face, at, top, facing }: SignGroup): THREE.Object3D {
  const spec = PLATE[face.type];
  const cx = at.x;
  const cy = at.y;

  const geometry = new THREE.PlaneGeometry(spec.width, spec.height);
  const mesh = new THREE.Mesh(geometry, signMaterial(face));
  // Not 'sign': that is the merged mesh of every post, and one name for both cost two rounds of
  // confusion when measuring the scene. The posts are the kind; this is the face.
  mesh.name = 'signFace';
  // Which sign this is, for anything measuring the scene rather than looking at it.
  mesh.userData.sign = face;

  // The back of the sign, in the grey of its own post.
  //
  // A plate is one single-sided plane, so from behind you looked straight through it — signs on the
  // far side of a crossroads, and every sign at all once you had passed it, were holes. Turning the
  // material double-sided would show the artwork through the back, mirrored: a "Deventer" reading
  // backwards is worse than a gap. A real sign has an unpainted back, so it gets one.
  const back = new THREE.Mesh(geometry, material('signBack', PALETTE.signPost));
  back.name = 'signBack';
  back.rotation.y = Math.PI;
  back.position.z = -BACK_GAP;
  // Hung from the top of the post downward, so a taller post raises the plate rather than
  // stretching it — the same reading as `PLATE.post` in the sim.
  mesh.position.set(cx, top - spec.height / 2, -cy);
  // A plane already looks down scene +z, which is world −y: back along the road at a northbound
  // rider. The other three are quarter turns from there.
  mesh.rotation.y =
    facing === 'south' ? 0 : facing === 'north' ? Math.PI : facing === 'east' ? Math.PI / 2 : -Math.PI / 2;
  mesh.position.x += facing === 'east' ? PLATE_PROUD : facing === 'west' ? -PLATE_PROUD : 0;
  mesh.position.z += facing === 'south' ? PLATE_PROUD : facing === 'north' ? -PLATE_PROUD : 0;
  // Parented to the face, so it inherits the aim rather than repeating the four-way rotation.
  mesh.add(back);
  return mesh;
}

function treeGeometry(surface: Surface): Part[] {
  const fp = footprint(surface);
  const height = surface.height > 0 ? surface.height : TREE.fallbackHeight;
  const variant = surface.variant ?? Math.round(height * 4);
  const trunkTop = height * (TREE.trunkOfHeight + TREE.trunkSpread * (variant % 3));
  const crown = height * (TREE.crownOfHeight + TREE.crownSpread * ((variant >> 1) % 3));
  const rise = (height - trunkTop) / 2;

  // Three overlapping lobes rather than one ellipsoid.
  //
  // A single scaled sphere is an egg, and a treeline of two hundred eggs reads as a row of eggs
  // however well it is lit — the silhouette is the giveaway at the distance these are seen from,
  // long before shading is. Three lobes at offsets taken from the variant give a lumpy outline for
  // three times the triangles of the cheapest possible tree, which on a merged mesh costs a draw
  // call of nothing.
  //
  // Offsets are variant-derived, not random, for the reason the houses are: a treeline has to come
  // out the same every time it is built, or a replay grows a different wood from the ride.
  const lobes: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const spin = ((variant * 7 + i * 5) % 12) / 12;
    const lean = ((variant + i * 3) % 5) / 5 - 0.5;
    const scale = LOBES[i].scale;
    const lobe = new THREE.SphereGeometry(1, 8, 5);
    lobe.scale(crown * scale, rise * scale * LOBES[i].squash, crown * scale);
    lobe.translate(
      fp.x + Math.cos(spin * Math.PI * 2) * crown * LOBES[i].out,
      trunkTop + rise * LOBES[i].up,
      -fp.y + Math.sin(spin * Math.PI * 2) * crown * LOBES[i].out + lean * 0.12,
    );
    lobes.push(lobe);
  }
  const canopy = mergeGeometries(lobes, false)!;
  lobes.forEach((g) => g.dispose());

  // The trunk carries on into the crown, or a tree in a stiff perspective shows daylight at its
  // own neck.
  const radius = Math.max((fp.width + fp.depth) / 4, 0.06);
  const length = trunkTop + rise * 0.6;
  const trunk = new THREE.CylinderGeometry(radius * 0.75, radius, length, 6);
  trunk.translate(fp.x, length / 2, -fp.y);

  return [{ geometry: canopy }, { geometry: trunk, group: TREE_TRUNK }];
}

/**
 * Everything that is built rather than extruded. The footprint carries position and size; the
 * shape of the thing standing on it lives here, where three.js primitives are available and the
 * shared road data does not have to carry a rolled steel section as a polygon.
 */
const DETAILS: Partial<Record<SurfaceKind, (surface: Surface) => Part[]>> = {
  lamp: lampGeometry,
  guardrail: guardrailGeometry,
  hectometerPost: hectometerPostGeometry,
  tree: treeGeometry,
  sign: signPostGeometry,
};

/** Only what stands up casts; the ground it stands on receives. */
const CASTS_SHADOW = new Set([
  'hedge',
  'kerb',
  'lamp',
  'guardrail',
  'hectometerPost',
  HECTOMETER_BAND,
  'tree',
  TREE_TRUNK,
]);

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

/**
 * A door and some windows on the side that faces the road.
 *
 * Guarded on `kind`, not merely on having a `facing`. It used to infer "this is a building" from
 * "this has a facing", which held only for as long as houses were the one thing that fronted
 * anywhere — and the day signs gained a facing so they could look at their own traffic, every sign
 * post in the Kerkstraat grew a front door and three windows. The roof beside it was already
 * guarded on kind; this was the same question answered two different ways in one loop.
 */
export function frontage(surface: Surface): { colour: string; geometry: THREE.BufferGeometry }[] {
  const facing = surface.kind === 'house' ? surface.facing : undefined;
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

  const ext = worldExtent(scenario);

  // The verge is uniform, so it is one plane rather than thousands of polygons — and it is sized
  // from the extent with the margin added a second time, because it has to outlast every surface
  // standing on it. It used to be a fixed 400 m square, which covered a 30-zone kruising and
  // stopped 13 m behind the start of the motorway's oprit: grass that runs out first leaves the
  // road running off into the sky.
  const groundWidth = ext.maxX - ext.minX + 2 * WORLD_MARGIN;
  const groundDepth = ext.maxY - ext.minY + 2 * WORLD_MARGIN;
  const groundGeometry = new THREE.PlaneGeometry(groundWidth, groundDepth);
  // The one geometry here that does not already carry world-space UVs: a plane is mapped 0..1,
  // where every shape geometry in `roadSurfaces` comes through in metres. Scaling them up to match
  // is what lets the grass share the same texture and the same "one tile every n metres" repeat as
  // everything else, instead of one blade of grass stretched over four hundred metres.
  const groundUv = groundGeometry.attributes.uv;
  for (let i = 0; i < groundUv.count; i++) {
    groundUv.setXY(i, groundUv.getX(i) * groundWidth, groundUv.getY(i) * groundDepth);
  }
  const ground = new THREE.Mesh(groundGeometry, material('grass', PALETTE.grass));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((ext.minX + ext.maxX) / 2, 0, -(ext.minY + ext.maxY) / 2);
  ground.name = 'verge';
  ground.receiveShadow = true;
  world.add(ground);

  // Signs are collected rather than merged: each face is its own texture, keyed by what it says.
  const signSurfaces: Surface[] = [];
  const byKind = new Map<string, THREE.BufferGeometry[]>();
  const byDetail = new Map<string, THREE.BufferGeometry[]>();
  const push = (group: string, geometry: THREE.BufferGeometry) => {
    const list = byKind.get(group) ?? [];
    list.push(geometry);
    byKind.set(group, list);
  };

  for (const surface of roadSurfaces(scenario.world, ext, scenario.speedLimitKmh)) {
    if (surface.kind === 'roof') continue;
    if (surface.sign) signSurfaces.push(surface);
    // Neighbouring houses alternate render, exactly as they do in plan view. Merging them all
    // into one mesh would throw that away and leave a terrace of identical beige blocks.
    const group =
      surface.kind === 'house' && (surface.variant ?? 0) % 2 !== 0 ? 'houseAlt' : surface.kind;
    const detail = DETAILS[surface.kind];
    if (detail) {
      for (const part of detail(surface)) push(part.group ?? group, part.geometry);
    } else {
      push(
        group,
        surface.height > 0 ? extrudedGeometry(surface) : flatGeometry(surface, LAYER[surface.kind]),
      );
    }

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
    guardrail: PALETTE.guardrail,
    hectometerPost: PALETTE.hectometerPost,
    [HECTOMETER_BAND]: PALETTE.paint,
    tree: PALETTE.tree,
    [TREE_TRUNK]: TRUNK_COLOUR,
    sign: PALETTE.signPost,
  };

  for (const [group, geometries] of byKind) {
    const mesh = mergedMesh(geometries, material(group, colours[group] ?? PALETTE.asphalt), group);
    if (!mesh) continue;
    mesh.castShadow = group.startsWith('house') || CASTS_SHADOW.has(group);
    mesh.receiveShadow = !mesh.castShadow;
    world.add(mesh);
  }

  for (const group of signGroups(signSurfaces)) world.add(plateMesh(group));

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
  for (const key of Object.keys(MATERIALS)) delete MATERIALS[key];
  disposeMaterials();
  for (const key of Object.keys(detailMaterials)) {
    detailMaterials[key].dispose();
    delete detailMaterials[key];
  }
}
