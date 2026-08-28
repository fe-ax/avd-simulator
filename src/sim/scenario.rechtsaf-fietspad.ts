/**
 * Scenario 1 — "Rechtsaf de Kerkstraat in".
 *
 * Pure data. Nothing here is imported by the renderer or the UI except through the engine,
 * so the future drag & drop editor can produce this object without touching code.
 *
 * Geometry (world metres, origin at the intersection centre, +y = north, +x = east):
 *
 *      rijbaan          berm   fietspad   berm
 *   x: -3 ....... 3 | 3 .. 4.5 | 4.5 .. 6.5 | 6.5 .. 10
 *
 * The rider travels north in the right-hand lane (x = 1.5) and turns right into the
 * Kerkstraat, crossing the fietspad. The fietspad keeps priority, so the correct ride stops
 * and lets the snorfiets go first.
 *
 * Why 30 km/h: the snorfiets does a constant 25 km/h. For it to close in from *behind* into
 * the dode hoek — rather than starting ahead of the rider where it would be plainly visible —
 * the rider's average speed over the approach has to sit below 25 km/h. A 30-zone gives that
 * and is an entirely ordinary Dutch residential setting.
 */
import type { Scenario } from './types';

const KMH = 1 / 3.6;

/**
 * The preparation looks share one early and one late outcome.
 *
 * Both bounds are real, and they are wide. A look is not a stopwatch exercise — you do it because
 * you want to know something — so there are tens of metres of room in the middle. But looking
 * before the junction is even in sight tells you nothing about it, and leaving it until you are
 * on top of the crossing is too late to act on. The order, judged separately, is what actually
 * structures the reeks.
 */
const LOOK_EARLY = {
  severity: 'opmerking' as const,
  explanation:
    'Deze blik kwam al voordat het kruispunt in beeld was. Zo vroeg kijken levert niets op over ' +
    'de bocht die je gaat maken: wat je daar zag is tegen de tijd dat je er bent alweer oud.',
};

const LOOK_LATE = {
  severity: 'opmerking' as const,
  explanation:
    'Deze stap kwam laat in de reeks. De voorbereiding hoort klaar te zijn vóórdat je richting ' +
    'aangeeft, zodat je aankondiging op iets berust wat je net gezien hebt.',
};

