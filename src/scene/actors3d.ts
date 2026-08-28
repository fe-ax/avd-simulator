/**
 * The other road users, as simple upright blocks. Deliberately plain: what has to read at a
 * glance is where a vehicle is and which way it faces, not what model it is.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { headingToYaw } from './coords';
import type { ActorKind, ActorState } from '../sim/types';

const SNORFIETS = {
  deck: '#d8d4cc',
  rider: '#2c3140',
  helmet: '#f0ede6',
  /** The blue plate is the detail that says "snorfiets, 25 km/u, hoort op het fietspad". */
  plate: '#1f5fbf',
  brakeLight: '#ff3b30',
};


/**
 * What a vehicle's surfaces are made of, by colour.
 *
 * The bodies were all one flat Lambert, which was the right answer while the world was flat too:
 * the job was reading *where* a vehicle is, not what model. Now that the street takes light
 * properly, an unlit box beside a textured kerb is the thing that looks wrong — so paint gets a
 * sheen, glass gets a hard highlight and goes dark, tyres stay dead matte, and the lamps emit
 * rather than merely being red.
 *
 * Keyed off the palette entries rather than an extra role argument at every call site: the colours
 * already say what each part is, and threading a second parameter through `slab` and `pair` would
 * touch every line of every vehicle for something the colour already knows.
 */
// Both vehicles share one glass colour; written as the literal because these sets are declared
// before the palettes that use it, and a `const` cannot be read before it is initialised.
const GLASS = new Set(['#2f3b47']);
const TYRE = new Set(['#17171a', '#1b1d21', '#15161a']);
const LAMP = new Map<string, number>([
  ['#ff3b30', 2.6],
  ['#7c1f18', 0.35],
  ['#f0b429', 1.2],
]);

function vehicleMaterial(colour: string): THREE.MeshStandardMaterial {
  const hit = vehicleMaterials.get(colour);
  if (hit) return hit;

  const emissive = LAMP.get(colour);
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(colour),
    // Glass is smooth and slightly reflective; paint has a clearcoat sheen; rubber and plastic
    // have none. Metalness stays low on paint — car paint is a dielectric over metal, and taking
    // it high turns a red car into a red mirror.
    roughness: GLASS.has(colour) ? 0.08 : TYRE.has(colour) ? 0.95 : 0.38,
    metalness: GLASS.has(colour) ? 0.2 : TYRE.has(colour) ? 0 : 0.12,
    ...(emissive === undefined
      ? {}
      : { emissive: new THREE.Color(colour), emissiveIntensity: emissive }),
  });
  vehicleMaterials.set(colour, material);
  return material;
}

const vehicleMaterials = new Map<string, THREE.MeshStandardMaterial>();

function box(w: number, h: number, d: number, colour: string): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), vehicleMaterial(colour));
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
    vehicleMaterial(SNORFIETS.helmet),
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

// ---------------------------------------------------------------------------
// Vrachtwagen
// ---------------------------------------------------------------------------

/**
 * A trekker-oplegger at the Dutch legal maximums: 16.5 m nose to tail, 2.55 m wide, 4.0 m tall.
 *
 * They are maximums rather than styling choices, which is why they sit in one block and are
 * repeated by the plan-view sprite in `render/drawScene.ts`: the two views have to agree about how
 * much road this thing takes up, and on a motorway that is most of what the exercise is about.
 */
export const VRACHTWAGEN = {
  length: 16.5,
  width: 2.55,
  height: 4,
  /** A standard oplegger. Whatever is left of the 16.5 is the trekker in front of it. */
  trailerLength: 13.6,
  /** Underside of the trailer floor, and so the top of the gap you judge the distance by. */
  floor: 1.15,
  cabLength: 2.3,
  cabTop: 3.45,
  /** 315/80R22.5, near enough. The tyre tops out just under the trailer floor, as it should. */
  wheelRadius: 0.52,
};

