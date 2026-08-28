/**
 * The signs the roads carry, and the one thing that matters about them: they are **derived**.
 *
 * A sign is the only object in this project that states a rule in words. That makes it the one
 * that can lie — a 50 on a road scored against 30, a give-way plate on the arm with priority — and
 * a lie of that kind is worse than no sign at all, because a student will believe it over the
 * briefing. So nothing here checks that a sign exists at some remembered coordinate. Every test
 * asks whether the sign still agrees with the thing it is derived from.
 *
 * The strongest of them is the give-way pair: the B6 and the haaientanden come off one field, and
 * the test asserts they are in the same half of the same arm rather than asserting a side. Flip
 * `giveWay` and both move together, or this goes red.
 *
 * The faces themselves are pixels and there is no canvas under jsdom, so what a "50" *looks* like
 * is verified in the browser instead — see the commit that added this.
 */
import { describe, expect, it } from 'vitest';
import { junctionGiveWay, junctionSigns } from '../surfaces/junction';
import { PLATE_CLEARANCE, POST } from '../surfaces/signs';
import { roadSurfaces, type SignFace, type Surface } from '../roadSurfaces';
import { ALL_SCENARIOS } from '../scenarios';
import { referenceRide } from '../referenceRide';
import { buildRoutes } from '../route';
import { findHiddenReveals, findObstructions } from '../validate';
import type { JunctionRoad, Scenario } from '../types';

const road: JunctionRoad = { halfWidth: 3, sideHalfWidth: 3, vergeTo: 11 };

const centre = (s: Surface) => ({
  x: (Math.min(...s.points.map((p) => p.x)) + Math.max(...s.points.map((p) => p.x))) / 2,
  y: (Math.min(...s.points.map((p) => p.y)) + Math.max(...s.points.map((p) => p.y))) / 2,
});

/** Every sign on a scenario's roads, with the extent taken from where the machine actually goes. */
function signsOf(scenario: Scenario): Surface[] {
  const { record } = referenceRide(scenario);
  const xs = record.samples.map((s) => s.x);
  const ys = record.samples.map((s) => s.y);
  const ext = {
    minX: Math.min(...xs) - 120, maxX: Math.max(...xs) + 120,
    minY: Math.min(...ys) - 120, maxY: Math.max(...ys) + 120,
  };
  return roadSurfaces(scenario.world, ext, scenario.speedLimitKmh).filter((s) => s.sign);
}

const facesOf = (scenario: Scenario): SignFace[] => {
  const seen = new Map<string, SignFace>();
  for (const s of signsOf(scenario)) seen.set(JSON.stringify(s.sign), s.sign!);
  return [...seen.values()];
};

describe('een bord zegt hetzelfde als het wegdek', () => {
  it('zet het haaientandenbord in dezelfde helft als de tanden zelf', () => {
    // The pair that must never disagree. Both come off `giveWay`; asserting a side here instead
    // would let one of them move without the other and still pass.
    const teeth = junctionGiveWay(road, 'side');
    const b6 = junctionSigns(road, 'side').filter((s) => s.sign?.type === 'giveWay');
    expect(b6).toHaveLength(2);

    for (const sign of b6) {
      const at = centre(sign);
      // The teeth painted in the same arm — the ones on this side of the main road.
      const arm = teeth.filter((t) => Math.sign(centre(t).x) === Math.sign(at.x));
      expect(arm.length).toBeGreaterThan(0);
      for (const tooth of arm) {
        expect(Math.sign(centre(tooth).y)).toBe(Math.sign(at.y));
      }
    }
  });

  it('en verhuist mee als de voorrang omdraait', () => {
    // The mutation the derivation exists for: with `main` the rider gives way, so the triangle
    // belongs on the rider's own road and the diamond on the side road.
    const side = junctionSigns(road, 'side').filter((s) => s.sign?.type === 'giveWay').map(centre);
    const main = junctionSigns(road, 'main').filter((s) => s.sign?.type === 'giveWay').map(centre);
    expect(side).not.toEqual(main);
    // On `side` the triangles stand off along x, beside the side road; on `main` they stand off
    // along y, beside the rider's road. Which is to say: they swapped arms.
    expect(side.every((p) => Math.abs(p.x) > Math.abs(p.y))).toBe(true);
    expect(main.every((p) => Math.abs(p.y) > Math.abs(p.x))).toBe(true);
  });

  it('en kijkt het bord de kant op waar dat verkeer vandaan komt', () => {
    // Traffic reaching the east mouth is heading west, so its sign has to look east, at it.
    const b6 = junctionSigns(road, 'side').filter((s) => s.sign?.type === 'giveWay');
    const east = b6.find((s) => centre(s).x > 0);
    const west = b6.find((s) => centre(s).x < 0);
    expect(east?.facing).toBe('east');
    expect(west?.facing).toBe('west');
  });

  it('zet geen voorrangsborden neer waar niemand voorrang heeft', () => {
    const none = junctionSigns(road, 'none').map((s) => s.sign?.type);
    expect(none).not.toContain('giveWay');
    expect(none).not.toContain('priorityRoad');
  });
});

