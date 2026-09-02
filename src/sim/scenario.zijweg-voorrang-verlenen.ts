/**
 * Voorrang verlenen op de zijweg: the rider behind the haaientanden for once, and the car comes
 * from the left.
 *
 * Every junction that has shipped so far hands the rider priority or takes it away by a rule they
 * carry in their head. This one paints the answer on the road in front of them — teeth in their own
 * lane, a B6 on their own post — which makes it the easy one to read and the easy one to get wrong,
 * because knowing you must give way is not the same as knowing *what to*.
 *
 * **The car comes from the left, and that is the exercise.** Directly after *Voorrang van rechts*,
 * where the whole lesson was to look right, and a rider who has just learnt that reflex will look
 * right here too, find nothing, and go. Haaientanden do not mean "give way to traffic from the
 * right". They mean give way to that road, and a road has two directions.
 *
 * The car does not react and has no cues. It is on a voorrangsweg doing the limit, which is exactly
 * where a driver has least reason to expect somebody to pull out in front of them.
 *
 * **Its reveal table is flat, and that is a finding about the tool rather than about the road.**
 * The reeks is links, rechts, links, and the last of those was meant to be the look that finds the
 * car. It cannot be. `EYE_LEFT` turns the head 25° and the forward view reaches 31° beyond that, so
 * a glance covers to 56° off the nose — and at the haaientanden the car is 87 m away and 72,9° off
 * it. Measured, not estimated; `zijweg.test.ts` measures it again on every run.
 *
 * Working it backwards makes it worse: to sit inside 56° at the give-way line the car would have to
 * be within about 35 m of the junction, which at fifty is 2,6 s away, and the rider still needs
 * 5,8 s to cover the last 24 m. **With this look model you cannot both see it from the line and
 * have it still be there when you arrive.** The two requirements are geometrically incompatible.
 *
 * So the look here is required because an examiner requires it and because you cannot know the road
 * is clear without it — not because the model rewards it, and this file does not pretend otherwise.
 * What the exercise does teach is scored and does discriminate: arrive slowly enough to stop, and
 * do not go. Riding on earns a `kritiek` at a closest approach of 2,4 m.
 *
 * The gap it exposes is real and is in `BUILDER-GAPS.md`: there is no look between the 25° glance
 * and the 102° schouderblik, and a rider at a give-way line turns their head about 70°. Reaching
 * for `SHOULDER_LEFT` to close it would be worse than the gap — a schouderblik is for the blind
 * spot beside you, and telling a student to do one at a stop line teaches them something false.
 */

import type { Scenario } from './types';

export const zijwegVoorrangVerlenen: Scenario = {
  id: 'zijweg-voorrang-verlenen-v1',
  title: 'Voorrang verlenen op de zijweg',
  briefing: {
    situation:
      'Je komt uit een zijstraat en nadert een voorrangsweg. Op het wegdek vóór je liggen ' +
      'haaientanden en er staat een omgekeerde driehoek. Je gaat rechtdoor, de kruising over.',
    assignment: 'Rijd rechtdoor de kruising over.',
    hints: [
      'Haaientanden betekenen niet "verkeer van rechts voor laten gaan". Ze betekenen: alles op ' +
        'die weg gaat voor. Een weg heeft twee richtingen, dus kijk beide kanten op.',
    ],
  },
  world: {
    kind: 'junction',
    road: {
      halfWidth: 3,
      sideHalfWidth: 3,
      vergeTo: 11,
      // The south-west corner, because the hazard comes from the left and the rider from the
      // south. Perception is angular and knows nothing about houses, so without this the model
      // would credit a look at a car standing behind a terrace — the defect `findHiddenReveals`
      // exists to catch, and the reason it is opened here rather than discovered later.
      openCorners: {
        sw: 95,
      },
    },
    startY: -110,
    runOutM: 55,
    manoeuvre: 'straight',
    turnRadius: 6,
    // Teeth and a B6 in the rider's own lane; a B1 on the road they are crossing. One field, and
    // paint and plate cannot end up telling opposite stories.
    giveWay: 'main',
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
      label: 'Auto van links',
      // Eastbound, so in the southern lane of the priority road — the side a car heading east
      // keeps to. The two paths cross at (1,5 , −1,5), which is a metre and a half *before* the
      // junction proper: traffic from the left is the first thing a rider from a side road meets,
      // and the last thing the voorrang-van-rechts reflex looks for.
      // Where it starts is set from the rider's own approach, not chosen. The two paths cross at
      // (1,5 , −1,5) and a rider who slows for the haaientanden but goes anyway is there at 12,5 s,
      // so the car is there at 12,5 s — 171 m of priority road behind it at the limit.
      from: { x: -171, y: -1.5 },
      to: { x: 60, y: -1.5 },
      speed: 50 / 3.6,
      length: 4.4,
      priorityReason:
        'Je stond voor haaientanden. Die gelden voor de hele voorrangsweg, dus ook voor het ' +
        'verkeer dat van links komt.',
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
      praise: 'Vroeg naar links gekeken, de kant waar je als eerste iets kunt tegenkomen.',
      missed: {
        severity: 'fout',
        explanation:
          'Je keek bij het naderen niet naar links. Dat is de kant die je het eerst oversteekt, ' +
          'en op een voorrangsweg komt daar net zo goed verkeer vandaan als van rechts.',
      },
    },
    {
      id: 'regel-2',
      label: '2. Kijk naar rechts',
      group: 'kijken',
      kind: { type: 'control', control: 'EYE_RIGHT' },
      window: { from: 75, to: 42 },
      tolerance: 10,
      praise: 'En naar rechts, want daar rijdt de andere helft van die weg.',
      missed: {
        severity: 'fout',
        explanation:
          'Je keek niet naar rechts. Je steekt een weg over waar in twee richtingen wordt ' +
          'gereden; één kant controleren is de halve kruising controleren.',
      },
    },
    {
      id: 'regel-3',
      label: '3. Nog een keer naar links',
      group: 'kijken',
      kind: { type: 'control', control: 'EYE_LEFT' },
      window: { from: 28, to: 3 },
      tolerance: 8,
      praise: 'De laatste blik naar links, vlak voordat je gaat. Precies daar zat hij.',
      missed: {
        severity: 'fout',
        explanation:
          'Je keek vlak voor het oversteken niet nog een keer naar links. Je eerste blik was ' +
          'tientallen meters eerder, en in die tijd is hij er komen aanrijden.',
      },
    },
    {
      id: 'regel-4',
      label: '4. Snelheid terug voor de haaientanden',
      group: 'snelheid',
      // Ends before the stop line rather than at it, for the reason the crossroads next door
      // records: run the window to the kerb and a rider who holds the limit and then stands on
      // the brake dips under the threshold in the last few metres, and a panic stop is scored as
      // a careful approach.
      kind: { type: 'speedAtMost', maxKmh: 20 },
      window: { from: 32, to: 12 },
      praise: 'Rustig aangereden, zodat je ook echt voorrang kón verlenen.',
      missed: {
        severity: 'fout',
        explanation:
          'Je reed te hard naar de haaientanden toe. Voorrang verlenen begint met een snelheid ' +
          'waarbij stoppen nog een keuze is.',
      },
    },
  ],
  sequence: {
    label: 'Volgorde',
    ids: ['regel-1', 'regel-2', 'regel-3'],
    outcome: {
      severity: 'opmerking',
      explanation:
        'Links, rechts, en dan nog een keer links. Die laatste blik hoort de laatste te zijn, ' +
        'want daarna ga je.',
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
