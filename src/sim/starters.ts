/**
 * Empty scenarios to start from, one per kind of road.
 *
 * Not exercises, and deliberately not in `ALL_SCENARIOS`: there is nothing to learn from riding
 * one. They exist because the builder derives from a base, and a shape with no shipped scenario in
 * it was a shape you could not build — the junction world would have been unreachable from the
 * browser on the day it landed.
 *
 * Everything here is the least a scenario can be and still ride: a road, a speed, and no traffic.
 * The reeks is empty on purpose. A starter that came with plausible-looking rules would have those
 * rules quietly outlive whatever the author actually meant to build, which is the whole failure
 * the reeks editor exists to end.
 */
import type { Scenario } from './types';

const COMMON = {
  startGear: 3,
  throttleStepKmh: 5,
  steering: 'branch' as const,
  actors: [],
  expected: [],
  sequence: {
    label: 'Volgorde',
    ids: [],
    outcome: { severity: 'fout' as const, explanation: 'De handelingen kwamen in de verkeerde volgorde.' },
  },
  lookDiscipline: {
    minRepeatSeconds: 2,
    maxInBurst: 7,
    burstSeconds: 3,
    warnAt: 3,
    faultAt: 6,
    warning: {
      severity: 'opmerking' as const,
      explanation:
        'Je keek erg vaak achter elkaar. Twee keer achter elkaar levert de tweede keer niets ' +
        'nieuws op, en ondertussen zie je de weg vóór je niet.',
    },
    fault: {
      severity: 'fout' as const,
      explanation: 'Je scande vrijwel onafgebroken in plaats van gericht te kijken.',
    },
  },
  controlPrerequisites: [],
  unwanted: [],
  verdictRule: { faultLimit: 3 },
};

/** A plain crossroads, straight on, with priority. The commonest shape a hazard exercise takes. */
export const blankJunction: Scenario = {
  ...COMMON,
  id: 'nieuw-kruispunt-v1',
  title: 'Nieuw kruispunt',
  briefing: {
    situation: 'Beschrijf hier waar de rijder is en wat hij ziet.',
    assignment: 'Beschrijf hier wat de examinator vraagt.',
    hints: [],
  },
  world: {
    kind: 'junction',
    road: { halfWidth: 3, sideHalfWidth: 3, vergeTo: 11 },
    startY: -120,
    runOutM: 55,
    manoeuvre: 'straight',
    turnRadius: 6,
    giveWay: 'side',
  },
  speedLimitKmh: 50,
  startSpeedKmh: 50,
  maxSpeedKmh: 80,
};

/** Open motorway, two lanes, nothing joining it. */
export const blankMotorway: Scenario = {
  ...COMMON,
  id: 'nieuwe-snelweg-v1',
  title: 'Nieuwe snelweg',
  briefing: {
    situation: 'Beschrijf hier waar de rijder is en wat hij ziet.',
    assignment: 'Beschrijf hier wat de examinator vraagt.',
    hints: [],
  },
  world: {
    kind: 'motorway',
    road: {
      laneCount: 2,
      laneWidth: 3.5,
      leftEdgeX: 0.3,
      mergeLaneWidth: 3.5,
      blockBandWidth: 0.5,
      bermWidth: 4,
    },
    stretch: { kind: 'doorgaand', startY: 0, endY: 900 },
  },
  speedLimitKmh: 100,
  startSpeedKmh: 100,
  maxSpeedKmh: 130,
  steering: 'lane',
  throttleStepKmh: 10,
};

export const STARTERS: readonly Scenario[] = [blankJunction, blankMotorway];
