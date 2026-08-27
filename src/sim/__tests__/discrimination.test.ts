/**
 * Does a rule actually catch anybody?
 *
 * The model rider answers "is this exercise possible?" and stops. It cannot answer whether the
 * reeks is *about* anything: a rule with a window wide enough that nobody can miss it goes green
 * exactly like one that teaches the lesson. So ride the scenario wrong, one mistake at a time,
 * and ask each rule which of those mistakes it caught.
 *
 * The vacuous-rule test is the important one. It builds a rule nothing can fail and checks the
 * analysis says so — which is the whole feature, and the thing a green panel used to hide.
 */
import { describe, expect, it } from 'vitest';
import { analyseScenario } from '../referenceRide';
import { autoVanRechts } from '../scenario.auto-van-rechts';
import { rechtsafFietspad } from '../scenario.rechtsaf-fietspad';
import { inhalenSnelweg } from '../scenario.inhalen-snelweg';
import { invoegenSnelweg } from '../scenario.invoegen-snelweg';
import type { Scenario } from '../types';

const byId = (s: Scenario, id: string) => {
  const rows = analyseScenario(s).discrimination;
  const hit = rows.find((r) => r.expectedId === id);
  if (!hit) throw new Error(`Geen regel "${id}" — wel: ${rows.map((r) => r.expectedId).join(', ')}`);
  return hit;
};

describe('welke regels vangen iets', () => {
  it('de remregel wordt gemist door wie niet anticipeert', () => {
    const rule = byId(autoVanRechts, 'regel-1');
    expect(rule.modelPasses).toBe(true);
    expect(rule.failedBy).toContain('wie niet anticipeert');
  });

  it('een regel die iedereen haalt, wordt als zodanig gemeld', () => {
    // 200 km/h on a 50 road: no rider on earth misses this, and that is the point.
    const vacuous: Scenario = {
      ...autoVanRechts,
      expected: [
        {
          ...autoVanRechts.expected[0],
          id: 'onzin',
          kind: { type: 'speedAtMost', maxKmh: 200 },
        },
      ],
    };
    const rule = byId(vacuous, 'onzin');
    expect(rule.modelPasses).toBe(true);
    expect(rule.failedBy).toEqual([]);
  });

  /**
   * Rules that no sloppy rider currently misses, and why. Each one is either a real finding about
   * the scenario or a real blind spot in the headless driver — never a shrug. Shrinking this list
   * is the work; growing it silently is the thing the test exists to prevent.
   */
  const KNOWN_OPEN: Record<string, string[]> = {
    // A genuine finding, and the first one this check produced: an `opmerking` for riding on after
    // the junction that a rider who does nothing right still earns, because nothing available
    // dawdles away from a straight-through crossing.
    'auto-van-rechts-v1': ['regel-2'],
    // No rider closes up on the vehicle ahead. `chaseAfterMerge` shuts the gap to the truck behind,
    // not to the car in front, so this headway band has never been tested by a bad ride.
    'invoegen-snelweg-v1': ['volgafstand-auto'],
    // The schouderblik rules cannot be missed by omission: `controlPrerequisites` refuses the
    // richtingaanwijzer without one, so a rider who skips it never changes lane and the rule
    // produces no row at all. They are belt-and-braces over the prerequisite, which is a defensible
    // thing to be — but this check cannot confirm they do any work.
    // The truck headway is the same gap as the merge's: nothing tailgates.
    'inhalen-snelweg-v1': ['schouderblik-links', 'schouderblik-rechts', 'afstand-vrachtwagen-1'],
  };

  it.each([
    ['rechtsaf-fietspad-v1', rechtsafFietspad],
    ['auto-van-rechts-v1', autoVanRechts],
    ['invoegen-snelweg-v1', invoegenSnelweg],
    ['inhalen-snelweg-v1', inhalenSnelweg],
  ])('%s: elke regel wordt gemist door een slordige rijder, op de bekende na', (id, s) => {
    const open = analyseScenario(s as Scenario)
      .discrimination.filter((r) => r.failedBy.length === 0)
      .map((r) => r.expectedId)
      .sort();
    expect(open).toEqual((KNOWN_OPEN[id] ?? []).slice().sort());
  });
});
