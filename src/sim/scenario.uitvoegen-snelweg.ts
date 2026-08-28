/**
 * Uitvoegen op de A12
 *
 * Gebouwd met de scenario-bouwer.
 */
import type { Scenario } from './types';

export const uitvoegenSnelweg: Scenario = {
  id: 'uitvoegen-snelweg-v1',
  title: 'Uitvoegen op de A12',
  briefing: {
    situation: 'Je rijdt 105 op rijstrook 1 van de A12, waar 100 is toegestaan. Vóór je rijden drie vrachtwagens vlak achter elkaar, alle drie op 90 — je loopt dus op ze in. Rijstrook 2 is leeg. Over ruim zeshonderd meter ligt de afrit die je moet hebben.',
    assignment: 'Neem de afrit. Voeg meteen aan het begin van de uitvoegstrook uit.',
    hints: [
      'Er houdt je niets tegen om er met 130 langs te gaan — behalve dat je dan van rijstrook 2 dwars naar de uitvoegstrook moet, met die strook al half op. Achter drie vrachtwagens blijven hangen voelt traag en is hier het goede antwoord.',
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
    stretch: {
      kind: 'afrit',
      startY: -620,
      strookStartY: 0,
      strookLengthM: 300,
      exit: {
        radius: 150,
        sweepDeg: 22,
      },
    },
  },
  speedLimitKmh: 100,
  startSpeedKmh: 105,
  maxSpeedKmh: 130,
  startGear: 3,
  throttleStepKmh: 10,
  steering: 'lane',
  actors: [
    {
      id: 'weggebruiker-1',
      kind: 'vrachtwagen',
      label: 'Voorste vrachtwagen',
      from: {
        x: 5.55,
        y: -485,
      },
      to: {
        x: 5.55,
        y: 1115,
      },
      speed: 90 / 3.6,
      length: 16.5,
    },
    {
      id: 'weggebruiker-2',
      kind: 'vrachtwagen',
      label: 'Tweede vrachtwagen',
      from: {
        x: 5.55,
        y: -510,
      },
      to: {
        x: 5.55,
        y: 1090,
      },
      speed: 90 / 3.6,
      length: 16.5,
    },
    {
      id: 'weggebruiker-3',
      kind: 'vrachtwagen',
      label: 'Derde vrachtwagen',
      from: {
        x: 5.55,
        y: -535,
      },
      to: {
        x: 5.55,
        y: 1065,
      },
      speed: 90 / 3.6,
      length: 16.5,
    },
  ],
  expected: [
    {
      id: 'regel-2',
      label: '1. Spiegel rechts',
      group: 'kijken',
      kind: {
        type: 'control',
        control: 'MIRROR_RIGHT',
      },
      window: {
        from: 260,
        to: 40,
      },
      tolerance: 10,
      praise: 'Gecontroleerd.',
      missed: {
        severity: 'fout',
        explanation: 'Je keek niet in je rechterspiegel voordat je uitvoegde. Op een afrit is dat je eerste controle: wie zit er rechtsachter je, en haalt die je in?',
      },
    },
    {
      id: 'regel-3',
      label: '2. Schouderblik rechts',
      group: 'kijken',
      kind: {
        type: 'beforeLaneChange',
        control: 'SHOULDER_RIGHT',
        direction: 'right',
        withinSeconds: 7,
      },
      praise: 'Gecontroleerd vóór je ging.',
      missed: {
        severity: 'fout',
        explanation: 'Je stuurde de uitvoegstrook op zonder schouderblik rechts. Precies daar zit je dode hoek, en op een afrit is dat de plek waar een inhaler zit.',
      },
    },
    {
      id: 'regel-4',
      label: '3. Richting rechts aangeven',
      group: 'richting',
      kind: {
        type: 'beforeLaneChange',
        control: 'INDICATOR_RIGHT',
        direction: 'right',
        withinSeconds: 7,
      },
      praise: 'Gecontroleerd vóór je ging.',
      missed: {
        severity: 'fout',
        explanation: 'Je gaf niet aan dat je eruit ging. Achterliggers moeten kunnen zien dat je de snelweg verlaat, zeker als je vlak achter vrachtwagens rijdt.',
      },
    },
    {
      id: 'regel-5',
      label: '4. Uitvoegen, meteen',
      group: 'sturen',
      kind: {
        type: 'laneChange',
        direction: 'right',
        bands: [
          {
            fromD: 45,
            toD: -60,
            outcome: {
              praise: 'Je voegde meteen uit, zodra de strook er was. Precies goed: dan heb je de hele strook nog om af te remmen.',
            },
          },
          {
            fromD: -60,
            toD: -150,
            outcome: {
              severity: 'opmerking',
              explanation: 'Je voegde wat laat uit. Het kon nog, maar je gaf jezelf minder strook om op de afrit af te remmen dan nodig was.',
            },
          },
          {
            fromD: -150,
            toD: -300,
            outcome: {
              severity: 'fout',
              explanation: 'Je voegde pas in de tweede helft van de strook uit. Zo snijd je op het laatste moment naar rechts, met steeds minder strook over — meestal omdat je eerst nog langs de vrachtwagens wilde.',
            },
          },
          {
            fromD: 620,
            toD: 45,
            outcome: {
              severity: 'fout',
              explanation: 'Je stuurde naar rechts voordat de uitvoegstrook er was. Daar ligt nog geen rijstrook naast je, alleen berm.',
            },
          },
        ],
      },
      praise: 'Je wisselde van rijstrook.',
      missed: {
        severity: 'kritiek',
        explanation: 'Je bent nooit van rijstrook gewisseld. De opdracht is niet uitgevoerd.',
      },
    },
    {
      id: 'regel-1',
      label: '5. Volgafstand tot de vrachtwagen',
      group: 'snelheid',
      kind: {
        type: 'headway',
        actorId: 'weggebruiker-3',
        bands: [
          {
            atLeastSeconds: 2,
            outcome: {
              praise: 'Je hield genoeg afstand.',
            },
          },
          {
            atLeastSeconds: 1,
            outcome: {
              severity: 'fout',
              explanation: 'Je zat te dicht erop om nog te kunnen reageren.',
            },
          },
        ],
      },
      window: {
        from: 200,
        to: -100,
      },
      missed: {
        severity: 'opmerking',
        explanation: 'Je bleef te dicht op de vrachtwagen hangen. Achter iets waar je niet langs kunt kijken hoort meer afstand, niet minder.',
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
