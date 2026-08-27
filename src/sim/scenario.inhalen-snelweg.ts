/**
 * Scenario 3 — "Inhalen op de A12".
 *
 * Pure data. Open motorway, two lanes, no oprit. You come up behind two lorries running nose to
 * tail at 90 and have to get past both of them.
 *
 * WHY THERE IS NO CONFLICT POINT. The other two scenarios happen somewhere: a fietspad centreline,
 * the end of an invoegstrook. Every window in them is metres before that place. An overtake is not
 * like that — it happens wherever the rider decides it happens, and that decision *is* the
 * exercise. So the reeks here hangs off the manoeuvre instead: each look has to have happened in
 * the seconds before the machine actually moved. Anchor it to a milepost and you score the rider's
 * choice of milepost.
 *
 * THE GAP BETWEEN THE LORRIES is the lesson. Forty-odd metres of clear road, which at 90 km/h is
 * about one and a half seconds: from behind it looks like somewhere to go, and it is not. Pass the
 * first and tuck straight back in and you have woven — legal-looking, unsafe, and the exact habit
 * an examiner is watching for. The rule that catches it is the ordinary following-distance rule,
 * measured against both lorries after you return to the right: come back properly and they are
 * both far behind you, squeeze in and both gaps are impossible.
 *
 *      rijstrook 2  ->  x = 2.05   the traffic you have to wait for
 *      rijstrook 1  ->  x = 5.55   you, and the lorries
 */
import type { Scenario } from './types';

const KMH = 1 / 3.6;

/** Lane centres, from `motorwayLanes` for this road: rijstrook 1 first. */
const RIJSTROOK_1 = 5.55;
const RIJSTROOK_2 = 2.05;

const LOOK_LATE = {
  severity: 'fout' as const,
  explanation:
    'Deze controle kwam niet vlak vóór het insturen. Wat je tien seconden geleden zag zegt niets ' +
    'over de strook waar je nú op gaat: op de snelweg legt een auto in die tijd driehonderd meter af.',
};