describe('het snelheidsbord is de limiet, niet een tweede exemplaar ervan', () => {
  it.each(ALL_SCENARIOS.map((s) => [s.title, s] as const))(
    '%s toont zijn eigen limiet',
    (_t, scenario) => {
      const limit = facesOf(scenario).find((f) => f.type === 'speedLimit');
      expect(limit).toEqual({ type: 'speedLimit', kmh: scenario.speedLimitKmh });
    },
  );

  it('en zonder limiet komt er geen bord in plaats van een verzonnen getal', () => {
    // `roadSurfaces` is handed a world, not a scenario, so the validators call it without one. A
    // sign that guessed would be the worst possible failure of this whole feature.
    const scenario = ALL_SCENARIOS[0];
    const ext = { minX: -120, maxX: 120, minY: -160, maxY: 120 };
    const guessed = roadSurfaces(scenario.world, ext).filter((s) => s.sign?.type === 'speedLimit');
    expect(guessed).toEqual([]);
  });
});

describe('elk scenario draagt de borden die bij zijn weg horen', () => {
  const expected: Record<string, SignFace['type'][]> = {
    'rechtsaf-fietspad-v1': ['speedLimit', 'cyclePath'],
    'auto-van-rechts-v1': ['speedLimit', 'priorityRoad', 'giveWay'],
    'invoegen-snelweg-v1': ['speedLimit'],
    'inhalen-snelweg-v1': ['speedLimit'],
    'uitvoegen-snelweg-v1': ['speedLimit', 'exit'],
  };

  it.each(ALL_SCENARIOS.map((s) => [s.id, s] as const))('%s', (id, scenario) => {
    const types = [...new Set(facesOf(scenario).map((f) => f.type))].sort();
    expect(types).toEqual([...expected[id]].sort());
  });

  it('en de afrit draagt de richting die erin getypt is', () => {
    const board = facesOf(ALL_SCENARIOS.find((s) => s.id === 'uitvoegen-snelweg-v1')!)
      .find((f) => f.type === 'exit');
    expect(board).toMatchObject({ destination: 'Deventer' });
  });

  it('en dat bord staat op twee palen, want het is één bord', () => {
    const scenario = ALL_SCENARIOS.find((s) => s.id === 'uitvoegen-snelweg-v1')!;
    const posts = signsOf(scenario).filter((s) => s.sign?.type === 'exit');
    expect(posts).toHaveLength(2);
    // Same face and same place along the road, which is what the renderer groups them by.
    expect(posts[0].sign).toEqual(posts[1].sign);
    expect(centre(posts[0]).y).toBeCloseTo(centre(posts[1]).y, 1);
  });
});

describe('het bord hangt vóór zijn eigen paal', () => {
  it('staat verder van het hart van de paal dan de paal zelf reikt', () => {
    // A post has depth, and a plate hung less proud than half of it comes out with a grey stripe
    // down the middle of the sign. The renderer used to pick five centimetres against a post whose
    // front face is already six from its centre. Read as a gap in a colour rather than as a bug,
    // which is how it survived being looked at and not measured.
    expect(PLATE_CLEARANCE).toBeGreaterThan(POST.side / 2);
  });
});

describe('borden veranderen niets aan de rit', () => {
  it.each(ALL_SCENARIOS.map((s) => [s.title, s] as const))(
    '%s: niets staat in de weg en niets verstopt zich erachter',
    (_t, scenario) => {
      const { record } = referenceRide(scenario);
      const xs = record.samples.map((s) => s.x);
      const ys = record.samples.map((s) => s.y);
      const ext = {
        minX: Math.min(...xs) - 120, maxX: Math.max(...xs) + 120,
        minY: Math.min(...ys) - 120, maxY: Math.max(...ys) + 120,
      };
      // Signs stand up, so `findObstructions` polices them for free — the same check that caught
      // the hedges and the kerb arc.
      expect(findObstructions(scenario.world, buildRoutes(scenario), ext)).toEqual([]);
      // And a plate on a pole hides nothing: a four-metre exit board left in the occluder set
      // would report the lorry beyond it as standing behind a building.
      const labels = Object.fromEntries(scenario.actors.map((a) => [a.id, a.label]));
      expect(findHiddenReveals(scenario.world, record, labels, ext)).toEqual([]);
    },
  );
});
