/**
 * Does the validator catch the trick question that shipped?
 *
 * *Auto van rechts remt* went out crediting the rider with seeing a car that a terrace hid until
 * four seconds later. Nothing caught it, because perception is angular and everything downstream
 * believes perception. This is the check that would have: it asks whether anything tall stands on
 * the line of sight at the moment the model says the hazard was seen.
 *
 * The first test closes the corner again and expects the complaint — the scenario as it was. The
 * second is the scenario as it ships, and expects silence.
 */
import { describe, expect, it } from 'vitest';
import { analyseScenario } from '../referenceRide';
import { autoVanRechts } from '../scenario.auto-van-rechts';
import { rechtsafFietspad } from '../scenario.rechtsaf-fietspad';
import { inhalenSnelweg } from '../scenario.inhalen-snelweg';
import { invoegenSnelweg } from '../scenario.invoegen-snelweg';
import type { Scenario } from '../types';

describe('verkeer achter een huis', () => {
  it('wordt gevonden als de hoek dicht staat', () => {
    // The scenario exactly as it first shipped: a close-built corner in front of the hazard.
    const shut: Scenario = {
      ...autoVanRechts,
      world: {
        ...autoVanRechts.world,
        road: { ...(autoVanRechts.world as never as { road: object }).road, openCorners: undefined },
      } as Scenario['world'],
    };
    const hidden = analyseScenario(shut).hidden;
    expect(hidden.map((h) => h.actorId)).toEqual(['weggebruiker-1']);
    // Credited early, actually visible much later — the gap is the whole complaint.
    expect(hidden[0].visibleAt! - hidden[0].perceivedAt).toBeGreaterThan(2);
  });

  it('en niet meer nu de hoek open is', () => {
    expect(analyseScenario(autoVanRechts).hidden).toEqual([]);
  });

  it('en de andere scenarios hebben er ook geen last van', () => {
    for (const s of [rechtsafFietspad, invoegenSnelweg, inhalenSnelweg]) {
      expect(`${s.id} ${analyseScenario(s).hidden.map((h) => h.label).join(',')}`).toBe(`${s.id} `);
    }
  });
});
