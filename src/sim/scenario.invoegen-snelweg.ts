/**
 * Scenario 2 — "Invoegen op de A12".
 *
 * Pure data, like scenario 1. Geometry in world metres, origin at the end of the invoegstrook,
 * +y = north, +x = east. The rider travels north, so left is −x.
 *
 *     geleiderail | rijstrook 2 | rijstrook 1 | blok | invoegstrook | berm
 *  x:   -0.6..0   |  0.3 .. 3.8 |  3.8 .. 7.3 | ..7.8|  7.8 .. 11.3 | ..15.3
 *
 * You come up the oprit at 50, bring it to 100 on the invoegstrook, and move across on
 * spiegel → schouderblik → richting → gaan.
 *
 * WHY THE TRUCK IS BEHIND YOU, CATCHING UP. This was the whole design question, and a headless
 * spike settled it before any of it was built. Put the truck *ahead* and the exercise inverts:
 * at 100 km/h behind an 80 km/h truck you close on it at 5.6 m/s continuously, so "get up to
 * speed" and "keep two seconds" cannot both be satisfied — and the rider who never touches the
 * throttle scores best of all. Measured, across five riding styles and four merge points, every
 * truck-ahead placement rewarded dawdling.
 *
 * With the truck coming up behind, the gradient runs the right way and says the true thing: you
 * accelerate on the invoegstrook so that the traffic already on the motorway does not have to
 * brake for you. Ride it properly and you slot in with three seconds to spare; hesitate and it is
 * a fout; never get off 50 and the truck has to stand on the brakes, which is the critical fault
 * it deserves to be.
 *
 * WHAT THE SCHOUDERBLIK IS FOR HERE, measured rather than assumed. The truck stays in the left
 * mirror the whole way: ride it properly and it is still three seconds back when you go, which is
 * seventy-odd metres — nowhere near the blind spot. So unlike scenario 1, the schouderblik is not
 * what reveals the hazard, and the briefing does not pretend it is. It is still required, for the
 * honest reason an examiner gives: no mirror covers the strook beside you, so looking is the only
 * way to know it is empty.
 *
 * Measured reveal times for the truck, which is the check that this is true:
 *
 *     volledige reeks   4,7s   (de linkerspiegel)
 *     zonder spiegel    nooit  (de schouderblik haalt hem niet)
 *     niets doen       18,2s   (als hij je al voorbij rijdt)
 *
 * A road user that genuinely sits in the dode hoek on this stretch would be a good third actor,
 * and is the obvious next thing to add.
 */
import type { Scenario } from './types';

const KMH = 1 / 3.6;

/** The invoegstrook centreline, and rijstrook 1 — see `motorwayLanes()` for the derivation. */
const RIJSTROOK_1_X = 5.55;

const LOOK_EARLY = {
  severity: 'opmerking' as const,
  explanation:
    'Deze controle kwam zo vroeg op de oprit dat je nog niets kon zien van het verkeer waar je ' +
    'straks tussen moet. Wat je daar zag is tegen de tijd dat je invoegt alweer oud.',
};

const LOOK_LATE = {
  severity: 'opmerking' as const,
  explanation:
    'Deze stap kwam laat. De invoegstrook wordt niet langer: alles wat je wilt weten voordat je ' +
    'de strook verlaat, moet je weten terwijl je er nog op zit.',
};