export const inhalenSnelweg: Scenario = {
  id: 'inhalen-snelweg-v1',
  title: 'Inhalen op de A12',

  briefing: {
    situation:
      'Je rijdt op rijstrook 1 van de A12 met ongeveer 105 km/u. Vóór je rijden twee vrachtwagens ' +
      'kort achter elkaar, allebei 90. Op rijstrook 2 is het druk.',
    assignment: 'Haal de vrachtwagens in en ga daarna weer netjes naar rechts.',
    hints: [
      'Kijk eerst of je erlangs kunt: spiegel links → schouderblik links → richting links → gaan. ' +
        'De stuurknop werkt pas ná de schouderblik, en één druk is één hele rijstrook.',
      'Het gat tussen de twee vrachtwagens is geen gat. Het is krap anderhalve seconde, en daar ' +
        'hoor je niet tussen te gaan zitten — blijf links tot je ze allebei voorbij bent.',
      'Ga daarna wél terug naar rechts. Rechts houden is de regel; links blijven hangen omdat het ' +
        'makkelijker rijdt, is een fout.',
      'Terug naar rechts gaat net zo: spiegel rechts → schouderblik rechts → richting rechts → gaan.',
    ],
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
    // Open road. Nothing joins it and nothing leaves it; the only thing that happens is what the
    // rider chooses to do.
    stretch: { kind: 'doorgaand', startY: 0, endY: 1300 },
  },

  speedLimitKmh: 130,
  startSpeedKmh: 105,
  startGear: 5,
  maxSpeedKmh: 140,
  throttleStepKmh: 5,
  steering: 'lane',

  actors: [
    {
      id: 'vrachtwagen-1',
      kind: 'vrachtwagen',
      label: 'Eerste vrachtwagen',
      from: { x: RIJSTROOK_1, y: 95 },
      to: { x: RIJSTROOK_1, y: 1400 },
      speed: 90 * KMH,
      length: 16.5,
      priorityReason:
        'De vrachtwagens reden al waar ze reden. Wie inhaalt past zich aan, niet andersom.',
      keepInBlindSpot: { enabled: false, minSpeed: 90 * KMH, maxSpeed: 90 * KMH, targetGap: 0, releaseAt: 0 },
    },
    {
      id: 'vrachtwagen-2',
      kind: 'vrachtwagen',
      label: 'Tweede vrachtwagen',
      // Sixty metres nose to nose, so about forty-three of clear road: 1.7 s at ninety. From
      // behind that reads as a gap. It is not one, and that is the whole exercise.
      from: { x: RIJSTROOK_1, y: 155 },
      to: { x: RIJSTROOK_1, y: 1460 },
      speed: 90 * KMH,
      length: 16.5,
      priorityReason: 'Dezelfde vrachtwagen-regel: jij haalt in, zij rijden gewoon door.',
      keepInBlindSpot: { enabled: false, minSpeed: 90 * KMH, maxSpeed: 90 * KMH, targetGap: 0, releaseAt: 0 },
    },
    {
      id: 'auto-1',
      kind: 'auto',
      label: 'Auto op rijstrook 2',
      // Coming up behind you at 130. Until it is past there is nowhere to go, which is what makes
      // the mirror and the schouderblik decide something instead of confirm something.
      from: { x: RIJSTROOK_2, y: -22 },
      to: { x: RIJSTROOK_2, y: 1600 },
      speed: 135 * KMH,
      length: 4.4,
      keepInBlindSpot: { enabled: false, minSpeed: 135 * KMH, maxSpeed: 135 * KMH, targetGap: 0, releaseAt: 0 },
    },
    {
      id: 'auto-2',
      kind: 'auto',
      label: 'Tweede auto op rijstrook 2',
      from: { x: RIJSTROOK_2, y: -52 },
      to: { x: RIJSTROOK_2, y: 1600 },
      speed: 135 * KMH,
      length: 4.4,
      keepInBlindSpot: { enabled: false, minSpeed: 135 * KMH, maxSpeed: 135 * KMH, targetGap: 0, releaseAt: 0 },
    },
  ],

  expected: [
    {
      id: 'spiegel-links',
      label: '1. Spiegel links',
      group: 'kijken',
      kind: { type: 'beforeLaneChange', control: 'MIRROR_LEFT', direction: 'left', withinSeconds: 8 },
      praise: 'Je keek in de linkerspiegel voordat je ging.',
      missed: LOOK_LATE,
    },
    {
      id: 'schouderblik-links',
      label: '2. Schouderblik links',
      group: 'kijken',
      kind: { type: 'beforeLaneChange', control: 'SHOULDER_LEFT', direction: 'left', withinSeconds: 6 },
      praise: 'Je controleerde de dode hoek voordat je uitscheerde.',
      missed: LOOK_LATE,
    },
    {
      id: 'richting-links',
      label: '3. Richting links aangeven',
      group: 'richting',
      kind: { type: 'beforeLaneChange', control: 'INDICATOR_LEFT', direction: 'left', withinSeconds: 6 },
      praise: 'Je gaf aan dat je eruit ging.',
      missed: {
        severity: 'fout',
        explanation:
          'Je scheerde uit zonder richting aan te geven. Op rijstrook 2 komt verkeer een stuk ' +
          'harder aan dan jij rijdt; die mensen moeten kunnen zien wat je van plan bent.',
      },
    },
    {
      id: 'inhalen',
      label: '4. Naar rijstrook 2',
      group: 'sturen',
      kind: { type: 'laneChange', direction: 'left' },
      praise: 'Je haalde in.',
      missed: {
        severity: 'kritiek',
        explanation:
          'Je bent achter de vrachtwagens blijven rijden. De opdracht was inhalen; die is niet ' +
          'uitgevoerd, en dat betekent op het examen direct afbreken.',
      },
    },
    {
      id: 'spiegel-rechts',
      label: '5. Spiegel rechts',
      group: 'kijken',
      kind: { type: 'beforeLaneChange', control: 'MIRROR_RIGHT', direction: 'right', withinSeconds: 8 },
      praise: 'Rechterspiegel gecontroleerd voordat je terugging.',
      missed: LOOK_LATE,
    },
    {
      id: 'schouderblik-rechts',
      label: '6. Schouderblik rechts',
      group: 'kijken',
      kind: { type: 'beforeLaneChange', control: 'SHOULDER_RIGHT', direction: 'right', withinSeconds: 6 },
      praise: 'Je keek over je rechterschouder voordat je terugging.',
      missed: {
        severity: 'fout',
        explanation:
          'Je stuurde naar rechts zonder over je schouder te kijken. Je spiegel dekt die hoek ' +
          'niet, en een vrachtwagen die je net gepasseerd bent zit precies daar.',
      },
    },
    {
      id: 'richting-rechts',
      label: '7. Richting rechts aangeven',
      group: 'richting',
      kind: { type: 'beforeLaneChange', control: 'INDICATOR_RIGHT', direction: 'right', withinSeconds: 6 },
      praise: 'Je gaf aan dat je terugging.',
      missed: {
        severity: 'opmerking',
        explanation: 'Je ging terug naar rechts zonder dat aan te geven.',
      },
    },
    {
      id: 'terug-naar-rechts',
      label: '8. Terug naar rijstrook 1',
      group: 'sturen',
      kind: { type: 'laneChange', direction: 'right' },
      praise: 'Je ging na het inhalen weer netjes naar rechts.',
      missed: {
        severity: 'fout',
        explanation:
          'Je bent op rijstrook 2 blijven rijden. Rechts houden is geen suggestie: links blijven ' +
          'hangen omdat het prettiger rijdt, houdt de hele snelweg op.',
      },
    },
    {
      id: 'tempo',
      label: 'Tempo bij het naderen',
      group: 'snelheid',
      // Judged over the approach only. Easing off behind a lorry you are about to pass is normal
      // riding, and a band that ran the whole way would mark it as being too slow.
      // The opening stretch only, while you are still free. Easing off behind a lorry you are
      // about to pass is ordinary riding, and a band that ran the whole way would call it slow.
      window: { from: 1300, to: 1190 },
      kind: {
        type: 'speedBand',
        bands: [
          { fromKmh: 100, toKmh: 130, outcome: { praise: 'Je reed het tempo van de weg.' } },
          {
            fromKmh: 95,
            toKmh: 100,
            outcome: {
              severity: 'opmerking',
              explanation: 'Net iets onder het tempo van de weg — daarmee hou je rijstrook 1 op.',
            },
          },
        ],
      },
      missed: {
        severity: 'fout',
        explanation:
          'Je tempo paste niet bij deze weg. Te traag houdt het verkeer achter je op, te hard is ' +
          'te hard.',
      },
    },
    {
      id: 'afstand-vrachtwagen-1',
      label: 'Afstand tot de eerste vrachtwagen',
      group: 'snelheid',
      kind: {
        type: 'headway',
        actorId: 'vrachtwagen-1',
        bands: [
          { atLeastSeconds: 2, outcome: { praise: 'Je hield genoeg afstand tot de eerste vrachtwagen.' } },
          {
            atLeastSeconds: 1,
            outcome: {
              severity: 'fout',
              explanation:
                'Je zat te dicht op de eerste vrachtwagen. Als dit vlak na het teruggaan gebeurde: ' +
                'dan ben je tussen de twee vrachtwagens gaan zitten, en daar is geen ruimte voor.',
            },
          },
        ],
      },
      window: { from: 1250, to: -50 },
      missed: {
        severity: 'opmerking',
        explanation: 'Er viel geen volgafstand tot de eerste vrachtwagen te meten.',
      },
    },
    {
      id: 'afstand-vrachtwagen-2',
      label: 'Afstand tot de tweede vrachtwagen',
      group: 'snelheid',
      kind: {
        type: 'headway',
        actorId: 'vrachtwagen-2',
        bands: [
          { atLeastSeconds: 2, outcome: { praise: 'Je hield genoeg afstand tot de tweede vrachtwagen.' } },
          {
            atLeastSeconds: 1,
            outcome: {
              severity: 'fout',
              explanation:
                'Je zat te dicht op de tweede vrachtwagen. Tussen twee vrachtwagens invoegen is ' +
                'geen inhalen maar weven: je hebt geen uitwijkruimte en zij zien je nauwelijks.',
            },
          },
        ],
      },
      window: { from: 1250, to: -50 },
      missed: {
        severity: 'opmerking',
        explanation: 'Er viel geen volgafstand tot de tweede vrachtwagen te meten.',
      },
    },
  ],

  sequence: {
    label: 'Volgorde vóór het uitscheren',
    ids: ['spiegel-links', 'schouderblik-links', 'richting-links', 'inhalen'],
    outcome: {
      severity: 'fout',
      explanation:
        'De reeks vóór het uitscheren liep niet in de goede volgorde. Spiegel, schouderblik, ' +
        'richting, gaan: elke stap gaat over informatie die de volgende nodig heeft.',
    },
  },

  lookDiscipline: {
    minRepeatSeconds: 2,
    maxInBurst: 8,
    burstSeconds: 3,
    warnAt: 4,
    faultAt: 8,
    warning: {
      severity: 'opmerking',
      explanation:
        'Je keek erg vaak achter elkaar. Twee keer achter elkaar levert de tweede keer niets ' +
        'nieuws op, en ondertussen zie je de weg vóór je niet.',
    },
    fault: {
      severity: 'fout',
      explanation:
        'Je scande vrijwel onafgebroken in plaats van gericht te kijken. Op honderd kilometer per ' +
        'uur leg je per schouderblik dertig meter blind af.',
    },
  },

  controlPrerequisites: [
    {
      label: 'Eerst kijken, dan uitscheren',
      control: 'STEER_LEFT',
      requires: ['SHOULDER_LEFT'],
      message: 'Eerst een schouderblik links',
      outcome: {
        severity: 'fout',
        explanation:
          'Je stuurde rijstrook 2 op zonder er eerst over je schouder naar te kijken. Daar komt ' +
          'verkeer dertig kilometer per uur harder aan dan jij rijdt.',
      },
    },
    {
      label: 'Eerst kijken, dan terug',
      control: 'STEER_RIGHT',
      requires: ['SHOULDER_RIGHT'],
      message: 'Eerst een schouderblik rechts',
      outcome: {
        severity: 'fout',
        explanation:
          'Je stuurde terug naar rechts zonder over je schouder te kijken. Een vrachtwagen die je ' +
          'net voorbij bent zit precies in die hoek.',
      },
    },
  ],

  unwanted: [],

  verdictRule: { faultLimit: 3 },
};
