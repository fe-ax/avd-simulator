/**
 * A long vehicle in a projective view is a trapezoid, not a rectangle.
 *
 * The plan view draws sprites under one transform taken at the vehicle's centre, which is right
 * for a snorfiets and wrong for a sixteen-metre trekker-oplegger: its two ends sit at genuinely
 * different depths, so the tail must come out wider on screen than the cab. Drawn rigid it reads
 * as a rectangle pasted on the tarmac rather than lying on it.
 */
import { describe, expect, test } from 'vitest';
import { Camera } from '../camera';

/** The four corners of a body `length` by `width`, centred on a pose heading north. */
function corners(x: number, y: number, length: number, width: number) {
  const half = width / 2;
  const nose = length / 2;
  // Heading north: forward is +y, the vehicle's right is +x.
  return {
    noseLeft: { x: x - half, y: y + nose },
    noseRight: { x: x + half, y: y + nose },
    tailLeft: { x: x - half, y: y - nose },
    tailRight: { x: x + half, y: y - nose },
  };
}

function screenWidths(cam: Camera, x: number, y: number, length: number, width: number) {
  const c = corners(x, y, length, width);
  const p = (v: { x: number; y: number }) => cam.project(v.x, v.y);
  return {
    nose: Math.abs(p(c.noseRight).x - p(c.noseLeft).x),
    tail: Math.abs(p(c.tailRight).x - p(c.tailLeft).x),
  };
}

function northbound(): Camera {
  const cam = new Camera();
  cam.resize(900, 700);
  cam.x = 0;
  cam.y = 0;
  cam.yaw = Math.PI / 2;
  return cam;
}

describe('perspectief van een lang voertuig', () => {
  test('de achterkant is duidelijk breder dan de voorkant', () => {
    const cam = northbound();
    // A trekker-oplegger, thirty metres up the road.
    const { nose, tail } = screenWidths(cam, 0, 30, 16.5, 2.55);
    expect(tail).toBeGreaterThan(nose);
    // And by an amount you can see, not a rounding difference: over a fifth.
    expect(tail / nose).toBeGreaterThan(1.2);
  });

  test('bij een snorfiets maakt het vrijwel niets uit', () => {
    const cam = northbound();
    const { nose, tail } = screenWidths(cam, 0, 30, 1.8, 0.64);
    // Under a pixel, which is why one transform taken at the centre was fine for years — and why
    // it stopped being fine the moment something sixteen metres long turned up.
    expect(Math.abs(tail - nose)).toBeLessThan(1);
    expect(tail).toBeGreaterThan(nose);
  });

  test('en het verschil groeit naarmate het voertuig dichterbij komt', () => {
    const cam = northbound();
    const far = screenWidths(cam, 0, 60, 16.5, 2.55);
    const near = screenWidths(cam, 0, 12, 16.5, 2.55);
    expect(near.tail / near.nose).toBeGreaterThan(far.tail / far.nose);
  });
});
