/**
 * What things are made of.
 *
 * The world was one flat `MeshLambertMaterial` per colour: correct, legible, and unmistakably a
 * diagram. These are `MeshStandardMaterial` with albedo, roughness and normal maps, which is what
 * lets tarmac read as tarmac — rough where the tyres have not been, polished in the wheel tracks,
 * and wet or dry depending on the day.
 *
 * **The textures are generated, not loaded.** A file of asphalt would be a megabyte, an asset
 * pipeline, and a thing that can 404; this is a few hundred lines that produce the same tiling
 * detail from a seed. It is the same move `signFaces.ts` already makes for the face of a sign, and
 * it keeps the app one bundle with nothing to fetch.
 *
 * **Tiling is free here, which is why this works at all.** `roadSurfaces` emits polygons in world
 * metres and three's shape geometries carry the shape's own coordinates through as UVs — so `u` is
 * world x and `v` is world y, on every surface, already, even after they are merged by colour. A
 * repeat of `1/n` therefore means "one tile every n metres" everywhere, with no UV work and no
 * unmerging. Check that before assuming a new geometry type will behave.
 *
 * Everything is built on first use and cached by key. A scenario with four hundred metres of
 * carriageway holds one asphalt texture.
 */
import * as THREE from 'three';

/** Texture resolution. 512 at one tile per four metres is about eight pixels to the centimetre. */
const SIZE = 512;

/**
 * A hash-based value noise that **wraps**, which the usual gradient noise does not.
 *
 * Seamlessness is the whole requirement: a road runs six hundred metres and any seam in the tile
 * becomes a rung on a ladder, repeating every four. Wrapping the lattice coordinates by the period
 * is the cheapest way to get it, and it costs nothing at build time.
 */
function hash(x: number, y: number, seed: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

const smooth = (t: number) => t * t * (3 - 2 * t);

function valueNoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const wrap = (v: number) => ((v % period) + period) % period;
  const x0 = wrap(xi), x1 = wrap(xi + 1), y0 = wrap(yi), y1 = wrap(yi + 1);
  const u = smooth(xf), v = smooth(yf);
  const a = hash(x0, y0, seed), b = hash(x1, y0, seed);
  const c = hash(x0, y1, seed), d = hash(x1, y1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** Octaves of wrapping noise, each on a lattice that divides the tile so the sum wraps too. */
function fbm(x: number, y: number, octaves: number, base: number, seed: number): number {
  let sum = 0, amp = 1, norm = 0, period = base;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise((x * period) / SIZE, (y * period) / SIZE, period, seed + o * 17) * amp;
    norm += amp;
    amp *= 0.5;
    period *= 2;
  }
  return sum / norm;
}

interface Recipe {
  colour: string;
  /** How far the noise pushes the colour, 0–1. Tarmac wants a lot; painted lines almost none. */
  mottle: number;
  /** Base lattice: small numbers are broad patches, large are grain. */
  grain: number;
  octaves: number;
  /** Roughness at its smoothest and roughest. */
  roughness: [number, number];
  /** Height relief in the normal map, in arbitrary units — 0 leaves it flat. */
  relief: number;
  /** Metres covered by one tile. */
  tile: number;
  metalness?: number;
  /** Optional pass for anything the noise cannot do: courses of brick, tile rows, kerb joints. */
  detail?: (ctx: CanvasRenderingContext2D, height: Float32Array) => void;
}

function field(recipe: Recipe, seed: number): Float32Array {
  const out = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      out[y * SIZE + x] = fbm(x, y, recipe.octaves, recipe.grain, seed);
    }
  }
  return out;
}

