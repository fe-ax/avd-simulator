/**
 * Linksaf de Molenweg in: a left turn across an oncoming car that is not going to yield.
 *
 * The first exercise in the tool that turns left, and the first that asks the rider to **give way**
 * rather than to take priority they already hold. Both were buildable long before this — the
 * mirrored quarter-circle has been sitting in `buildJunctionRoutes` since the routes were written —
 * and neither had ever been used, because the model rider could only ride to the right and so no
 * left-turning scenario could be shown to be rideable.
 *
 * **The car does not brake, and that is the whole design.** Every other hazard in this tool reacts:
 * the snorfiets is overtaking, the car from the right stands on everything. This one simply keeps
 * coming at the limit, because it has right of way and a driver with right of way does not slow for
 * somebody who is about to take it. There is no cue list here at all. If the rider turns across it,
 * the car has to brake to avoid them and that is a `kritiek` — the situation solved for you, which
 * is what gevaarzetting means.
 *
 * So the exercise is patience, and the fault it teaches against is the one every examiner watches
 * for on a left turn: creeping into the junction and going anyway because the gap looked adequate
 * from a standstill.
 *
 * The timing is the exercise. The car passes the crossing point at about the moment a rider who
 * never waits would reach it, and that is set from the rider's own approach rather than chosen —
 * `linksaf.test.ts` rides it without yielding and asserts the two bodies genuinely conflict.
 */

import type { Scenario } from './types';

