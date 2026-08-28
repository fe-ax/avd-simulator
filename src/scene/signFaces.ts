/**
 * Drawing the face of a road sign, once per distinct sign, onto a canvas.
 *
 * These are the first glyphs in the world rather than on the cowl. The technique is the one
 * `instrument.ts` already uses — draw to a 2D canvas, hand it to three as a `CanvasTexture` — and
 * the reason it is needed at all is that `buildWorld` merges everything into one mesh per colour,
 * which can carry a shape but not a "50" or a "Deventer".
 *
 * **Cached by what the sign says, not by which sign it is.** A motorway with four 100-signs on it
 * wants one texture, and an author who edits the destination wants a new one — so the key is the
 * face's own content and nothing else.
 *
 * Colours come from `palette.ts` like everything both renderers share. The proportions here are
 * RVV-ish rather than exact: a sign is read at forty metres through a 55° field, where the ring
 * width that matters is the one that still reads as a ring.
 */
import * as THREE from 'three';
import type { SignFace } from '../sim/roadSurfaces';
import { PALETTE } from '../palette';

/** Pixels across the drawn face. Enough that a "130" stays sharp when it fills the screen. */
const SIZE = 256;

/** What makes two signs the same sign, for caching. */
function keyOf(face: SignFace): string {
  switch (face.type) {
    case 'speedLimit':
      return `speedLimit:${face.kmh}`;
    case 'exit':
      return `exit:${face.destination}:${face.exitNumber ?? ''}`;
    default:
      return face.type;
  }
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * A bicycle, in the few strokes that survive being 30 px tall.
 *
 * Two wheels, a frame and a bar. Anything more detailed disappears at the distance this is read
 * from and only costs fidelity where it cannot be seen.
 */
function bicycle(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number) {
  const r = w * 0.19;
  ctx.strokeStyle = PALETTE.signWhite;
  ctx.lineWidth = w * 0.05;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const dx of [-w * 0.29, w * 0.29]) {
    ctx.beginPath();
    ctx.arc(cx + dx, cy + r * 0.5, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.29, cy + r * 0.5);
  ctx.lineTo(cx - w * 0.05, cy + r * 0.5);
  ctx.lineTo(cx + w * 0.06, cy - r * 0.5);
  ctx.lineTo(cx + w * 0.29, cy + r * 0.5);
  ctx.moveTo(cx - w * 0.05, cy + r * 0.5);
  ctx.lineTo(cx + w * 0.16, cy - r * 0.5);
  ctx.stroke();
  // Handlebar and saddle: the two marks that stop it reading as a pair of spectacles.
  ctx.beginPath();
  ctx.moveTo(cx + w * 0.1, cy - r * 0.62);
  ctx.lineTo(cx + w * 0.22, cy - r * 0.62);
  ctx.moveTo(cx - w * 0.12, cy - r * 0.55);
  ctx.lineTo(cx + w * 0.01, cy - r * 0.55);
  ctx.stroke();
}

/** Shrink the type until the word fits the board, rather than letting it run off the edge. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, start: number): number {
  let px = start;
  do {
    ctx.font = `600 ${px}px "Helvetica Neue", Arial, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) return px;
    px -= 2;
  } while (px > 8);
  return px;
}

function draw(face: SignFace): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  // The board is a wide rectangle; everything else is square. Drawing them all square and
  // stretching would leave the destination unreadable and the ring an oval.
  const wide = face.type === 'exit';
  canvas.width = wide ? SIZE * 2.6 : SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;

  switch (face.type) {
    case 'speedLimit': {
      ctx.fillStyle = PALETTE.signWhite;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, h * 0.47, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PALETTE.signRed;
      ctx.lineWidth = h * 0.13;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, h * 0.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#101114';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const px = fitText(ctx, String(face.kmh), h * 0.56, h * 0.52);
      ctx.font = `700 ${px}px "Helvetica Neue", Arial, sans-serif`;
      ctx.fillText(String(face.kmh), w / 2, h / 2 + h * 0.03);
      break;
    }
    case 'priorityRoad': {
      // B1: a square stood on its point. White border, yellow middle.
      ctx.translate(w / 2, h / 2);
      ctx.rotate(Math.PI / 4);
      const outer = h * 0.66;
      ctx.fillStyle = PALETTE.signWhite;
      ctx.fillRect(-outer / 2, -outer / 2, outer, outer);
      const inner = outer * 0.72;
      ctx.fillStyle = PALETTE.signYellow;
      ctx.fillRect(-inner / 2, -inner / 2, inner, inner);
      break;
    }
    case 'giveWay': {
      // B6: point down, white with a red border. The border is thick — it is most of the sign.
      const r = h * 0.46;
      const pts: [number, number][] = [
        [w / 2, h / 2 + r],
        [w / 2 - r * 0.95, h / 2 - r * 0.72],
        [w / 2 + r * 0.95, h / 2 - r * 0.72],
      ];
      ctx.beginPath();
      ctx.moveTo(...pts[0]);
      ctx.lineTo(...pts[1]);
      ctx.lineTo(...pts[2]);
      ctx.closePath();
      ctx.fillStyle = PALETTE.signRed;
      ctx.fill();
      ctx.fillStyle = PALETTE.signWhite;
      ctx.beginPath();
      const k = 0.66;
      // The *centroid*, so the inner triangle shrinks toward the middle and leaves an even border.
      // Guessing at it left the red thicker on one side, which reads as a badly made sign rather
      // than as a bug — the kind of wrong that survives because nothing looks obviously broken.
      const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3;
      const cy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
      ctx.moveTo(cx + (pts[0][0] - cx) * k, cy + (pts[0][1] - cy) * k);
      ctx.lineTo(cx + (pts[1][0] - cx) * k, cy + (pts[1][1] - cy) * k);
      ctx.lineTo(cx + (pts[2][0] - cx) * k, cy + (pts[2][1] - cy) * k);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'cyclePath': {
      ctx.fillStyle = PALETTE.signBlue;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, h * 0.47, 0, Math.PI * 2);
      ctx.fill();
      bicycle(ctx, w / 2, h / 2, h * 0.72);
      break;
    }
    case 'exit': {
      ctx.fillStyle = PALETTE.signBlue;
      roundedRect(ctx, 0, 0, w, h, h * 0.08);
      ctx.fill();
      ctx.strokeStyle = PALETTE.signWhite;
      ctx.lineWidth = h * 0.035;
      roundedRect(ctx, h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1, h * 0.06);
      ctx.stroke();

      ctx.fillStyle = PALETTE.signWhite;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      const px = fitText(ctx, face.destination, w * 0.62, h * 0.4);
      ctx.font = `600 ${px}px "Helvetica Neue", Arial, sans-serif`;
      ctx.fillText(face.destination, h * 0.18, h * 0.46);

      if (face.exitNumber !== undefined && face.exitNumber !== '') {
        ctx.textAlign = 'right';
        ctx.font = `700 ${h * 0.26}px "Helvetica Neue", Arial, sans-serif`;
        ctx.fillText(face.exitNumber, w - h * 0.2, h * 0.28);
      }
      // The arrow that says which way the exit leaves: down and to the right, as on the road.
      ctx.strokeStyle = PALETTE.signWhite;
      ctx.lineWidth = h * 0.07;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(w - h * 0.55, h * 0.58);
      ctx.lineTo(w - h * 0.25, h * 0.84);
      ctx.moveTo(w - h * 0.25, h * 0.84);
      ctx.lineTo(w - h * 0.25, h * 0.6);
      ctx.moveTo(w - h * 0.25, h * 0.84);
      ctx.lineTo(w - h * 0.49, h * 0.84);
      ctx.stroke();
      break;
    }
  }

  return canvas;
}

const cache = new Map<string, THREE.MeshBasicMaterial>();

/**
 * The material for a sign's face, shared between every sign that says the same thing.
 *
 * `MeshBasicMaterial` rather than Lambert: a retroreflective sign is about the only thing on a road
 * that genuinely does not take the light, and shading one makes it read as a painted board.
 * `alphaTest` rather than blending, so the transparent corners of a disc or a triangle do not have
 * to be depth-sorted against the world behind them.
 */
export function signMaterial(face: SignFace): THREE.MeshBasicMaterial {
  const key = keyOf(face);
  const hit = cache.get(key);
  if (hit) return hit;

  const texture = new THREE.CanvasTexture(draw(face));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.5 });
  cache.set(key, mat);
  return mat;
}

/** Only for tests: the face as pixels, so a "50" can be proved to be on the sign. */
export function drawSignFace(face: SignFace): HTMLCanvasElement {
  return draw(face);
}