function albedoCanvas(recipe: Recipe, height: Float32Array): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(SIZE, SIZE);
  const base = new THREE.Color(recipe.colour);

  for (let i = 0; i < SIZE * SIZE; i++) {
    // Centred on zero so the mean stays the colour that was asked for: a texture that is uniformly
    // darker than its palette entry silently redecorates the whole street.
    const n = (height[i] - 0.5) * recipe.mottle;
    image.data[i * 4] = clamp255((base.r + n) * 255);
    image.data[i * 4 + 1] = clamp255((base.g + n) * 255);
    image.data[i * 4 + 2] = clamp255((base.b + n) * 255);
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  recipe.detail?.(ctx, height);
  return canvas;
}

function roughnessCanvas(recipe: Recipe, height: Float32Array): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(SIZE, SIZE);
  const [lo, hi] = recipe.roughness;
  for (let i = 0; i < SIZE * SIZE; i++) {
    const v = clamp255((lo + (hi - lo) * height[i]) * 255);
    image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = v;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/**
 * A normal map from the same height field, by finite difference.
 *
 * Derived rather than authored so the bumps in the normal are the bumps in the colour. Two
 * independent noises would give a surface whose shading disagrees with its own grain, which is
 * subtle, wrong, and impossible to point at.
 */
function normalCanvas(height: Float32Array, relief: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(SIZE, SIZE);
  const at = (x: number, y: number) => height[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)];

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * relief;
      const dy = (at(x, y + 1) - at(x, y - 1)) * relief;
      const n = new THREE.Vector3(-dx, -dy, 1).normalize();
      const i = (y * SIZE + x) * 4;
      image.data[i] = (n.x * 0.5 + 0.5) * 255;
      image.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      image.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

function texture(canvas: HTMLCanvasElement, tile: number, srgb: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  // World-space UVs, so this is literally "one tile every `tile` metres".
  t.repeat.set(1 / tile, 1 / tile);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Courses of brick, drawn over the noise. Nothing else says "house" as quickly. */
function brickCourses(rows: number, mortar: string): Recipe['detail'] {
  return (ctx) => {
    const h = SIZE / rows;
    ctx.strokeStyle = mortar;
    ctx.lineWidth = Math.max(1, SIZE / 400);
    ctx.globalAlpha = 0.5;
    for (let r = 0; r <= rows; r++) {
      const y = r * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(SIZE, y);
      ctx.stroke();
      // Every other course offset by half a brick, which is what stops it reading as tiling.
      const offset = r % 2 === 0 ? 0 : h;
      for (let x = offset; x < SIZE; x += h * 2) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + h);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  };
}

/**
 * The recipes. Tile sizes are metres, so they can be reasoned about against the road's own numbers:
 * a 3,5 m lane is a bit under one asphalt tile wide.
 */
const RECIPES: Record<string, Recipe> = {
  asphalt: {
    colour: '#4c4d51', mottle: 0.10, grain: 24, octaves: 5,
    roughness: [0.72, 0.98], relief: 2.2, tile: 4,
  },
  fietspad: {
    colour: '#a04a3f', mottle: 0.075, grain: 28, octaves: 5,
    roughness: [0.78, 0.98], relief: 1.8, tile: 3,
  },
  fietspadEdge: {
    colour: '#b3564a', mottle: 0.06, grain: 28, octaves: 4,
    roughness: [0.8, 0.95], relief: 1.4, tile: 3,
  },
  kerb: {
    colour: '#b7b3a9', mottle: 0.05, grain: 10, octaves: 4,
    roughness: [0.62, 0.85], relief: 1.2, tile: 1.2,
  },
  paint: {
    // Road paint is not white, it is white that has been driven over. A little grain keeps a long
    // line from reading as a laser.
    colour: '#eceae3', mottle: 0.045, grain: 30, octaves: 4,
    roughness: [0.55, 0.85], relief: 0.8, tile: 2.5,
  },
  house: {
    colour: '#c3ab93', mottle: 0.05, grain: 16, octaves: 4,
    roughness: [0.75, 0.95], relief: 1.6, tile: 2.4,
    detail: brickCourses(12, '#8d7660'),
  },
  houseAlt: {
    colour: '#b09a86', mottle: 0.05, grain: 16, octaves: 4,
    roughness: [0.78, 0.95], relief: 1.6, tile: 2.4,
    detail: brickCourses(12, '#7d6957'),
  },
  roof: {
    colour: '#7d5a4a', mottle: 0.09, grain: 20, octaves: 4,
    roughness: [0.7, 0.92], relief: 2.6, tile: 1.6,
  },
  hedge: {
    colour: '#5f7f4d', mottle: 0.16, grain: 40, octaves: 5,
    roughness: [0.9, 1], relief: 3.2, tile: 1.4,
  },
  tree: {
    colour: '#3f6b42', mottle: 0.17, grain: 36, octaves: 5,
    roughness: [0.9, 1], relief: 3, tile: 2.6,
  },
  grass: {
    colour: '#7d9c66', mottle: 0.13, grain: 44, octaves: 5,
    roughness: [0.88, 1], relief: 2.4, tile: 3,
  },
  guardrail: {
    colour: '#8b9099', mottle: 0.035, grain: 14, octaves: 3,
    roughness: [0.34, 0.6], relief: 0.7, tile: 2, metalness: 0.85,
  },
  hectometerPost: {
    colour: '#1f6b3a', mottle: 0.04, grain: 12, octaves: 3,
    roughness: [0.5, 0.75], relief: 0.6, tile: 1,
  },
  signPost: {
    colour: '#8a8f96', mottle: 0.03, grain: 12, octaves: 3,
    roughness: [0.4, 0.65], relief: 0.5, tile: 1, metalness: 0.7,
  },
};

const cache = new Map<string, THREE.MeshStandardMaterial>();
/** Tarmac takes on water; brick does not. Only these follow `wetness`. */
const WETTABLE = new Set(['asphalt', 'fietspad', 'fietspadEdge', 'paint']);
const dryRoughness = new WeakMap<THREE.MeshStandardMaterial, number>();

/**
 * The material for a named surface kind, built once.
 *
 * Falls back to a plain colour for anything with no recipe, so a new surface kind renders as a
 * solid rather than as an error — visibly unfinished, which is the right failure.
 */
export function surfaceMaterial(key: string, colour: string): THREE.MeshStandardMaterial {
  const hit = cache.get(key);
  if (hit) return hit;

  const recipe = RECIPES[key];
  if (!recipe) {
    const plain = new THREE.MeshStandardMaterial({ color: new THREE.Color(colour), roughness: 0.9 });
    cache.set(key, plain);
    return plain;
  }

  const seed = [...key].reduce((a, c) => a + c.charCodeAt(0), 0);
  const height = field(recipe, seed);
  const material = new THREE.MeshStandardMaterial({
    map: texture(albedoCanvas(recipe, height), recipe.tile, true),
    roughnessMap: texture(roughnessCanvas(recipe, height), recipe.tile, false),
    normalMap: recipe.relief > 0 ? texture(normalCanvas(height, recipe.relief), recipe.tile, false) : null,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 1,
    metalness: recipe.metalness ?? 0,
  });
  dryRoughness.set(material, 1);
  cache.set(key, material);
  return material;
}

/**
 * Make the tarmac wet, or dry it again.
 *
 * Only roughness moves — a wet road is a smoother road, so the sky lands in it. Nothing about the
 * geometry or the fog changes, because visibility is not a thing this is allowed to touch.
 */
export function setWetness(_world: THREE.Object3D, wetness: number) {
  for (const [key, material] of cache) {
    if (!WETTABLE.has(key)) continue;
    const dry = dryRoughness.get(material) ?? 1;
    material.roughness = dry * (1 - 0.72 * wetness);
    material.metalness = 0.15 * wetness;
    material.needsUpdate = true;
  }
}

export function disposeMaterials() {
  for (const material of cache.values()) {
    material.map?.dispose();
    material.roughnessMap?.dispose();
    material.normalMap?.dispose();
    material.dispose();
  }
  cache.clear();
}
