/**
 * A saved draft outlives the code that made it. These are the checks that keep that from being
 * fatal — one of them cost a white screen with no way out before it existed.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { clearDraft, loadDraft, saveDraft } from '../drafts';
import { rechtsafFietspad } from '../scenario.rechtsaf-fietspad';
import { invoegenSnelweg } from '../scenario.invoegen-snelweg';
import type { Scenario } from '../types';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

const KEY = 'avd-simulator.draft.v1';

describe('concepten', () => {
  beforeEach(() => store.clear());

  test('een bewaard concept komt terug zoals het ging', () => {
    saveDraft(rechtsafFietspad, rechtsafFietspad.id);
    const back = loadDraft();
    expect(back?.baseId).toBe(rechtsafFietspad.id);
    expect(back?.scenario).toEqual(rechtsafFietspad);
  });

  test.each([
    ['Rechtsaf de Kerkstraat in', rechtsafFietspad],
    ['Invoegen op de A12', invoegenSnelweg],
  ])('%s overleeft een rondje opslaan en laden', (_l, scenario) => {
    saveDraft(scenario as Scenario, (scenario as Scenario).id);
    expect(loadDraft()?.scenario).toEqual(scenario);
  });

  test('een concept in een oude vorm wordt weggegooid, niet teruggegeven', () => {
    // Exactly what was in localStorage: a motorway world from before `stretch` existed. Handed
    // back, it took the whole builder down to a white screen that could not clear itself.
    const stale = {
      baseId: 'invoegen-snelweg-v1',
      savedAt: '2026-08-26T13:48:10.890Z',
      scenario: {
        ...invoegenSnelweg,
        world: {
          kind: 'motorway',
          road: (invoegenSnelweg.world as { road: unknown }).road,
          ramp: { radius: 120, sweepDeg: 18, strookStartY: -150 },
          mergeEndY: 0,
          taperM: 100,
          runOutM: 120,
        },
      },
    };
    store.set(KEY, JSON.stringify(stale));
    expect(loadDraft()).toBeNull();
  });

  test('en zo ook een concept waarvan de route niet te bouwen is', () => {
    const world = rechtsafFietspad.world as Extract<Scenario['world'], { kind: 'urbanCrossing' }>;
    const kinked: Scenario = {
      ...rechtsafFietspad,
      // turnInY + turnRadius no longer lands in the side road's lane, which buildRoutes refuses.
      world: { ...world, approach: { ...world.approach, turnRadius: 9 } },
    };
    saveDraft(kinked, kinked.id);
    expect(loadDraft()).toBeNull();
  });

  test('onzin in de opslag levert null op in plaats van een crash', () => {
    store.set(KEY, '{not json');
    expect(loadDraft()).toBeNull();
    store.set(KEY, '{"scenario":{}}');
    expect(loadDraft()).toBeNull();
  });

  test('weggooien doet wat het zegt', () => {
    saveDraft(rechtsafFietspad, rechtsafFietspad.id);
    clearDraft();
    expect(loadDraft()).toBeNull();
  });
});
