/**
 * Auto van rechts remt: a car arrives at a junction far too fast and stands on its brakes.
 *
 * You have priority — haaientanden on the side road — and the lesson is that having it is not the
 * same as being given it. Doing this right means backing off while the car is still a threat and
 * then carrying on, rather than either ploughing through on your rights or stopping dead.
 *
 * Built in the browser with the scenario builder, validated against the model rider there,
 * exported, and dropped in — the proof that the loop closes without anyone opening an editor.
 *
 * **No longer untouched, and the edits are the interesting part.** As built it was a trick
 * question: the terraces hid the car until 7,4 s, it began braking at 6,5 s, and perception —
 * which is purely angular and knows nothing about buildings — credited the rider with seeing it at
 * 3,4 s. You were marked on reading a hazard that was behind a house until after it had reacted,
 * and every check in the suite called that a clean ride.
 *
 * So the south-east corner is open now, and the car stands on everything at 8 m/s² instead of
 * coasting to a halt at 5.
 *
 * **And it is aimed at you.** As built it stopped short of the carriageway, so a rider who ignored
 * it entirely sailed through with room to spare and passed — nothing was ever nearly hit, and the
 * reason to read the road was theoretical. Its start is now set so that an unbraked car reaches the
 * crossing point at the exact moment a rider who never slows gets there: take the cue away and the
 * two bodies overlap. It stops with its nose at x=2,23 — front wheels a good half metre past the
 * apex of the haaientanden and a metre onto the carriageway — one second after that rider has gone
 * past. Missing a hazard that only misses you because the other driver saved it is a `kritiek`.
 *
 * `zicht.test.ts` holds all of that: the sight line, the collision course, both clearances.
 *
 * Two of those three edits had to be made here rather than in the builder, which had no form field
 * for either — see `BUILDER-GAPS.md`.
 */

import type { Scenario } from './types';

export const autoVanRechts: Scenario = {
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
      openCorners: {
        se: 80,
      },
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
  startGear: 3,
  throttleStepKmh: 5,
  steering: 'branch',
  actors: [
    {
      id: 'weggebruiker-1',
      kind: 'auto',
      label: 'Auto van rechts',
      from: {
        x: 173,
        y: 1.5,
      },
      to: {
        x: -40,
        y: 1.5,
      },
      speed: 70 / 3.6,
      length: 4.4,
      cues: [
        {
          atDist: 145,
          action: 'stop',
          decel: 8,
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
        severity: 'kritiek',
        explanation:
          'Je reed onverminderd door terwijl er van rechts een auto veel te hard aan kwam. Dat het ' +
          'goed afliep is zíjn verdienste: had hij niet vol op de rem gestaan, dan had hij je ' +
          'geraakt. Je hebt voorrang, maar voorrang krijg je pas als de ander hem geeft — en dat ' +
          'kon je van hier af zien aankomen.',
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
};