export const invoegenSnelweg: Scenario = {
  id: 'invoegen-snelweg-v1',
  title: 'Invoegen op de A12',

  briefing: {
    situation:
      'Je rijdt de oprit van de A12 op met 50 km/u. De invoegstrook loopt over ongeveer 150 meter ' +
      'parallel aan de rijbaan en houdt dan op. Op rijstrook 1 nadert een vrachtwagen die 80 rijdt.',
    assignment: 'Voeg in op rijstrook 1, met de snelheid van het verkeer en op veilige afstand.',
    hints: [
      'Breng je snelheid eerst omhoog naar ongeveer 100. Invoegen met een snelheidsverschil van ' +
        'tientallen kilometers per uur dwingt iedereen achter je te remmen.',
      'Vaste volgorde: spiegel links → schouderblik links → richting links → invoegen. De ' +
        'stuurknop werkt pas ná de schouderblik, en één druk is één hele rijstrook.',
      'Houd twee seconden volgafstand. Achter een vrachtwagen zijn het er drie: je kunt zijn ' +
        'remlichten niet zien, dus je hebt langer nodig om te merken dat er iets gebeurt.',
      'De vrachtwagen zie je in je linkerspiegel aankomen. De schouderblik gaat niet over hém: ' +
        'die gaat over de strook zelf, want wat naast je rijdt staat in geen enkele spiegel. Je ' +
        'kijkt om te weten dát het leeg is.',
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

    // A gentle bend onto north. Deliberately gentle, and deliberately over before the
    // invoegstrook starts: a lane change is a lateral offset from the spine, and on a curve an
    // offset machine's real ground speed differs from its progress along the spine by
    // offset / radius. Ending the arc first makes that term exactly zero.
    ramp: { radius: 120, sweepDeg: 18, strookStartY: -150 },

    mergeEndY: 0,
    // A hundred metres of puntstuk. You are told to be over by the deadline; the road gives you
    // rather more than that before it actually runs out, which is how a real one is built.
    taperM: 100,
    runOutM: 120,
  },

  speedLimitKmh: 100,
  startSpeedKmh: 50,
  startGear: 3,
  // 130 so the limit is a choice rather than a wall, and 10 km/h steps so getting from 50 to 100
  // is five deliberate presses instead of ten fidgets.
  maxSpeedKmh: 130,
  throttleStepKmh: 10,
  steering: 'lane',

  actors: [
    {
      // The front of the gap. A car already doing the limit, so it neither runs away nor comes
      // back to you: whatever room you leave yourself behind it is room you chose.
      //
      // It started forty metres further back, tuned against a rider who dawdled forty metres of
      // oprit before touching the throttle. A model rider gets on the gas at once — which is the
      // advice — covers that ground, and arrives 1.7 s off the car's bumper. The builder's own
      // reference ride is what caught it.
      id: 'auto',
      kind: 'auto',
      label: 'Auto op rijstrook 1',
      from: { x: RIJSTROOK_1_X, y: -150 },
      to: { x: RIJSTROOK_1_X, y: 900 },
      speed: 100 * KMH,
      length: 4.4,
      priorityReason:
        'De auto reed al op de snelweg. Invoegend verkeer heeft geen voorrang: jij zoekt het ' +
        'gat, het gat komt niet naar jou toe.',
      keepInBlindSpot: {
        enabled: false,
        minSpeed: 100 * KMH,
        maxSpeed: 100 * KMH,
        targetGap: 0,
        releaseAt: 0,
      },
    },
    {
      id: 'vrachtwagen',
      kind: 'vrachtwagen',
      label: 'Vrachtwagen op rijstrook 1',
      from: { x: RIJSTROOK_1_X, y: -300 },
      to: { x: RIJSTROOK_1_X, y: 400 },
      speed: 80 * KMH,
      // A trekker-oplegger. Following distance is measured bumper to bumper, and seven metres of
      // trailer is about a third of a second at this speed — enough on its own to move a verdict.
      length: 16.5,
      priorityReason:
        'De vrachtwagen reed al op de snelweg. Wie invoegt heeft geen voorrang: jij past je aan ' +
        'het verkeer aan, niet andersom.',
      keepInBlindSpot: {
        // Deterministic. With the director on you would be scoring the director, not the rider —
        // and it may only ever make an actor catch up, which is exactly wrong for a truck you are
        // trying to get in front of.
        enabled: false,
        minSpeed: 80 * KMH,
        maxSpeed: 80 * KMH,
        targetGap: 0,
        releaseAt: 0,
      },
    },
  ],

  expected: [
    {
      id: 'snelheid-op',
      label: '1. Snelheid naar 100 km/u',
      group: 'snelheid',
      kind: { type: 'speedAtLeast', minKmh: 95 },
      // Down to 15 m before the strook runs out. The requirement is to arrive matched to the
      // traffic, not to be matched early: from 50 km/h at 2.2 m/s^2 the machine needs most of
      // the strook, and demanding it sooner would only be demanding a harder launch.
      window: { from: 150, to: 15 },
      praise: 'Je was op snelheid voordat je de strook verliet.',
      missed: {
        severity: 'fout',
        explanation:
          'Je voegde in zonder op snelheid te komen. Met tientallen kilometers per uur verschil ' +
          'moet het verkeer achter je remmen om je erin te laten — dat is precies wat de ' +
          'invoegstrook moet voorkomen.',
      },
    },
    {
      id: 'spiegel-links',
      label: '2. Spiegel links',
      group: 'kijken',
      kind: { type: 'control', control: 'MIRROR_LEFT' },
      window: { from: 130, to: 30 },
      tolerance: 12,
      early: LOOK_EARLY,
      late: LOOK_LATE,
      praise: 'Linkerspiegel gecontroleerd.',
      missed: {
        severity: 'fout',
        explanation:
          'Je hebt de linkerspiegel niet gebruikt. Die laat zien wat er op rijstrook 1 aankomt ' +
          'terwijl je nog rustig op de strook zit — de goedkoopste informatie die je krijgt.',
      },
    },
    {
      id: 'schouderblik-links',
      label: '3. Schouderblik links',
      group: 'kijken',
      kind: { type: 'control', control: 'SHOULDER_LEFT' },
      window: { from: 115, to: 20 },
      tolerance: 10,
      early: LOOK_EARLY,
      late: LOOK_LATE,
      praise: 'Je controleerde de dode hoek voordat je ging.',
      missed: {
        severity: 'fout',
        explanation:
          'Je hebt niet over je linkerschouder gekeken. De vrachtwagen haalt je in en zit op het ' +
          'beslissende moment precies in je dode hoek: in de spiegel is hij dan al weg.',
      },
    },
    {
      id: 'richting-links',
      label: '4. Richting links aangeven',
      group: 'richting',
      kind: { type: 'control', control: 'INDICATOR_LEFT' },
      window: { from: 105, to: 15 },
      tolerance: 12,
      praise: 'Je gaf op tijd richting aan, ná de schouderblik.',
      missed: {
        severity: 'fout',
        explanation:
          'Je hebt niet aangegeven dat je ging invoegen. Het verkeer op rijstrook 1 kan dan niet ' +
          'anticiperen en moet reageren op wat je al doet.',
      },
      late: {
        severity: 'opmerking',
        explanation: 'Je gaf laat richting aan — geef het signaal vóórdat je begint te sturen.',
      },
    },
    {
      id: 'invoegen',
      label: '5. Invoegen op rijstrook 1',
      group: 'sturen',
      kind: { type: 'control', control: 'STEER_LEFT' },
      window: { from: 95, to: 5 },
      tolerance: 15,
      praise: 'Je voegde in terwijl je nog ruimte had.',
      missed: {
        severity: 'kritiek',
        explanation:
          'Je bent de invoegstrook uitgereden zonder in te voegen. De strook houdt gewoon op; ' +
          'daar staan geen borden voor en er is geen ruimte om te wachten.',
      },
      late: {
        severity: 'fout',
        explanation:
          'Je voegde pas in toen de strook bijna op was. Dan heb je geen keus meer, en geen ' +
          'ruimte om af te breken als het toch niet blijkt te kunnen.',
      },
    },
    {
      id: 'volgafstand-auto',
      label: '6. Afstand tot de auto vóór je',
      group: 'snelheid',
      kind: {
        type: 'headway',
        actorId: 'auto',
        bands: [
          { atLeastSeconds: 2, outcome: { praise: 'Je liet genoeg ruimte tot de auto vóór je.' } },
          {
            atLeastSeconds: 1,
            outcome: {
              severity: 'fout',
              explanation:
                'Je zat te dicht op de auto vóór je. Twee seconden is het minimum waarmee je nog ' +
                'kunt reageren op iets wat je niet zag aankomen.',
            },
          },
        ],
      },
      window: { from: 60, to: -110 },
      missed: {
        severity: 'kritiek',
        explanation:
          'Je bent nooit netjes op rijstrook 1 terechtgekomen, dus er viel geen volgafstand te ' +
          'meten.',
      },
    },
    {
      id: 'volgafstand',
      label: '7. Afstand tot de vrachtwagen achter je',
      group: 'snelheid',
      kind: {
        type: 'headway',
        actorId: 'vrachtwagen',
        // Generous first: the first band that fits, wins.
        bands: [
          {
            atLeastSeconds: 3,
            outcome: { praise: 'Je hield ruim afstand tot de vrachtwagen.' },
          },
          {
            atLeastSeconds: 2,
            side: 'ahead',
            outcome: { praise: 'Je voegde in met genoeg ruimte vóór de vrachtwagen.' },
          },
          {
            atLeastSeconds: 2,
            side: 'behind',
            outcome: {
              severity: 'opmerking',
              explanation:
                'Twee seconden is de regel, maar achter een vrachtwagen zijn het er drie: je ' +
                'ziet zijn remlichten niet, dus je merkt later dat er iets gebeurt.',
            },
          },
          {
            atLeastSeconds: 1,
            outcome: {
              severity: 'fout',
              explanation:
                'Je zat te dicht op de vrachtwagen. Onder de twee seconden heb je geen ruimte ' +
                'meer om te reageren op iets wat je niet zag aankomen.',
            },
          },
        ],
      },
      window: { from: 60, to: -110 },
      missed: {
        severity: 'kritiek',
        explanation:
          'Je bent nooit netjes op rijstrook 1 terechtgekomen, dus er viel geen volgafstand te ' +
          'meten.',
      },
    },
    {
      id: 'richting-uit',
      label: '8. Richtingaanwijzer uit na het invoegen',
      group: 'richting',
      kind: { type: 'afterTurn', control: 'INDICATOR_OFF', withinSeconds: 5 },
      praise: 'Je zette de richtingaanwijzer weer uit.',
      missed: {
        severity: 'opmerking',
        explanation:
          'Je richtingaanwijzer bleef aan nadat je was ingevoegd. Op de snelweg leest dat als ' +
          '"ik ga zo weer naar links".',
      },
    },
  ],

  sequence: {
    label: 'Volgorde vóór het invoegen',
    ids: ['spiegel-links', 'schouderblik-links', 'richting-links', 'invoegen'],
    outcome: {
      severity: 'fout',
      explanation:
        'De reeks vóór het invoegen liep niet in de goede volgorde. Spiegel, schouderblik, ' +
        'richting, gaan: elke stap gaat over informatie die de volgende nodig heeft.',
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
        'Je keek erg vaak achter elkaar. Kijken is informatie ophalen; twee keer achter elkaar ' +
        'levert de tweede keer niets nieuws op, en ondertussen zie je de weg vóór je niet.',
    },
    fault: {
      severity: 'fout',
      explanation:
        'Je scande vrijwel onafgebroken in plaats van gericht te kijken. Op honderd kilometer ' +
        'per uur leg je per schouderblik dertig meter blind af.',
    },
  },

  controlPrerequisites: [
    {
      label: 'Eerst kijken, dan invoegen',
      control: 'STEER_LEFT',
      requires: ['SHOULDER_LEFT'],
      message: 'Eerst een schouderblik links',
      outcome: {
        severity: 'fout',
        explanation:
          'Je stuurde de rijstrook op zonder er eerst over je schouder naar te kijken. De ' +
          'spiegel dekt die hoek niet, en juist daar zit de vrachtwagen die je aan het inhalen ' +
          'is. De stuurknop deed daarom niets.',
      },
    },
  ],

  // Going back to the right is legitimate here — it is how you abort a merge you should not have
  // started — so unlike scenario 1 there is no rule against steering the other way.
  unwanted: [
    {
      id: 'richting-rechts-ongewenst',
      label: 'Richting rechts aangegeven',
      group: 'richting',
      control: 'INDICATOR_RIGHT',
      outcome: {
        severity: 'fout',
        explanation:
          'Je gaf richting rechts aan terwijl je naar links moest invoegen. Een verkeerd signaal ' +
          'is gevaarlijker dan geen signaal.',
      },
    },
  ],

  verdictRule: { faultLimit: 3 },
};
