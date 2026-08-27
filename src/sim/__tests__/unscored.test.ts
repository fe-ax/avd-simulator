/**
 * "A model rider passes" is a true answer to the wrong question when the exercise no longer tests
 * what you think it does. This is the check that noticed.
 */
import { describe, expect, test } from 'vitest';
import { referenceRide, unscoredActors } from '../referenceRide';
import { rechtsafFietspad } from '../scenario.rechtsaf-fietspad';
import { invoegenSnelweg } from '../scenario.invoegen-snelweg';
import { inhalenSnelweg } from '../scenario.inhalen-snelweg';
import type { Scenario } from '../types';

const unscored = (s: Scenario) => unscoredActors(s, referenceRide(s).record).map((a) => a.id);

describe('weggebruikers waar niets over beoordeeld wordt', () => {
  test.each([
    ['Rechtsaf de Kerkstraat in', rechtsafFietspad],
    ['Invoegen op de A12', invoegenSnelweg],
    ['Inhalen op de A12', inhalenSnelweg],
  ])('%s: elke weggebruiker doet mee', (_l, scenario) => {
    expect(unscored(scenario as Scenario)).toEqual([]);
  });

  test('de auto\'s links op de A12 tellen mee, ook al raakt een nette rit ze nooit', () => {
    // They are only ever provoked by a rider who looks properly and then pulls out anyway, which
    // is why one deliberately bad ride is not enough to find them: a rider who checks nothing has
    // the lane change refused and never gets near them.
    expect(unscored(inhalenSnelweg)).not.toContain('auto-1');
  });

  test('een gevaar dat nergens meer aan meedoet wordt aangewezen', () => {
    // The shakedown, exactly: the snorfiets dragged off the fietspad onto the side road. The
    // inherited reeks still passes, and the hazard has stopped being part of the exercise.
    const moved: Scenario = {
      ...rechtsafFietspad,
      actors: rechtsafFietspad.actors.map((a) => ({
        ...a,
        from: { x: 60, y: 1.5 },
        to: { x: -60, y: 1.5 },
        speed: 70 / 3.6,
      })),
    };
    const clean = referenceRide(moved);
    // The point: the run still passes...
    expect(clean.record.verdict).toBe('geslaagd');
    // ...and the traffic it is supposedly about is doing nothing at all.
    expect(unscored(moved)).toEqual(['snorfiets']);
  });
});