const TRUCK = {
  cab: '#2f5f8f',
  trailer: '#dcd9d2',
  /** The frame and the doors, a shade off the body so the back reads as a back. */
  door: '#c4c0b7',
  rail: '#a8a49c',
  chassis: '#212429',
  tyre: '#17171a',
  glass: '#2f3b47',
  bumper: '#9aa0a8',
  headlamp: '#efece3',
  /** Dark until it lights: the cluster is there whether the driver is braking or not. */
  tailLight: '#7c1f18',
  brakeLight: '#ff3b30',
};

/**
 * Collects solids by colour and hands back one mesh per colour.
 *
 * A credible truck is thirty-odd boxes, and the mirrors render the whole scene twice more every
 * frame — a mesh apiece would be ninety draw calls for one vehicle. Merging also keeps `dispose()`
 * honest, because each mesh still owns exactly one material.
 */
function solids() {
  const byColour = new Map<string, THREE.BufferGeometry[]>();

  const add = (colour: string, geometry: THREE.BufferGeometry) => {
    const list = byColour.get(colour) ?? [];
    list.push(geometry);
    byColour.set(colour, list);
  };

  /** A box given by the extremes it occupies, which is how every number below was decided. */
  const bounds = (
    colour: string,
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
  ) => {
    const geometry = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    geometry.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    add(colour, geometry);
  };

  return {
    add,
    /** Centred on the vehicle's midline. */
    slab: (colour: string, width: number, y0: number, y1: number, z0: number, z1: number) =>
      bounds(colour, -width / 2, width / 2, y0, y1, z0, z1),
    /** The same box on both flanks; x is given as a distance out from the midline. */
    pair: (
      colour: string,
      x0: number,
      x1: number,
      y0: number,
      y1: number,
      z0: number,
      z1: number,
    ) => {
      bounds(colour, x0, x1, y0, y1, z0, z1);
      bounds(colour, -x1, -x0, y0, y1, z0, z1);
    },
    meshes(name: string): THREE.Mesh[] {
      const out: THREE.Mesh[] = [];
      for (const [colour, geometries] of byColour) {
        const merged = mergeGeometries(geometries, false);
        geometries.forEach((g) => g.dispose());
        if (!merged) continue;
        const mesh = new THREE.Mesh(merged, vehicleMaterial(colour));
        mesh.name = name;
        out.push(mesh);
      }
      return out;
    },
  };
}

/**
 * A trekker-oplegger, modelled facing −z and centred on the actor's own position.
 *
 * Centred, because `ActorSpec.length` is nose to tail and following distance is measured between
 * bumpers: if the mesh sat anywhere else the gap the student is taught to hold would not be the
 * gap they see. Half the length fore, half aft, and nothing to remember at the call site.
 *
 * The detail budget goes to the back. From the saddle this is a wall in the windscreen or a flank
 * in a mirror, and almost never a front — so it gets an onderrijbeveiliging, light clusters at the
 * corners, door leaves inside a frame, and above all a dark gap under the floor. Without that gap
 * a trailer reads as painted scenery standing on the road and its distance cannot be judged at all.
 */
