/**
 * A builder that cannot reproduce its own input is not going to produce anything else correctly
 * either, so that is the test: export a scenario that ships, evaluate the source it emits, and
 * check what comes back is the scenario that went in.
 */
import { describe, expect, test } from 'vitest';
import { exportScenario, overridesOf, toSource, deepEqual } from '../scenarioExport';
import { rechtsafFietspad } from '../scenario.rechtsaf-fietspad';
import { invoegenSnelweg } from '../scenario.invoegen-snelweg';
import { blankJunction } from '../starters';
import type { Scenario } from '../types';

/** Evaluate an emitted object literal. It is data, and this proves the source really parses. */
function evaluate(literal: string): unknown {
  return new Function(`return (${literal});`)();
}

const BASES: [string, Scenario, string, string][] = [
  ['Rechtsaf de Kerkstraat in', rechtsafFietspad, 'scenario.rechtsaf-fietspad', 'rechtsafFietspad'],
  ['Invoegen op de A12', invoegenSnelweg, 'scenario.invoegen-snelweg', 'invoegenSnelweg'],
];

describe('exporteren', () => {
  test.each(BASES)('%s komt ongewijzigd terug uit een rondje export', (_l, base) => {
    const overrides = evaluate(toSource(overridesOf(base, base))) as Partial<Scenario>;
    expect({ ...base, ...overrides }).toEqual(base);
  });

  test.each(BASES)('%s levert een bestand op dat de basis uitspreidt', (_l, base, mod, binding) => {
    const out = exportScenario(base, base, mod, binding);
    expect(out.source).toContain(`import { ${binding} } from './${mod}';`);
    expect(out.source).toContain(`...${binding},`);
    expect(out.filename).toMatch(/^scenario\..+\.ts$/);
  });

  test('een gewijzigd scenario draagt alleen zijn verschillen mee', () => {
    const moved: Scenario = {
      ...rechtsafFietspad,
      id: 'variant-v1',
      title: 'Variant',
      actors: rechtsafFietspad.actors.map((a) => ({ ...a, from: { ...a.from, y: a.from.y + 12 } })),
    };
    const overrides = overridesOf(moved, rechtsafFietspad);
    expect(Object.keys(overrides).sort()).toEqual(['actors', 'id', 'title']);
    // And applying them to the base reconstructs exactly what was edited.
    const rebuilt = { ...rechtsafFietspad, ...(evaluate(toSource(overrides)) as Partial<Scenario>) };
    expect(rebuilt).toEqual(moved);
  });

  test('en de uitvoer is geldige TypeScript-stijl: kale sleutels, enkele quotes', () => {
    const src = toSource({ speedLimitKmh: 30, title: "Piet's straat", nested: { a: [1, 2] } });
    expect(src).toContain('speedLimitKmh: 30');
    expect(src).toContain("title: 'Piet\\'s straat'");
    expect(evaluate(src)).toEqual({ speedLimitKmh: 30, title: "Piet's straat", nested: { a: [1, 2] } });
  });

  test('snelheden komen eruit als de km/u-deling die ze opleverde', () => {
    const src = toSource({ speed: 70 / 3.6, length: 4.4 });
    expect(src).toContain('speed: 70 / 3.6');
    // And it is the same double, not a tidied-up one — which is the only reason this is allowed.
    expect((evaluate(src) as { speed: number }).speed).toBe(70 / 3.6);
  });

  test('maar een snelheid die niet exact terugkomt, gaat als getal', () => {
    // Not a round km/h at any sensible precision: printing 12.34 / 3.6 would be a different value.
    const odd = 3.4287654321;
    expect(toSource({ speed: odd })).toContain(`speed: ${odd}`);
    expect((evaluate(toSource({ speed: odd })) as { speed: number }).speed).toBe(odd);
  });

  test('een uitgeschakelde dodehoekinstelling reist niet mee', () => {
    const withDisabled: Scenario = {
      ...rechtsafFietspad,
      id: 'variant-v1',
      title: 'Variant',
      actors: rechtsafFietspad.actors.map((a) => ({
        ...a,
        keepInBlindSpot: { enabled: false, minSpeed: 5, maxSpeed: 6, targetGap: 7, releaseAt: 8 },
      })),
    };
    const out = exportScenario(withDisabled, null);
    expect(out.source).not.toContain('keepInBlindSpot');
    expect(out.source).not.toContain('releaseAt');
  });

  test('en een scenario opent op wie het is, niet op de kijkdiscipline', () => {
    const out = exportScenario(blankJunction, null);
    const at = (k: string) => out.source.indexOf(`\n  ${k}:`);
    expect(at('id')).toBeGreaterThan(-1);
    expect(at('id')).toBeLessThan(at('world'));
    expect(at('world')).toBeLessThan(at('expected'));
    expect(at('expected')).toBeLessThan(at('lookDiscipline'));
  });

  test('getallen komen er exact uit, ook de lelijke', () => {
    // 25 km/u is 6.944444444444445 m/s. Afronden bij het opslaan maakte daar stilletjes een
    // andere snelheid van; afronden hoort bij het slepen, en dat gebeurt daar ook.
    for (const n of [6.944444444444445, 5.500000000000001, -127.5, 0, 16.5, 1 / 3]) {
      expect(Number(toSource(n))).toBe(n);
    }
  });

  test('deepEqual ziet het verschil dat overridesOf erop baseert', () => {
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
  });
});
