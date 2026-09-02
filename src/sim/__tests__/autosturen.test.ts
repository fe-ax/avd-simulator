/**
 * Riding with **auto-sturen on**, which is the setting the checkbox starts in.
 *
 * Nothing in this suite had ever scored a run that way. Every driven ride steers for itself, so
 * every rule about steering was always in scope and always satisfied — and a rule that forgets to
 * excuse itself when the machine takes the bend looked perfectly healthy from in here.
 *
 * *Linksaf de Molenweg in* shipped like that for a day. With the checkbox left alone the sturen
 * controls do nothing at all, so the rider never pressed one, and the debrief told them **"je bent
 * niet linksaf gegaan — de opdracht is niet uitgevoerd"** as a `kritiek`, about a bend the motor had
 * just taken for them. The harshest thing this tool says, about something that did not happen, on
 * the setting most people will ride first. The Kerkstraat had the guard from the day it was written
 * and that is exactly why nobody noticed the flag was optional.
 *
 * So this asks the plain question of every scenario in the registry rather than of the one that got
 * it wrong: **turning the exam setting on must not change the verdict.** A rule that only makes
 * sense when the rider steers has to say so.
 */
import { describe, expect, it } from 'vitest';
import { ALL_SCENARIOS } from '../scenarios';
import { referenceRide } from '../referenceRide';
import { steeringIsAutomatic } from '../steering';

/** The scenarios where the checkbox does anything; on a motorway it is hidden and inert. */
const BRANCHING = ALL_SCENARIOS.filter((s) => s.steering === 'branch');

describe('auto-sturen verandert het oordeel niet', () => {
  it('en er zijn scenarios waar de knop iets doet', () => {
    // Guards the guard: if `steering` were ever renamed, the filter above would quietly select
    // nothing and every assertion below would pass by describing an empty list.
    expect(BRANCHING.length).toBeGreaterThan(0);
  });

  it.each(BRANCHING.map((s) => [s.title, s] as const))(
    '%s: schoon te rijden zonder de sturen-knoppen aan te raken',
    (_t, scenario) => {
      // Auto-steer on and the rider never touches the sturen controls, which is not sloppiness —
      // it is what the setting means, and what the UI does with it.
      const { record, error } = referenceRide(scenario, { autoSteer: true, steer: false });
      expect(error).toBeNull();
      expect(record.autoSteer).toBe(true);
      expect(record.counts).toEqual({ opmerking: 0, fout: 0, kritiek: 0 });
      expect(record.verdict).toBe('geslaagd');
    },
  );

  it.each(BRANCHING.map((s) => [s.title, s] as const))(
    '%s: elke sturen-regel weet dat de motor kan sturen',
    (_t, scenario) => {
      // The property behind the ride above, stated directly so the reason survives a retiming.
      // Anything scored on a sturen control has to excuse itself when the rider was not steering.
      const steerRules = scenario.expected.filter(
        (e) => e.kind.type === 'control' && e.kind.control.startsWith('STEER_'),
      );
      for (const rule of steerRules) {
        expect(rule.onlyWhenManualSteering, `${rule.label} mist onlyWhenManualSteering`).toBe(true);
      }
    },
  );

  it('en op de snelweg is de knop sowieso zonder betekenis', () => {
    // `steeringIsAutomatic` is what gets recorded, and a motorway run must never claim the machine
    // steered for it — the checkbox is not even shown there.
    for (const scenario of ALL_SCENARIOS.filter((s) => s.steering !== 'branch')) {
      expect(steeringIsAutomatic(scenario, true)).toBe(false);
    }
  });
});