export function createVrachtwagen(): THREE.Group {
  const group = new THREE.Group();
  const { length, width, height, floor, cabLength, cabTop, wheelRadius } = VRACHTWAGEN;

  const nose = -length / 2;
  const tail = length / 2;
  const half = width / 2;
  const trailerFront = tail - VRACHTWAGEN.trailerLength;
  const cabRear = nose + cabLength;
  /** The body is a shade narrower than the legal width; the rub rails are what reach it. */
  const bodyHalf = half - 0.025;
  /** Depth of the door frame at the back, and of the fascia at the front. */
  const skin = 0.07;

  const body = solids();
  const lit = solids();

  // --- oplegger ------------------------------------------------------------
  body.slab(TRUCK.trailer, bodyHalf * 2, floor, height, trailerFront, tail - skin);
  // Rub rails: the widest thing on the vehicle, and the two lines that give the flank its length
  // when it goes past a mirror.
  for (const y of [floor + 0.12, height - 0.24]) {
    body.pair(TRUCK.rail, bodyHalf, half, y, y + 0.12, trailerFront, tail - skin);
  }
  // The belly, painted dark so the gap under the floor is a gap rather than a lit soffit.
  body.slab(TRUCK.chassis, 2.4, floor - 0.07, floor + 0.02, trailerFront, tail - skin);

  // --- the back, which is the face that matters ----------------------------
  // A frame ring rather than a flat panel: the leaves sit a centimetre inside it, and that one
  // step is what stops the rear reading as a decal.
  body.pair(TRUCK.door, bodyHalf - 0.14, bodyHalf, floor, height, tail - skin, tail);
  body.slab(TRUCK.door, bodyHalf * 2, height - 0.13, height, tail - skin, tail);
  body.slab(TRUCK.door, bodyHalf * 2, floor, floor + 0.14, tail - skin, tail);
  body.pair(
    TRUCK.trailer,
    0.04,
    bodyHalf - 0.15,
    floor + 0.15,
    height - 0.14,
    tail - skin + 0.01,
    tail - 0.01,
  );

  // Onderrijbeveiliging, on the drop-down brackets that carry it.
  body.slab(TRUCK.bumper, 2.36, 0.45, 0.66, tail - 0.12, tail);
  body.pair(TRUCK.chassis, 0.72, 0.86, 0.6, floor, tail - 0.14, tail - 0.02);
  // Clusters first, then the brake panels proud of them, so braking changes the colour of
  // something that was already there instead of conjuring a light out of the paint.
  body.pair(TRUCK.tailLight, 0.86, 1.2, 0.72, 1.14, tail - 0.09, tail - 0.01);
  lit.pair(TRUCK.brakeLight, 0.91, 1.15, 0.78, 1.08, tail - 0.05, tail);
  // Spatlappen behind the rear axle: from directly behind, the two dark rectangles under the
  // bumper are most of what says this is a trailer and not a container on a plinth.
  body.pair(TRUCK.chassis, 0.72, 1.2, 0.1, 0.58, 7.44, 7.47);

  // --- trekker -------------------------------------------------------------
  body.slab(TRUCK.cab, 2.5, 0.95, cabTop, nose + skin, cabRear);
  body.slab(TRUCK.glass, 2.3, 2.38, 3.32, nose, nose + skin);
  body.slab(TRUCK.cab, 2.3, 1.22, 2.3, nose, nose + skin);
  body.slab(TRUCK.bumper, 2.5, 0.5, 1, nose, nose + 0.1);
  body.pair(TRUCK.headlamp, 0.72, 1.1, 0.99, 1.19, nose, nose + skin);
  body.pair(TRUCK.glass, 1.22, 1.26, 2.35, 3.1, nose + 0.75, nose + 1.85);
  // The dakspoiler is what makes a cab-over read as a cab-over from behind and to the side. It
  // stops just short of the trailer roof, because a trailer is the tallest thing on the road.
  body.slab(TRUCK.cab, 2.3, cabTop - 0.1, 3.95, cabRear - 1.5, cabRear);

  // --- chassis and running gear --------------------------------------------
  // One beam for both rails: narrow enough to clear the wheels, which is the only thing about it
  // that has to be right.
  body.slab(TRUCK.chassis, 1.6, 0.92, floor, -7, 7.6);

  // Steering axle, drive axle, then the trailer bogie. Five axles is what a 4x2 with a tri-axle
  // oplegger has, and the count is legible from behind in a way the spacing is not.
  const wheelX = 1.03;
  const wheelWidth = 0.45;
  for (const z of [-6.85, -3.15, 4.3, 5.6, 6.9]) {
    for (const side of [1, -1] as const) {
      // 16 segments so a vertex lands exactly at the bottom of the tyre: the truck stands on the
      // road rather than a hair above or below it. Rotating about z lays the axis along x.
      const wheel = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 16);
      wheel.rotateZ(Math.PI / 2);
      wheel.translate(side * wheelX, wheelRadius, z);
      body.add(TRUCK.tyre, wheel);
    }
  }

  for (const mesh of body.meshes('vrachtwagen')) group.add(mesh);
  // One colour, so one mesh — and `placeActor` finds it by that name.
  for (const mesh of lit.meshes('brake')) {
    mesh.visible = false;
    group.add(mesh);
  }
  // The same painted blob the snorfiets gets — the sun's shadow map is frozen after the first
  // frame (see `Stage`), so a moving vehicle has no other way of touching the road. Kept just
  // inside the footprint so it darkens the gap under the floor rather than haloing the truck.
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 16.2),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  group.add(shadow);

  return group;
}

