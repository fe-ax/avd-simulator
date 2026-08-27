/**
 * Can the rider actually see the car before it brakes?
 *
 * Perception is purely angular. `perception.ts` asks about bearing and distance and knows nothing
 * about buildings, so a house standing in the way is something the rider sees and the model does
 * not — and nothing anywhere else in the suite would notice. On *Auto van rechts remt* that
 * divergence was the exercise: the model credited the car as seen at 3,4 s, the terraces hid it
 * until 7,4 s, and the car began braking at 6,5 s. You were marked on reading a hazard that was
 * behind a house until after it had reacted. A trick question, and it measured as a clean ride.
 *
 * So this asks the question the scoring cannot: trace the line from the rider to the car and see
 * whether anything tall is in the way. It is a sampled segment test against house footprints —
 * crude, and enough, because the failure it guards against is measured in whole seconds.
 */
import { describe, expect, it } from 'vitest';
import { referenceRide } from '../referenceRide';
import { autoVanRechts } from '../scenario.auto-van-rechts';
import { roadSurfaces } from '../roadSurfaces';
import type { Vec2 } from '../types';

const EXTENT = { minX: -140, maxX: 260, minY: -160, maxY: 140 };

/** Anything a car hides behind. A one-metre hedge does not hide one from a rider 1,6 m up. */
function tallThings(): Vec2[][] {
  return roadSurfaces(autoVanRechts.world, EXTENT)
    .filter((s) => s.height > 2)
    .map((s) => s.points);
}

function lineBlocked(a: Vec2, b: Vec2, boxes: Vec2[][]): boolean {
  for (let t = 0.02; t < 1; t += 0.01) {
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    for (const box of boxes) {
      const xs = box.map((p) => p.x);
      const ys = box.map((p) => p.y);
      if (x >= Math.min(...xs) && x <= Math.max(...xs) && y >= Math.min(...ys) && y <= Math.max(...ys)) {
        return true;
      }
    }
  }
  return false;
}

describe('auto van rechts: de zichtlijn', () => {
  const { record } = referenceRide(autoVanRechts);
  const track = record.actorTracks['weggebruiker-1'];
  const boxes = tallThings();

  /** First moment the car is unobstructed and stays that way. */
  let unobstructed: number | null = null;
  for (const s of record.samples) {
    const a = track.find((x) => x.t >= s.t);
    if (!a) continue;
    if (lineBlocked({ x: s.x, y: s.y }, { x: a.x, y: a.y }, boxes)) unobstructed = null;
    else if (unobstructed === null) unobstructed = s.t;
  }
  const brakesAt = track.find((a) => a.mode === 'braking')?.t ?? null;
  const perceivedAt = track.find((a) => a.perceived)?.t ?? null;

  it('de auto is echt te zien, niet alleen volgens het model', () => {
    expect(unobstructed).not.toBeNull();
    // Within half a second of when perception credits it. Further apart than that and the model is
    // marking a look the screen makes impossible, which is the whole failure this file exists for.
    expect(Math.abs(unobstructed! - perceivedAt!)).toBeLessThan(0.6);
  });

  it('en ruim vóórdat hij op de rem gaat, want dát is de les', () => {
    // The rider has to watch it come at them too fast and decide. Being shown a car that is already
    // stopping teaches nothing: the reading has been done for you.
    expect(brakesAt! - unobstructed!).toBeGreaterThan(2.5);
  });

  it('en hij remt als een noodstop, niet als iemand die je zag aankomen', () => {
    const at = (t: number) => track.find((a) => a.t >= t)!;
    const from = at(brakesAt!);
    const to = at(brakesAt! + 1);
    // Roughly the 8 m/s² the cue asks for: 0,8g, which is dry tarmac and everything locked up.
    expect((from.speed - to.speed) / 1).toBeGreaterThan(7);
  });

  it('en staat stil vóór de rijbaan, niet erop', () => {
    const stopped = track.find((a) => a.mode === 'stopped');
    expect(stopped).toBeDefined();
    // halfWidth is 3, so anything under that is on the carriageway the rider is using.
    expect(stopped!.x).toBeGreaterThan(4);
  });
});