export const rechtsafFietspad: Scenario = {
  id: 'rechtsaf-fietspad-v1',
  title: 'Rechtsaf de Kerkstraat in',

  briefing: {
    situation:
      'Je zit op de motor in een 30-kilometerzone op de Dorpsstraat. Rechts naast de rijbaan ligt ' +
      'een vrijliggend fietspad. Je nadert een gelijkwaardig kruispunt.',
    assignment: 'Sla bij het eerstvolgende kruispunt rechtsaf, de Kerkstraat in.',
    hints: [
      'Klik in beeld en draai je hoofd met de muis. Op elke plek die je moet controleren zweeft ' +
        'een grijze stip: houd het kruisje er even op tot hij oplicht. Er langs vegen telt niet. ' +
        'En terwijl je over je schouder kijkt, zie je de weg vóór je niet.',
      'Je spiegels zijn wazig tot je ernaar kijkt: je ziet dát er iets is, niet wát het is.',
      'Vaste volgorde vóór de bocht: blik links → spiegel links → blik rechts → spiegel rechts → ' +
        'schouderblik rechts → richting aangeven. Vlak vóór de bocht nog één keer links kijken, ' +
        'en als laatste een schouderblik rechts. De richtingaanwijzer werkt pas ná de eerste ' +
        'schouderblik.',
      'Jij slaat af, de snorfiets gaat rechtdoor op dezelfde weg — en dat fietspad hoort bij de ' +
        'Dorpsstraat. Afslaand verkeer laat rechtdoorgaand verkeer op dezelfde weg voorgaan, dus ' +
        'hij gaat vóór jou. De haaientanden gelden voor verkeer dat de Kerkstraat uit komt, niet ' +
        'voor jou.',
    ],
  },

  // Voorrang hier volgt uit de afslaanregel: wie afslaat laat rechtdoorgaand verkeer op dezelfde
  // weg voorgaan. Het vrijliggende fietspad hoort bij de Dorpsstraat, dus de snorfiets die
  // rechtdoor gaat heeft voorrang op de motorrijder die rechtsaf slaat. De haaientanden in de
  // tekening gaan over iets anders — verkeer dat de Kerkstraat uit komt — en zijn hier decor.
  world: {
    kind: 'urbanCrossing',
    road: {
      halfWidth: 3,
      laneCenterX: 1.5,
      fietspadFrom: 4.5,
      fietspadTo: 6.5,
      vergeTo: 11,
      sideHalfWidth: 3,
      sideLaneCenterY: -1.5,
    },

    // 120 m of straight approach, then a 6 m radius right-hander onto y = -1.5. The approach is
    // long because the look sequence below is six actions deep: the first 45 m are settling time,
    // the junction only comes into view around 85 m out, and the sequence starts after that.
    // turnInY + turnRadius must equal sideLaneCenterY or buildRoutes() throws.
    approach: { startY: -127.5, turnInY: -7.5, turnRadius: 6, exitX: 55 },

    // Fietspad centreline. The route crosses it at s = 97.39 m; that is the conflict point every
    // window below is measured back from.
    conflictX: 5.5,
  },

  speedLimitKmh: 30,
  startSpeedKmh: 30,
  startGear: 3,
  maxSpeedKmh: 60,
  throttleStepKmh: 5,
  steering: 'branch',

  actors: [
    {
      id: 'snorfiets',
      kind: 'snorfiets',
      label: 'Snorfiets op het fietspad',
      from: { x: 5.5, y: -131.5 },
      to: { x: 5.5, y: 45 },
      speed: 25 * KMH,
      priorityReason:
        'Jij sloeg af en de snorfiets ging rechtdoor op dezelfde weg — het vrijliggende fietspad ' +
        'hoort bij de Dorpsstraat. Wie afslaat laat rechtdoorgaand verkeer op dezelfde weg ' +
        'voorgaan, dus hij had voorrang. De haaientanden verderop gaan hier niet over: die ' +
        'gelden voor verkeer dat de Kerkstraat uit komt.',
      keepInBlindSpot: {
        enabled: true,
        // Never below its cruising speed: this snorfiets has right of way and does not defer to
        // a motorcycle that is about to take it. All the director may do is close a gap that
        // opened while the rider was still at 30 km/h.
        minSpeed: 25 * KMH,
        maxSpeed: 28 * KMH,
        targetGap: 3.5,
        // Released well before the crossing, so everything the rider actually sees in the last
        // stretch is plain constant-speed physics.
        releaseAt: 25,
      },
    },
  ],

  expected: [
    {
      id: 'blik-links',
      label: '1. Blik links',
      group: 'kijken',
      kind: { type: 'control', control: 'EYE_LEFT' },
      window: { from: 100, to: 42 },
      tolerance: 10,
      early: LOOK_EARLY,
      late: LOOK_LATE,
      praise: 'Je opende de reeks met een blik naar links.',
      missed: {
        severity: 'fout',
        explanation:
          'Je hebt niet naar links gekeken bij het voorbereiden van de bocht. De reeks begint ' +
          'links, omdat dat de kant is waar je niets meer mee te maken wilt hebben voordat je ' +
          'je op rechts richt.',
      },
    },
    {
      id: 'spiegel-links',
      label: '2. Spiegel links',
      group: 'kijken',
      kind: { type: 'control', control: 'MIRROR_LEFT' },
      window: { from: 96, to: 38 },
      tolerance: 12,
      early: LOOK_EARLY,
      late: LOOK_LATE,
      praise: 'Linkerspiegel gecontroleerd.',
      missed: {
        severity: 'fout',
        explanation:
          'Je hebt de linkerspiegel overgeslagen. Je moet weten of er iemand bezig is jou links ' +
          'in te halen voordat je snelheid gaat minderen.',
      },
    },
    {
      id: 'blik-rechts',
      label: '3. Blik rechts',
      group: 'kijken',
      kind: { type: 'control', control: 'EYE_RIGHT' },
      window: { from: 92, to: 34 },
      tolerance: 12,
      early: LOOK_EARLY,
      late: LOOK_LATE,
      praise: 'Je keek rechts het kruispunt op.',
      missed: {
        severity: 'fout',
        explanation:
          'Je hebt niet naar rechts gekeken. Verkeer van rechts heeft op een gelijkwaardig ' +
          'kruispunt voorrang, en het is bovendien de kant waar je naartoe gaat.',
      },
    },
    {
      id: 'spiegel-rechts',
      label: '4. Spiegel rechts',
      group: 'kijken',
      kind: { type: 'control', control: 'MIRROR_RIGHT' },
      window: { from: 88, to: 30 },
      tolerance: 12,
      early: LOOK_EARLY,
      late: LOOK_LATE,
      praise: 'Rechterspiegel gecontroleerd.',
      missed: {
        severity: 'fout',
        explanation:
          'Je hebt de rechterspiegel overgeslagen. Die laat het fietspad achter je zien — nog ' +
          'niet de dode hoek, maar wel alles wat daar zo meteen in verdwijnt.',
      },
    },
    {
      id: 'schouderblik-voorbereiding',
      label: '5. Schouderblik rechts (voorbereiding)',
      group: 'kijken',
      kind: { type: 'control', control: 'SHOULDER_RIGHT' },
      window: { from: 84, to: 30 },
      tolerance: 8,
      early: LOOK_EARLY,
      late: LOOK_LATE,
      praise: 'Je controleerde de dode hoek voordat je je bedoeling kenbaar maakte.',
      missed: {
        severity: 'fout',
        explanation:
          'Je hebt vóór het richting aangeven niet over je rechterschouder gekeken. Eerst weten ' +
          'of het vrij is, dan pas aankondigen wat je gaat doen.',
      },
    },
    {
      id: 'richting-rechts',
      label: '6. Richting rechts aangeven',
      group: 'richting',
      kind: { type: 'control', control: 'INDICATOR_RIGHT' },
      window: { from: 76, to: 22 },
      tolerance: 12,
      praise: 'Je gaf op tijd richting aan, ná de schouderblik.',
      missed: {
        severity: 'fout',
        explanation:
          'Je hebt geen richting aangegeven. Het verkeer om je heen kan je bedoeling niet raden; ' +
          'dit is op het examen een duidelijke fout.',
      },
      early: {
        severity: 'opmerking',
        explanation:
          'Je gaf erg vroeg richting aan. Bestuurders kunnen dan denken dat je een eerdere zijweg neemt.',
      },
      late: {
        severity: 'opmerking',
        explanation:
          'Je gaf laat richting aan. Geef het signaal ruim vóór de bocht, zodat anderen zich kunnen aanpassen.',
      },
    },
    {
      id: 'terugschakelen',
      label: 'Terugschakelen naar versnelling 1 of 2',
      group: 'aandrijving',
      kind: { type: 'gearAtMost', maxGear: 2 },
      window: { from: 46, to: 16 },
      praise: 'Je schakelde tijdig terug.',
      missed: {
        severity: 'opmerking',
        explanation:
          'Je nam de bocht in een te hoge versnelling. Schakel terug vóór de bocht, zodat je met ' +
          'gas de motor stabiel kunt houden en direct kunt doorrijden.',
      },
    },
    {
      id: 'snelheid-minderen',
      label: 'Snelheid terug naar maximaal 15 km/u',
      group: 'snelheid',
      kind: { type: 'speedAtMost', maxKmh: 15 },
      window: { from: 40, to: 16 },
      praise: 'Je snelheid was op tijd aangepast aan de bocht.',
      missed: {
        severity: 'fout',
        explanation:
          'Je reed te hard het kruispunt op. Met deze snelheid kun je niet meer stoppen voor het ' +
          'fietspad en gaat de bocht te ruim.',
      },
    },
    {
      id: 'blik-links-eind',
      label: '7. Blik links (vlak vóór de bocht)',
      group: 'kijken',
      kind: { type: 'control', control: 'EYE_LEFT' },
      window: { from: 32, to: 10 },
      tolerance: 8,
      praise: 'Je controleerde links nog één keer voordat je het kruispunt op reed.',
      missed: {
        severity: 'fout',
        explanation:
          'Je hebt vlak vóór de bocht niet meer naar links gekeken. Verkeer van links moet jou ' +
          'voor laten gaan, maar dat is geen garantie dat het gebeurt — en je kijkt hier juist ' +
          'om te zien dát er niemand aankomt. Wat je aan het begin van de reeks zag is nu ' +
          'tientallen meters oud.',
      },
      early: {
        severity: 'opmerking',
        explanation:
          'Deze laatste blik naar links kwam te vroeg om nog een bevestiging te zijn. Kijk ' +
          'vlak vóór je het kruispunt op rijdt, niet halverwege de nadering.',
      },
      late: {
        severity: 'fout',
        explanation:
          'Je keek pas naar links toen je al instuurde. Dan is het te laat om er nog iets mee ' +
          'te doen.',
      },
    },
    {
      id: 'schouderblik-rechts',
      label: '8. Schouderblik rechts (vlak vóór het insturen)',
      group: 'kijken',
      kind: { type: 'control', control: 'SHOULDER_RIGHT' },
      window: { from: 20, to: 6 },
      tolerance: 6,
      praise: 'Je controleerde de dode hoek nog één keer vlak voor de bocht.',
      missed: {
        severity: 'kritiek',
        explanation:
          'Je hebt vlak vóór het insturen de dode hoek rechts niet gecontroleerd. Wat je eerder ' +
          'zag is dan seconden oud, en in je spiegels is het fietspad vlak naast en achter je ' +
          'niet te zien. Precies daar reed de snorfiets. Dit is de klassieke dodehoek-situatie ' +
          'bij rechtsaf slaan en op het examen direct afbrekend.',
      },
      early: {
        severity: 'fout',
        explanation:
          'Deze schouderblik was te vroeg. Op dat moment was het fietspad naast je nog leeg. Kijk ' +
          'vlak vóór het insturen, want dan pas weet je wie er werkelijk naast je rijdt.',
      },
      late: {
        severity: 'kritiek',
        explanation:
          'Je schouderblik kwam pas toen je al instuurde. Dan is het te laat om nog te reageren ' +
          'op wat je ziet.',
      },
    },
    {
      id: 'sturen-rechts',
      label: '9. Insturen naar rechts',
      group: 'sturen',
      kind: { type: 'control', control: 'STEER_RIGHT' },
      window: { from: 45, to: 7.4 },
      tolerance: 8,
      onlyWhenManualSteering: true,
      praise: 'Je stuurde de bocht netjes in.',
      missed: {
        severity: 'kritiek',
        explanation:
          'Je bent rechtdoor gereden. De opdracht was rechtsaf de Kerkstraat in. Een opdracht van ' +
          'de examinator niet uitvoeren betekent dat het examenonderdeel niet is afgelegd.',
      },
    },
    {
      id: 'richting-uit',
      label: 'Richtingaanwijzer uitzetten na de bocht',
      group: 'richting',
      kind: { type: 'afterTurn', control: 'INDICATOR_OFF', withinSeconds: 3 },
      praise: 'Je zette de richtingaanwijzer direct na de bocht uit.',
      missed: {
        severity: 'fout',
        explanation:
          'Je richtingaanwijzer bleef aanstaan. Achterliggers denken dat je opnieuw afslaat; dat ' +
          'is misleidend en telt als fout.',
      },
      late: {
        severity: 'opmerking',
        explanation:
          'Je richtingaanwijzer bleef na de bocht nog even aanstaan. Zet hem direct uit zodra de ' +
          'bocht is afgerond — een motor heeft geen automatische uitschakeling.',
      },
    },
    {
      id: 'optrekken',
      label: 'Weer optrekken na de bocht',
      group: 'snelheid',
      kind: { type: 'afterTurn', control: 'THROTTLE_UP', withinSeconds: 5 },
      praise: 'Je reed vlot door na de bocht.',
      missed: {
        severity: 'opmerking',
        explanation:
          'Je trok na de bocht niet door. Onnodig langzaam blijven rijden hindert het verkeer achter je.',
      },
    },
  ],

  sequence: {
    label: 'Volgorde van kijken en aankondigen',
    ids: [
      'blik-links',
      'spiegel-links',
      'blik-rechts',
      'spiegel-rechts',
      'schouderblik-voorbereiding',
      'richting-rechts',
      'blik-links-eind',
      'schouderblik-rechts',
      'sturen-rechts',
    ],
    outcome: {
      severity: 'fout',
      explanation:
        'De reeks vóór een bocht heeft een vaste volgorde, en die volgorde is de logica: eerst ' +
        'de kant die je verlaat, dan de kant waar je heen gaat, dan de dode hoek, en pas als je ' +
        'weet dat het vrij is kondig je het aan. Wie eerst aankondigt en daarna kijkt, heeft zich ' +
        'al vastgelegd op iets wat misschien niet kan.',
    },
  },

  lookDiscipline: {
    minRepeatSeconds: 2,
    maxInBurst: 3,
    burstSeconds: 1.5,
    warnAt: 2,
    faultAt: 6,
    warning: {
      severity: 'opmerking',
      explanation:
        'Je keek vaker of sneller achter elkaar dan nodig. Elke blik hoort een vraag te ' +
        'beantwoorden; dezelfde blik twee keer binnen een paar tellen levert geen nieuwe ' +
        'informatie op.',
    },
    fault: {
      severity: 'fout',
      explanation:
        'Je keek voortdurend om je heen zonder dat het ergens over ging. Dat is geen kijken maar ' +
        'scannen: je neemt niets meer op, je houdt je aandacht niet bij de weg, en op het examen ' +
        'valt onrustig kijkgedrag onmiddellijk op.',
    },
  },

  controlPrerequisites: [
    {
      label: 'Richting aangegeven vóór de schouderblik',
      control: 'INDICATOR_RIGHT',
      // Only the schouderblik is enforced at the control itself. The rest of the reeks is judged
      // afterwards by `sequence`; blocking on all six would let one forgotten mirror cascade
      // into a run where the richtingaanwijzer can never be used at all.
      requires: ['SHOULDER_RIGHT'],
      message: 'Eerst kijken, dan pas aangeven',
      outcome: {
        severity: 'fout',
        explanation:
          'Je probeerde richting aan te geven vóórdat je over je rechterschouder had gekeken. ' +
          'De richtingaanwijzer kondigt een beslissing aan die je al gecontroleerd hebt; wie ' +
          'eerst aankondigt, legt zich vast op iets wat misschien niet kan. De knop deed daarom ' +
          'niets — je moest eerst kijken.',
      },
    },
  ],

  unwanted: [
    {
      id: 'richting-links-ongewenst',
      label: 'Richting links aangegeven',
      group: 'richting',
      control: 'INDICATOR_LEFT',
      outcome: {
        severity: 'fout',
        explanation:
          'Je gaf richting links aan terwijl de opdracht rechtsaf was. Een verkeerd signaal is ' +
          'gevaarlijker dan geen signaal.',
      },
    },
    {
      id: 'sturen-links-ongewenst',
      label: 'Naar links gestuurd',
      group: 'sturen',
      control: 'STEER_LEFT',
      outcome: {
        severity: 'opmerking',
        explanation: 'Je stuurde naar links terwijl de opdracht rechtsaf was.',
      },
    },
  ],

  verdictRule: { faultLimit: 3 },
};
