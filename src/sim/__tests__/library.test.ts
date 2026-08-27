/**
 * Scenarios that outlive the developer: saved in a browser, sent as a file, ridden by whoever
 * receives them.
 *
 * The two things worth being certain of are here. **A file must not be lossy** — a scenario that
 * comes back scoring differently from the one that left is a bug nobody would report as a bug,
 * because both rides look fine on their own. And **nothing arriving from storage or from a file
 * may redefine a shipped exercise**, or a student's saved run of the real Kerkstraat quietly
 * replays against somebody else's road.
 *
 * `localStorage` is stubbed rather than mocked: the code under test is meant to survive a real one
 * behaving badly (full, cleared, holding nonsense), so the double behaves like the real thing and
 * the tests do the misbehaving.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteScenario, freeId, listSaved, saveScenario } from '../library';
import { readRunFile, readScenarioFile, runFileFor, scenarioFileFor } from '../scenarioFile';
import { referenceRide } from '../referenceRide';
import { autoVanRechts } from '../scenario.auto-van-rechts';
import { rechtsafFietspad } from '../scenario.rechtsaf-fietspad';
import { ALL_SCENARIOS, RESERVED_IDS, allScenarios, scenarioById } from '../scenarios';
import { scoreRun } from '../scoring';
import type { Scenario } from '../types';

function stubStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
  return store;
}

/** A scenario of one's own: the shipped junction under a different name. */
const mine: Scenario = { ...autoVanRechts, id: 'mijn-kruispunt-v1', title: 'Mijn kruispunt' };

describe('de scenario-bibliotheek', () => {
  beforeEach(() => {
    stubStorage();
  });

  it('bewaart er een en geeft hem terug', () => {
    expect(saveScenario(mine, RESERVED_IDS).ok).toBe(true);
    expect(listSaved().map((s) => s.scenario.id)).toEqual(['mijn-kruispunt-v1']);
    expect(scenarioById('mijn-kruispunt-v1')?.title).toBe('Mijn kruispunt');
    expect(allScenarios()).toHaveLength(ALL_SCENARIOS.length + 1);
  });

  it('bewaart geen tweede versie van dezelfde id', () => {
    saveScenario(mine, RESERVED_IDS);
    saveScenario({ ...mine, title: 'Hernoemd' }, RESERVED_IDS);
    expect(listSaved()).toHaveLength(1);
    expect(scenarioById('mijn-kruispunt-v1')?.title).toBe('Hernoemd');
  });

  it('weigert de id van een scenario dat meegeleverd wordt', () => {
    const result = saveScenario({ ...mine, id: 'rechtsaf-fietspad-v1' }, RESERVED_IDS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('meekomt');
  });

  it('en zelfs als er tóch zo een in de opslag staat, wint het echte scenario', () => {
    // Not reachable through saveScenario — this is a hand-edited file, or a future bug. A student's
    // saved run of the real Kerkstraat must replay against the real Kerkstraat regardless.
    localStorage.setItem(
      'avd-simulator.scenarios.v1',
      JSON.stringify([{ scenario: { ...mine, id: 'rechtsaf-fietspad-v1' }, savedAt: '' }]),
    );
    expect(scenarioById('rechtsaf-fietspad-v1')).toBe(rechtsafFietspad);
  });

  it('en zo een staat ook niet dubbel in de lijst', () => {
    localStorage.setItem(
      'avd-simulator.scenarios.v1',
      JSON.stringify([{ scenario: { ...mine, id: 'rechtsaf-fietspad-v1' }, savedAt: '' }]),
    );
    // scenarioById already resolves that id to the shipped scenario, so listing the impostor puts
    // a second button in the picker with the same name that selects the first one. Both places
    // apply the same rule, or they disagree about what exists.
    expect(allScenarios().filter((s) => s.id === 'rechtsaf-fietspad-v1')).toHaveLength(1);
    expect(allScenarios()).toHaveLength(ALL_SCENARIOS.length);
  });

  it('negeert opslag die deze versie niet kan rijden', () => {
    localStorage.setItem(
      'avd-simulator.scenarios.v1',
      JSON.stringify([
        { scenario: { ...mine, world: { kind: 'iets-uit-de-toekomst' } }, savedAt: '' },
        { scenario: mine, savedAt: '' },
      ]),
    );
    expect(listSaved().map((s) => s.scenario.id)).toEqual(['mijn-kruispunt-v1']);
  });

  it('verwijdert er een', () => {
    saveScenario(mine, RESERVED_IDS);
    expect(deleteScenario('mijn-kruispunt-v1')).toEqual([]);
    expect(scenarioById('mijn-kruispunt-v1')).toBeNull();
  });

  it('verzint een vrije id als de gewenste bezet is', () => {
    expect(freeId('kruispunt-v1', new Set())).toBe('kruispunt-v1');
    expect(freeId('kruispunt-v1', new Set(['kruispunt-v1']))).toBe('kruispunt-v1-2');
    expect(freeId('kruispunt-v1', new Set(['kruispunt-v1', 'kruispunt-v1-2']))).toBe('kruispunt-v1-3');
  });
});

describe('een scenario als bestand', () => {
  beforeEach(() => {
    stubStorage();
  });

  it('komt er hetzelfde uit als het erin ging — en rijdt hetzelfde', () => {
    const text = JSON.stringify(scenarioFileFor(mine));
    const parsed = readScenarioFile(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toEqual(mine);

    // The claim that matters is not that the JSON matches but that the *exercise* does: same
    // reeks, same verdict, same row for every rule. A lossy field would show up here and nowhere
    // else, because both rides look perfectly reasonable on their own.
    const before = referenceRide(mine).record;
    const after = referenceRide(parsed.value).record;
    expect(scoreRun(after, parsed.value).results).toEqual(scoreRun(before, mine).results);
  });

  it('weigert een bestand dat geen scenario is', () => {
    for (const text of ['niet eens json', '[]', '{"format":"iets anders"}', '{}']) {
      const parsed = readScenarioFile(text);
      expect(parsed.ok).toBe(false);
    }
  });

  it('zegt het als je een rit opent waar een scenario hoort', () => {
    const run = referenceRide(mine).record;
    const parsed = readScenarioFile(JSON.stringify(runFileFor(run, mine)));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toContain('rit');
  });

  it('weigert een scenario dat deze versie niet kan rijden', () => {
    const broken = { ...mine, world: { kind: 'iets-uit-de-toekomst' } } as unknown as Scenario;
    const parsed = readScenarioFile(JSON.stringify(scenarioFileFor(broken)));
    expect(parsed.ok).toBe(false);
  });
});

describe('een rit als bestand', () => {
  beforeEach(() => {
    stubStorage();
  });

  it('draagt zijn eigen scenario mee, zodat de ontvanger hem kan afspelen', () => {
    const run = referenceRide(mine).record;
    const parsed = readRunFile(JSON.stringify(runFileFor(run, mine)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.scenario).toEqual(mine);
    expect(parsed.value.run.id).toBe(run.id);
    // And the receiver, who has never seen this scenario, can score the ride identically.
    expect(scoreRun(parsed.value.run, parsed.value.scenario).counts).toEqual(run.counts);
  });

  it('zegt het als je een scenario opent waar een rit hoort', () => {
    const parsed = readRunFile(JSON.stringify(scenarioFileFor(mine)));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toContain('scenario');
  });
});
