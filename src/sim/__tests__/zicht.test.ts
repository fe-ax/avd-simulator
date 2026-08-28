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
import { findHiddenReveals } from '../validate';

const EXTENT = { minX: -140, maxX: 260, minY: -160, maxY: 140 };

describe('auto van rechts: de zichtlijn', () => {
  const { record } = referenceRide(autoVanRechts);
  const track = record.actorTracks['weggebruiker-1'];
  const brakesAt = track.find((a) => a.mode === 'braking')?.t ?? null;
  const perceivedAt = track.find((a) => a.perceived)?.t ?? null;
  const unobstructed = perceivedAt;

  it('de auto is echt te zien, niet alleen volgens het model', () => {
    // Asked through the same function the builder's panel uses, rather than a second copy of the
    // idea living in a test. The first copy here had the bug that one had: it took the start of the
    // *last* unbroken sight line, so a house crossing the line after the encounter reported the car
    // as never visible. One definition, one behaviour.
    const labels = Object.fromEntries(autoVanRechts.actors.map((a) => [a.id, a.label]));
    expect(findHiddenReveals(autoVanRechts.world, record, labels, EXTENT)).toEqual([]);
  });

  it('en vóórdat hij op de rem gaat', () => {
    // Being shown a car that is already stopping teaches nothing: the reading has been done for you.
    //
    // This used to demand two and a half seconds, from when the lesson was "read a car coming at
    // you too fast". The exercise is a different shape now — he arrives, brakes and is standing
    // across your lane before you get to the junction — so what the rider watches is the whole
    // event rather than an approach. The budget is fixed and small: the model rider first looks
    // right at 3,4 s and reaches the junction at 8,5, and braking from 87,5 km/h at 8 m/s² eats
    // three of those five seconds on its own.
    expect(brakesAt! - unobstructed!).toBeGreaterThan(0.5);
  });

  it('en staat stil vóórdat de rijder het kruispunt bereikt — dat is de opdracht', () => {
    // The headline of this design, and the reason the numbers are where they are: the whole thing
    // is over before you arrive, so what you meet is a car parked across your lane rather than one
    // still coming. Measured against the rider who never slows, because they get there first.
    const { record } = referenceRide(autoVanRechts, { anticipate: false });
    const stopped = record.actorTracks['weggebruiker-1'].find((a) => a.mode === 'stopped');
    const arrives = record.samples.find((s) => s.d <= 0);
    expect(stopped).toBeDefined();
    expect(arrives).toBeDefined();
    expect(arrives!.t - stopped!.t).toBeGreaterThan(0.5);
  });

  it('en hij remt als een noodstop, niet als iemand die je zag aankomen', () => {
    const at = (t: number) => track.find((a) => a.t >= t)!;
    const from = at(brakesAt!);
    const to = at(brakesAt! + 1);
    // Roughly the 8 m/s² the cue asks for: 0,8g, which is dry tarmac and everything locked up.
    expect((from.speed - to.speed) / 1).toBeGreaterThan(7);
  });

  it('en komt met zijn voorwielen ruim over de haaientanden tot stilstand', () => {
    // The teeth run from x=3.6 to their apex at x=3.0, and the carriageway edge is x=3. A car that
    // stops before them has given way, which is not what this driver does: he arrives far too fast,
    // stands on everything, and ends up over the line and into the junction. Front axle is roughly
    // 0,7 m behind the nose.
    const stopped = track.find((a) => a.mode === 'stopped');
    expect(stopped).toBeDefined();
    const nose = stopped!.x - 2.2;
    const frontAxle = nose + 0.7;
    expect(frontAxle).toBeLessThan(3.0);
    // But not so far that he is parked in the wheel track — see the clearance test below.
    expect(nose).toBeGreaterThan(1.9);
  });

  it('en zet hem daarna weer achteruit, tot achter de tanden', () => {
    // The correction is the character note: he knows he has overshot. It is also the only cue in
    // the scenario anchored to the clock rather than to the road, because a car that has stopped
    // never reaches another distance.
    const reversed = track.find((a) => a.mode === 'reversing');
    expect(reversed).toBeDefined();
    const stopped = track.find((a) => a.mode === 'stopped')!;
    expect(reversed!.t - stopped.t).toBeGreaterThanOrEqual(1);

    const nose = track[track.length - 1].x - 2.2;
    // The teeth run from 3,6 to their apex at 3,0. Behind them means east of the line he crossed.
    expect(nose).toBeGreaterThan(3.6);
  });
});

/**
 * The point of the exercise: it only ends well because he stopped.
 *
 * As first built the car stopped short of the carriageway and a rider who ignored it entirely
 * sailed through with room to spare and a pass. Nothing was ever nearly hit, so the reason to read
 * the road was theoretical.
 */
describe('auto van rechts: de bijna-aanrijding', () => {
  const CAR_L = 4.4, CAR_W = 1.8, BIKE_L = 2.3, BIKE_W = 0.8;
  /** Both bodies are axis-aligned here — one heads north, the other west. */
  const gap = (bx: number, by: number, ax: number, ay: number) =>
    Math.max(
      Math.abs(ax - bx) - (CAR_L / 2 + BIKE_W / 2),
      Math.abs(ay - by) - (CAR_W / 2 + BIKE_L / 2),
    );

  const closest = (plan: object) => {
    const r = referenceRide(autoVanRechts, plan).record;
    const t = r.actorTracks['weggebruiker-1'];
    let best = Infinity;
    for (const s of r.samples) {
      const a = t.find((x) => x.t >= s.t);
      if (a) best = Math.min(best, gap(s.x, s.y, a.x, a.y));
    }
    return { gap: best, record: r };
  };

  it('en de rijder moet er echt omheen: hij staat er nog als je aankomt', () => {
    // A rider who keeps going meets it stopped and squeezes past with centimetres. Not a collision
    // — it is stationary and they pass behind its nose — but nothing about it is comfortable.
    const { gap: g } = closest({ anticipate: false });
    expect(g).toBeGreaterThan(0);
    expect(g).toBeLessThan(1);
  });

  // What used to be here: "zonder die noodstop had hij de rijder geraakt", asserting that an
  // unbraked car and the rider genuinely overlap. That was true of a design where the car arrived
  // *with* the rider. It does not arrive with them any more — it is finished and standing still
  // before they get to the junction — so an unbraked car is twenty metres clear and the assertion
  // was measuring nothing. What replaced it is above: it has to be stopped before the rider
  // arrives, and the rider has to get past it.

  it('wie gewoon doorrijdt, scheert er rakelings langs', () => {
    const { gap: g } = closest({ anticipate: false });
    expect(g).toBeGreaterThan(0);
    expect(g).toBeLessThan(4);
  });

  it('en zakt daarvoor, want alleen zijn rem heeft dat opgelost', () => {
    const { record: r } = closest({ anticipate: false });
    expect(r.verdict).toBe('gezakt');
    expect(r.counts.kritiek).toBe(1);
  });

  it('wie hem wél leest, komt er langs zonder dat het spannend wordt', () => {
    const { gap: g, record: r } = closest({});
    expect(r.verdict).toBe('geslaagd');
    expect(r.counts).toEqual({ opmerking: 0, fout: 0, kritiek: 0 });
    // Still has to pick its way past a car stopped over the line, which is the point.
    expect(g).toBeGreaterThan(0);
  });
});
