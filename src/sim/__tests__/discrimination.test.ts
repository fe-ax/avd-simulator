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
import { analyseScenario, referenceRide } from '../referenceRide';
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

describe('de anticiperende rijder remt als een mens', () => {
  it('gebruikt de rem een handvol keer, niet honderden keren', () => {
    // Both times shift every frame — the rider's because it is slowing, the car's because it is
    // braking — so a single threshold had the difference crossing it back and forth and the brake
    // going on and off twenty-five times a second. One approach left 214 brake events in the
    // record for a debrief to draw. The average deceleration was about right, which is why it went
    // unnoticed for as long as nobody looked at the events.
    const { record } = referenceRide(autoVanRechts);
    const brakes = record.events.filter((e) => e.control === 'BRAKE');
    expect(brakes.length).toBeLessThan(20);
    // And it still does the thing it is there to do.
    expect(brakes.length).toBeGreaterThan(0);
    expect(record.counts).toEqual({ opmerking: 0, fout: 0, kritiek: 0 });
  });
});

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
   * Every rule in every shipped scenario is missed by at least one sloppy rider.
   *
   * This began as an allow-list of five rules nothing could fail, each with a comment saying why.
   * It is empty, and the assertion is now the plain one: if a rule here stops discriminating,
   * either it went soft or the rider that used to catch it stopped being able to make the mistake.
   * Both are worth stopping for, and neither should be absorbed by adding a name to a list.
   */
  const KNOWN_OPEN: Record<string, string[]> = {};

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
