import { describe, expect, test } from 'vitest';
import { invoegenSnelweg } from '../../sim/scenario.invoegen-snelweg';
import { rechtsafFietspad } from '../../sim/scenario.rechtsaf-fietspad';
import {
  CONTROL_BY_ID,
  controlLabels,
  groupLabel,
  isSteerControl,
  steeringIsInert,
  type SteeringScenario,
} from '../controls';

/**
 * Stubs, not whole scenarios. The question these helpers answer is what the sturen controls mean,
 * and the mode is the entire answer — a test that had to build a kruispunt to ask it would start
 * failing for reasons that have nothing to do with steering.
 */
const kruispunt: SteeringScenario = { steering: 'branch' };
const snelweg: SteeringScenario = { steering: 'lane' };

describe('wanneer de stuurknoppen niets doen', () => {
  test('op een kruispunt neemt auto-sturen de bocht over', () => {
    expect(steeringIsInert(kruispunt, true)).toBe(true);
  });

  test('op een kruispunt zonder auto-sturen stuur je zelf in', () => {
    expect(steeringIsInert(kruispunt, false)).toBe(false);
  });

  test('bij rijstrookwisselen blijven ze actief, ook met auto-sturen aan', () => {
    // The whole exercise is *when* you press, so nothing may take it over — least of all a
    // setting the rider left on after the vorige oefening.
    expect(steeringIsInert(snelweg, true)).toBe(false);
  });

  test('bij rijstrookwisselen blijven ze actief met auto-sturen uit', () => {
    expect(steeringIsInert(snelweg, false)).toBe(false);
  });

  test('alleen de stuurknoppen gaan over deze vraag', () => {
    expect(isSteerControl('STEER_LEFT')).toBe(true);
    expect(isSteerControl('STEER_RIGHT')).toBe(true);
    expect(isSteerControl('THROTTLE_UP')).toBe(false);
    expect(isSteerControl('INDICATOR_LEFT')).toBe(false);
    // Kijken staat niet in de tabel: er is geen toets voor, en dat mag hier niet omvallen.
    expect(isSteerControl('SHOULDER_RIGHT')).toBe(false);
  });
});

describe('hoe de stuurknoppen heten', () => {
  test('een druk is een hele rijstrook, geen stuurbeweging', () => {
    expect(controlLabels(CONTROL_BY_ID.STEER_LEFT, snelweg)).toEqual({
      label: 'Rijstrook links',
      short: 'Rijstrook L',
    });
    expect(controlLabels(CONTROL_BY_ID.STEER_RIGHT, snelweg)).toEqual({
      label: 'Rijstrook rechts',
      short: 'Rijstrook R',
    });
  });

  test('op een kruispunt heet insturen gewoon sturen', () => {
    expect(controlLabels(CONTROL_BY_ID.STEER_LEFT, kruispunt)).toEqual({
      label: 'Stuur links',
      short: 'Stuur L',
    });
  });

  test('de rest van de bediening heet overal hetzelfde', () => {
    for (const id of ['BRAKE', 'THROTTLE_UP', 'INDICATOR_LEFT', 'CLUTCH', 'GEAR_UP'] as const) {
      expect(controlLabels(CONTROL_BY_ID[id], snelweg)).toEqual(
        controlLabels(CONTROL_BY_ID[id], kruispunt),
      );
    }
  });

  test('de groep heet rijstrook wisselen in plaats van sturen', () => {
    expect(groupLabel('sturen', kruispunt)).toBe('Sturen');
    expect(groupLabel('sturen', snelweg)).toBe('Rijstrook wisselen');
  });

  test('de overige groepen houden hun naam', () => {
    for (const group of ['richting', 'snelheid', 'aandrijving', 'kijken'] as const) {
      expect(groupLabel(group, snelweg)).toBe(groupLabel(group, kruispunt));
    }
  });
});

/**
 * The stubs prove the rule; these two prove the wiring. Every exercise a student can actually
 * ride has to land on one side of it or the other, and the one where a press is a whole rijstrook
 * has to say so on the knop that press is judged on.
 */
describe('de oefeningen die er zijn', () => {
  test('op de snelweg blijven de stuurknoppen van de rijder, ook met auto-sturen aan', () => {
    expect(steeringIsInert(invoegenSnelweg, true)).toBe(false);
    expect(controlLabels(CONTROL_BY_ID.STEER_LEFT, invoegenSnelweg).short).toBe('Rijstrook L');
    expect(groupLabel('sturen', invoegenSnelweg)).toBe('Rijstrook wisselen');
  });

  test('op het kruispunt neemt auto-sturen de bocht nog steeds over', () => {
    expect(steeringIsInert(rechtsafFietspad, true)).toBe(true);
    expect(groupLabel('sturen', rechtsafFietspad)).toBe('Sturen');
  });
});
