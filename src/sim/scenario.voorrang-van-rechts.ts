/**
 * Voorrang van rechts: a gelijkwaardig kruispunt, and a car that simply takes what is its.
 *
 * The deliberate inverse of *Auto van rechts remt*, on the same crossroads. There the rider has
 * priority and the lesson is that having it is not the same as being given it. Here there is no
 * priority to have: no haaientanden, no borden, nothing painted at all — and the rule that fills
 * the silence is the one every Dutch road user is supposed to carry in their head.
 *
 * The pair is the point. Two roads that look identical from the saddle, opposite obligations, and
 * the only thing that tells them apart is what is *not* on the tarmac. A rider who has ridden the
 * other one and rides this one the same way is exactly the rider this exercise is for.
 *
 * **The car does nothing wrong and does not react.** No cues. It arrives at an even thirty and
 * keeps going, because it is entitled to and because a driver who is entitled to go does not stop
 * for somebody who is about to take it. Everything the rider gets is what the rider went and
 * looked for.
 *
 * That makes the look to the right load-bearing in a way it is not on the crossroads next door.
 * The car sits about 44° off the rider's nose on the approach, and the forward view reaches 31°:
 * ride in staring straight ahead and it is genuinely not there until it is nearly on top of you.
 * `voorrang.test.ts` measures that gap rather than asserting it — a reveal table with three
 * different columns, which is the shape a scenario about looking is supposed to have.
 */

import type { Scenario } from './types';

export const voorrangVanRechts: Scenario = {
  id: 'voorrang-van-rechts-v1',
  title: 'Voorrang van rechts',
  briefing: {
    situation:
      'Je rijdt 30 km/u door een woonwijk. Je nadert een kruispunt zonder borden en zonder ' +
      'haaientanden: een gelijkwaardig kruispunt. Van rechts komt een auto aanrijden.',
    assignment: 'Rijd rechtdoor over het kruispunt.',
    hints: [
      'Geen borden en geen haaientanden betekent niet dat niemand voorrang heeft. Het betekent ' +
        'dat verkeer van rechts voorgaat, en hier komt dat verkeer van rechts.',
    ],
  },
  world: {
    kind: 'junction',
    road: {
      halfWidth: 3,
      sideHalfWidth: 3,
      vergeTo: 11,
      // The corner the car comes round. Without this the terraces stand between the rider and the
      // hazard, and perception — which is angular and knows nothing about houses — would credit a
      // look at a car behind a building. That was a real defect on the crossroads next door and
      // `findHiddenReveals` is what caught it; this scenario is built with the answer already in.
      openCorners: {
        se: 80,
      },
    },
    startY: -90,
    runOutM: 55,
    manoeuvre: 'straight',
    turnRadius: 6,
    // Nothing painted, nothing signed. The whole exercise lives in this one word.
    giveWay: 'none',
  },
  speedLimitKmh: 30,
  startSpeedKmh: 30,
  maxSpeedKmh: 50,
  startGear: 2,
  throttleStepKmh: 5,
  steering: 'branch',
  actors: [
    {
      id: 'weggebruiker-1',
      kind: 'auto',
      label: 'Auto van rechts',
      // Where it starts is set from the rider's own approach, not chosen. The two paths cross at
      // (1,5 , 1,5) — where the rider's lane meets the car's — and a rider who slows for the
      // junction but goes anyway is there at 15,1 s. So the car is there at 15,1 s, which at an
      // even thirty is 127 m of road behind it.
      //
      // Ninety metres put it three seconds early: through and gone before anybody arrived, so the
      // exercise had no conflict in it at all for any rider who eased off — which is every rider
      // it is written for. The scenario said so out loud, by reporting its own car as an unscored
      // road user.
      from: { x: 127, y: 1.5 },
      to: { x: -50, y: 1.5 },
      speed: 30 / 3.6,
      length: 4.4,
      priorityReason:
        'Op een gelijkwaardig kruispunt gaat verkeer van rechts voor. Er stond niets op de weg ' +
        'dat daar iets aan veranderde.',
    },
  ],
  expected: [
    {
      id: 'regel-1',
      label: '1. Kijk naar links',
      group: 'kijken',
      kind: { type: 'control', control: 'EYE_LEFT' },
      window: { from: 95, to: 62 },
      tolerance: 10,
      praise: 'Eerst naar links, waar je het kruispunt als eerste raakt.',
      missed: {
        severity: 'fout',
        explanation:
          'Je keek niet naar links bij het naderen. Van links komt niets met voorrang, maar het ' +
          'is wel de kant die je als eerste oversteekt.',
      },
    },
    {
      id: 'regel-2',
      label: '2. Kijk naar rechts',
      group: 'kijken',
      kind: { type: 'control', control: 'EYE_RIGHT' },
      window: { from: 75, to: 42 },
      tolerance: 10,
      praise: 'Naar rechts gekeken, waar het verkeer met voorrang vandaan komt.',
      missed: {
        severity: 'fout',
        explanation:
          'Je keek niet naar rechts. Dat is op dit kruispunt de kant waar het verkeer vandaan ' +
          'komt dat voorgaat, en recht vooruit zie je hem niet aankomen.',
      },
    },
    {
      id: 'regel-3',
      label: '3. Nog een keer naar links',
      group: 'kijken',
      kind: { type: 'control', control: 'EYE_LEFT' },
      window: { from: 28, to: 4 },
      tolerance: 8,
      praise: 'Vlak voor het oversteken nog een keer links.',
      missed: {
        severity: 'opmerking',
        explanation:
          'Je keek vlak voor het kruispunt niet nog een keer naar links. Tussen je eerste blik ' +
          'en het oversteken zit een halve minuut waarin daar iets kan zijn aangekomen.',
      },
    },
    {
      id: 'regel-4',
      label: '4. Snelheid terug voor het kruispunt',
      group: 'snelheid',
      kind: { type: 'speedAtMost', maxKmh: 20 },
      // Ends at twelve metres, not at two, and that is the whole rule.
      //
      // Run it to the kerb and a rider who holds thirty the whole way and then stands on the brake
      // dips under the threshold in the last few metres and is credited with a careful approach —
      // measured at 30 km/h at d=15 and 10 km/h at d=5, which is a panic stop being scored as
      // anticipation. The question is what speed you *arrived* at, so it has to stop being asked
      // before the arriving is over.
      window: { from: 32, to: 12 },
      praise: 'Langzaam genoeg aangereden om hem voor te kunnen laten gaan.',
      missed: {
        severity: 'fout',
        explanation:
          'Je reed te hard naar het kruispunt toe. Voorrang verlenen is iets wat je moet kúnnen: ' +
          'wie pas remt op het moment dat hij iemand ziet, staat pas stil als hij er al is.',
      },
    },
  ],
  sequence: {
    label: 'Volgorde',
    ids: ['regel-1', 'regel-2', 'regel-3'],
    outcome: {
      severity: 'opmerking',
      explanation:
        'Links, rechts, en dan nog een keer links. Die laatste blik hoort de laatste te zijn.',
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
      explanation:
        'Je keek erg vaak achter elkaar. Twee keer achter elkaar levert de tweede keer niets ' +
        'nieuws op, en ondertussen zie je de weg vóór je niet.',
    },
    fault: {
      severity: 'fout',
      explanation: 'Je scande vrijwel onafgebroken in plaats van gericht te kijken.',
    },
  },
  controlPrerequisites: [],
  unwanted: [],
  verdictRule: { faultLimit: 3 },
};