export const linksafTegenliggers: Scenario = {
  id: 'linksaf-tegenliggers-v1',
  title: 'Linksaf de Molenweg in',
  briefing: {
    situation:
      'Je rijdt 50 km/u op een voorrangsweg binnen de bebouwde kom en je gaat bij het ' +
      'eerstvolgende kruispunt linksaf, de Molenweg in. Er komt een auto je tegemoet die ' +
      'rechtdoor gaat.',
    assignment: 'Sla linksaf de Molenweg in.',
    hints: [
      'Wie linksaf slaat, laat het tegemoetkomende verkeer eerst. Dat geldt ook als jij op de ' +
        'voorrangsweg rijdt: die voorrang gaat over de zijweg, niet over de tegenligger.',
    ],
  },
  world: {
    kind: 'junction',
    road: {
      halfWidth: 3,
      sideHalfWidth: 3,
      vergeTo: 11,
      // The north-west corner is opened so the Molenweg's mouth is visible on the approach. The
      // oncoming car is on the rider's own road and never behind a house, so no corner is opened
      // for it — unlike the crossroads next door, where hiding the hazard was the bug.
      openCorners: {
        nw: 40,
      },
    },
    startY: -120,
    runOutM: 55,
    manoeuvre: 'left',
    turnRadius: 7,
    // Priority over the side road, as a voorrangsweg has. It says nothing about the oncoming car,
    // which is the point the briefing makes and the mistake the exercise is about.
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
      label: 'Tegenligger',
      // Southbound in the oncoming lane, mirroring the rider's own. It crosses the rider's exit
      // path at about y = 1,5 — which is precisely where a left turn puts you.
      //
      // Where it starts is set from the rider's own approach, not chosen: a rider who never waits
      // reaches that crossing point at 9,5 s, so the car is there at 9,5 s. Further back and the
      // exercise is a formality; nearer and there was never a gap to wait for.
      from: { x: -1.5, y: 133 },
      to: { x: -1.5, y: -60 },
      speed: 50 / 3.6,
      length: 4.4,
      priorityReason:
        'De tegenligger ging rechtdoor en had voorrang: linksaf slaan betekent wachten tot hij ' +
        'voorbij is.',
    },
  ],
  expected: [
    {
      id: 'regel-1',
      label: '1. Spiegel links',
      group: 'kijken',
      kind: { type: 'control', control: 'MIRROR_LEFT' },
      window: { from: 95, to: 45 },
      tolerance: 10,
      praise: 'Gecontroleerd wie er achter je zit voordat je aankondigde.',
      missed: {
        severity: 'fout',
        explanation:
          'Je keek niet in je linkerspiegel voordat je richting aangaf. Linksaf betekent naar het ' +
          'midden van de weg, en dan moet je weten wie daar al is.',
      },
    },
    {
      id: 'regel-2',
      label: '2. Richting links aangeven',
      group: 'richting',
      kind: { type: 'control', control: 'INDICATOR_LEFT' },
      window: { from: 60, to: 22 },
      tolerance: 8,
      praise: 'Op tijd aangegeven wat je van plan was.',
      missed: {
        severity: 'fout',
        explanation:
          'Je gaf niet aan dat je linksaf ging. De tegenligger en je achterligger moeten allebei ' +
          'kunnen zien dat je gaat afslaan en dus stil komt te staan.',
      },
    },
    {
      id: 'regel-3',
      label: '3. Schouderblik links',
      group: 'kijken',
      kind: { type: 'control', control: 'SHOULDER_LEFT' },
      window: { from: 34, to: 6 },
      tolerance: 8,
      praise: 'De dode hoek links gecontroleerd vlak voor het insturen.',
      missed: {
        severity: 'fout',
        explanation:
          'Je keek niet over je linkerschouder voordat je instuurde. Daar kan een inhaler zitten ' +
          'die je in je spiegel niet ziet, en die komt precies aan de kant waar jij heen gaat.',
      },
    },
    {
      id: 'regel-4',
      label: '4. Afremmen voor de bocht',
      group: 'snelheid',
      kind: { type: 'speedAtMost', maxKmh: 25 },
      window: { from: 40, to: 4 },
      praise: 'Je nam gas terug, dus je kon hem laten gaan. Precies goed.',
      missed: {
        severity: 'fout',
        explanation:
          'Je reed te hard naar het kruispunt toe om de tegenligger nog voor te kunnen laten ' +
          'gaan. Linksaf slaan is bijna altijd even wachten, en dat begint met gas terugnemen.',
      },
    },
    {
      id: 'regel-5',
      label: '5. Terugschakelen naar versnelling 1 of 2',
      group: 'aandrijving',
      kind: { type: 'gearAtMost', maxGear: 2 },
      window: { from: 38, to: 6 },
      praise: 'Teruggeschakeld, dus je kunt na de bocht meteen weer weg.',
      missed: {
        severity: 'opmerking',
        explanation:
          'Je ging de bocht in met een te hoge versnelling. Na het wachten moet je vlot weg ' +
          'kunnen, en in de derde lukt dat niet.',
      },
    },
    {
      id: 'regel-6',
      label: '6. Insturen naar links',
      group: 'sturen',
      kind: { type: 'control', control: 'STEER_LEFT' },
      window: { from: 16, to: -6 },
      tolerance: 8,
      // Auto-sturen is on by default, and with it the sturen controls do nothing at all — so
      // without this the rider was told "je bent niet linksaf gegaan" about a bend the machine had
      // just taken for them, as a kritiek. The worst thing this tool can say, about something that
      // did not happen, on the setting most people will ride first.
      onlyWhenManualSteering: true,
      praise: 'De bocht in.',
      missed: {
        severity: 'kritiek',
        explanation: 'Je bent niet linksaf gegaan. De opdracht is niet uitgevoerd.',
      },
    },
    {
      id: 'regel-7',
      label: 'Richtingaanwijzer uitzetten na de bocht',
      group: 'richting',
      kind: { type: 'afterTurn', control: 'INDICATOR_OFF', withinSeconds: 5 },
      praise: 'Richtingaanwijzer weer uit.',
      late: {
        severity: 'opmerking',
        explanation: 'Je liet de richtingaanwijzer wat lang aan staan na de bocht.',
      },
      missed: {
        severity: 'opmerking',
        explanation:
          'Je liet de richtingaanwijzer aan staan. Op een motor klikt hij niet vanzelf uit, en ' +
          'een knipperlicht dat blijft staan vertelt de rest van de weg iets wat niet klopt.',
      },
    },
  ],
  sequence: {
    label: 'Volgorde',
    ids: ['regel-1', 'regel-2', 'regel-3', 'regel-6'],
    outcome: {
      severity: 'fout',
      explanation:
        'De handelingen kwamen in de verkeerde volgorde. Kijken, dan aankondigen, dan nog een ' +
        'keer kijken, en pas dan sturen.',
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