/**
 * The mesh for one road user.
 *
 * Only the two kinds a scenario actually places are modelled. The rest of `ActorKind` falls back
 * to the snorfiets rather than to nothing, so a scenario that names one is visibly wrong instead
 * of invisibly empty.
 */
const AUTO = {
  body: '#8d3f3a',
  roof: '#7c3733',
  glass: '#2f3b47',
  chassis: '#1b1d21',
  tyre: '#17171a',
  trim: '#9aa0a8',
  tailLight: '#7c1f18',
  plate: '#e8e4d8',
};

/**
 * An ordinary hatchback, 4.4 m, modelled facing −z and centred like the truck.
 *
 * It sits ahead of the rider in rijstrook 1 and is the front of the gap being merged into, so it
 * is seen almost exclusively from behind and almost exclusively at distance. The budget therefore
 * goes to the tail: lights at the corners, a plate, and — as with the trailer — a dark gap under
 * the floor, without which a car at eighty metres reads as a decal on the tarmac and its distance
 * cannot be judged.
 */
export function createAuto(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'auto';
  const s = solids();

  const halfL = 4.4 / 2;
  const width = 1.78;

  // Shadow under the sills. The single strongest distance cue on a flat road.
  s.slab(AUTO.chassis, width - 0.16, 0.12, 0.42, -halfL + 0.35, halfL - 0.35);

  s.slab(AUTO.body, width, 0.42, 0.92, -halfL + 0.1, halfL - 0.1);
  // Bonnet and boot are the same band; the greenhouse is what makes it a shape.
  s.slab(AUTO.body, width - 0.06, 0.92, 1.0, -halfL + 0.15, -0.55);
  s.slab(AUTO.body, width - 0.06, 0.92, 1.02, 1.15, halfL - 0.12);
  s.slab(AUTO.roof, width - 0.22, 1.0, 1.44, -0.5, 1.15);

  // Glass, a couple of centimetres proud so it cannot z-fight the body it sits in.
  s.slab(AUTO.glass, width - 0.2, 1.02, 1.4, 1.13, 1.17); // achterruit
  s.slab(AUTO.glass, width - 0.2, 1.02, 1.4, -0.54, -0.5); // voorruit
  s.pair(AUTO.glass, (width - 0.2) / 2, (width - 0.19) / 2, 1.04, 1.36, -0.44, 1.05);

  s.slab(AUTO.trim, width - 0.06, 0.5, 0.66, halfL - 0.16, halfL); // bumper
  s.slab(AUTO.trim, width - 0.06, 0.5, 0.66, -halfL, -halfL + 0.16);
  s.slab(AUTO.plate, 0.52, 0.56, 0.68, halfL - 0.02, halfL + 0.01);
  s.pair(AUTO.tailLight, 0.5, 0.84, 0.72, 0.92, halfL - 0.12, halfL - 0.08);

  const wheel = (x: number, z: number) => {
    const g = new THREE.CylinderGeometry(0.32, 0.32, 0.2, 16);
    g.rotateZ(Math.PI / 2);
    g.translate(x, 0.32, z);
    s.add(AUTO.tyre, g);
  };
  for (const z of [-1.35, 1.32]) for (const x of [-0.82, 0.82]) wheel(x, z);

  for (const mesh of s.meshes('auto')) {
    mesh.castShadow = true;
    group.add(mesh);
  }
  return group;
}

export function createActorMesh(kind: ActorKind): THREE.Group {
  switch (kind) {
    case 'vrachtwagen':
      return createVrachtwagen();
    case 'auto':
      return createAuto();
    default:
      return createSnorfiets();
  }
}

export function placeActor(group: THREE.Group, actor: ActorState) {
  group.position.set(actor.x, 0, -actor.y);
  group.rotation.y = headingToYaw(actor.heading);
  const brake = group.getObjectByName('brake');
  if (brake) brake.visible = actor.mode === 'braking' || actor.mode === 'stopped';
}
