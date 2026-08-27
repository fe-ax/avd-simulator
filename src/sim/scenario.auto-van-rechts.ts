/**
 * Auto van rechts remt: a car arrives at a junction far too fast and stands on its brakes.
 *
 * You have priority — haaientanden on the side road — and the lesson is that having it is not the
 * same as being given it. Doing this right means backing off while the car is still a threat and
 * then carrying on, rather than either ploughing through on your rights or stopping dead.
 *
 * **This file is the scenario builder's output, unedited apart from this comment.** It is the
 * proof that the builder can produce a shipping scenario without anyone opening an editor: it was
 * built in the browser, validated against the model rider there, exported, and dropped in. The
 * hand-written scenarios next door read better — see `BUILDER-GAPS.md` — but nothing here needed a
 * human to write it.
 */
import type { Scenario } from './types';

export const autoVanRechts: Scenario = {
  startGear: 3,
  throttleStepKmh: 5,
  steering: 'branch',
  actors: [
    {
      id: 'weggebruiker-1',
      kind: 'auto',
      label: 'Auto van rechts',
      from: {
        x: 170,
        y: 1.5,
      },
      to: {
        x: -40,
        y: 1.5,
      },
      speed: 19.444444444444446,
      length: 4.4,
      keepInBlindSpot: {
        enabled: false,
        minSpeed: 13.88888888888889,
        maxSpeed: 13.88888888888889,
        targetGap: 0,
        releaseAt: 0,
      },
      cues: [
        {
          atDist: 126,
          action: 'stop',
        },
      ],
    },
  ],
  expected: [
    {
      id: 'regel-1',
      label: '1. Afremmen voor de auto',
      group: 'snelheid',
      kind: {
        type: 'speedAtMost',
        maxKmh: 25,
      },
      window: {
        from: 60,
        to: 20,
      },
      praise: 'Je nam gas terug toen die auto aan kwam. Precies goed: eerst kijken wat hij doet.',
      missed: {
        severity: 'fout',
        explanation: 'Je reed onverminderd door terwijl er van rechts een auto veel te hard aan kwam. Je hebt voorrang, maar voorrang krijg je pas als de ander hem geeft — en dat kon je van hier af zien.',
      },
    },
    {
      id: 'regel-2',
      label: '2. Daarna weer doorrijden',
      group: 'snelheid',
      kind: {
        type: 'speedAtLeast',
        minKmh: 35,
      },
      window: {
        from: -15,
        to: -45,
      },
      praise: 'Je reed weer door zodra het kon.',
      missed: {
        severity: 'opmerking',
        explanation: 'Je bleef kruipen nadat de auto stilstond. Zodra duidelijk is dat hij je voor laat gaan, rijd je door — blijven treuzelen op een kruispunt houdt iedereen achter je op en maakt je bedoeling onduidelijk.',
      },
    },
  ],
  sequence: {
    label: 'Volgorde',
    ids: [],
    outcome: {
      severity: 'fout',
      explanation: 'De handelingen kwamen in de verkeerde volgorde.',
    },
  },
  lookDiscipline: {
    minRepeatSeconds: 2,
    maxInBurst: 7,
    burstSeconds: 3,
    warnAt: 3,
    faultAt: 6,
    warning: {
      severity: 'opmerking',
      explanation: 'Je keek erg vaak achter elkaar. Twee keer achter elkaar levert de tweede keer niets nieuws op, en ondertussen zie je de weg vóór je niet.',
    },
    fault: {
      severity: 'fout',
      explanation: 'Je scande vrijwel onafgebroken in plaats van gericht te kijken.',
    },
  },
  controlPrerequisites: [],
  unwanted: [],
  verdictRule: {
    faultLimit: 3,
  },
  id: 'auto-van-rechts-v1',
  title: 'Auto van rechts remt',
  briefing: {
    situation: 'Je rijdt met 50 km/u op een voorrangsweg binnen de bebouwde kom. Je nadert een kruispunt met een zijweg; op die zijweg staan haaientanden, dus verkeer daarvandaan moet jou voor laten gaan. Van rechts komt een auto aanrijden die daar veel te hard voor gaat.',
    assignment: 'Rijd rechtdoor over het kruispunt.',
    hints: [
      'Jij hebt voorrang. Dat is iets anders dan voorrang krijgen: kijk of hij ook echt afremt voordat je ervan uitgaat.',
    ],
  },
  world: {
    kind: 'junction',
    road: {
      halfWidth: 3,
      sideHalfWidth: 3,
      vergeTo: 11,
    },
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
