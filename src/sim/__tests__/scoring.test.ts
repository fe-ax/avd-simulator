import { describe, expect, test } from 'vitest';
import { rechtsafFietspad as scenario } from '../scenario.rechtsaf-fietspad';
import { driveRun } from '../testDriver';
import type { ActionResult, RunRecord } from '../types';

const find = (record: RunRecord, id: string): ActionResult => {
  const hit = record.results.find((r) => r.expectedId === id);
  if (!hit) throw new Error(`Geen resultaat voor "${id}" — wel: ${record.results.map((r) => r.expectedId).join(', ')}`);
  return hit;
};

describe('een correct gereden rit', () => {
  const record = driveRun(scenario);

  test('levert geslaagd op zonder fouten', () => {
    expect(record.verdict).toBe('geslaagd');
    expect(record.counts).toEqual({ opmerking: 0, fout: 0, kritiek: 0 });
  });

  test('slaat daadwerkelijk rechtsaf', () => {
    expect(record.branch).toBe('turn');
    expect(record.turnCompletedAt).not.toBeNull();
  });

  test('dwingt de snorfiets niet tot remmen', () => {
    expect(record.incidents).toHaveLength(0);
  });

  test('legt elke handeling vast met tijd én afstand', () => {
    const shoulder = find(record, 'schouderblik-rechts');
    expect(shoulder.status).toBe('goed');
    expect(shoulder.actualT).toBeGreaterThan(0);
    expect(shoulder.actualD).toBeGreaterThan(0);
    expect(shoulder.windowT).not.toBeNull();
  });
});

describe('perceptie volgt uit de meetkunde', () => {
  const firstSeen = (record: RunRecord): number | null =>
    record.actorTracks.snorfiets.find((s) => s.perceived)?.t ?? null;

  test('de rechterspiegel laat hem zien terwijl hij nog achter je rijdt', () => {
    const record = driveRun(scenario);
    const seen = firstSeen(record);
    expect(seen).not.toBeNull();
    // Around the moment step 4 checks the right mirror, long before the turn.
    expect(seen!).toBeLessThan(find(record, 'schouderblik-rechts').actualT!);
  });

  test('zonder spiegels vindt alleen de schouderblik hem', () => {
    const record = driveRun(scenario, { mirrors: false });
    const seen = firstSeen(record)!;
    const shoulder = find(record, 'schouderblik-rechts').actualT!;
    // Not before the decisive schouderblik, and not appreciably after it either.
    expect(seen).toBeGreaterThanOrEqual(shoulder - 0.1);
    expect(seen).toBeLessThan(shoulder + 1);
  });

  test('wie helemaal niet kijkt ziet hem pas als hij al voorbij is', () => {
    const noLooks = driveRun(scenario, {
      mirrors: false, eyes: false, shoulderPrep: false, shoulder: false,
    });
    const withShoulder = driveRun(scenario, { mirrors: false });
    expect(firstSeen(noLooks)!).toBeGreaterThan(firstSeen(withShoulder)! + 1);
  });

  test('een schouderblik naar de verkeerde kant onthult niets', () => {
    const record = driveRun(scenario, {
      mirrors: false, eyes: false, shoulderPrep: false, shoulder: false, shoulderWrongSide: true,
    });
    const wrong = driveRun(scenario, {
      mirrors: false, eyes: false, shoulderPrep: false, shoulder: false,
    });
    // Looking left tells you nothing about what is on your right.
    expect(firstSeen(record)).toBe(firstSeen(wrong));
  });
});

describe('dode hoek', () => {
  test('geen schouderblik is een kritieke fout', () => {
    const record = driveRun(scenario, { shoulder: false });
    const result = find(record, 'schouderblik-rechts');
    expect(result.status).toBe('gemist');
    expect(result.severity).toBe('kritiek');
    expect(record.verdict).toBe('gezakt');
  });

  test('geen voorrang verlenen dwingt de snorfiets te remmen', () => {
    const record = driveRun(scenario, { yieldToActor: false });
    expect(record.incidents).toHaveLength(1);
    expect(record.incidents[0].kind).toBe('emergency_brake');
    const incident = find(record, 'incident-snorfiets');
    expect(incident.severity).toBe('kritiek');
    expect(record.verdict).toBe('gezakt');
  });

  test('wie niet kijkt, ziet de snorfiets nooit', () => {
    const record = driveRun(scenario, {
      mirrors: false,
      eyes: false,
      shoulderPrep: false,
      shoulder: false,
      yieldToActor: false,
    });
    const track = record.actorTracks.snorfiets;
    // Perception is a property of the rider, not of the world: the snorfiets was there the
    // whole time, and the replay is where the student finally gets to see it.
    const everSeenBeforeIncident = track
      .filter((s) => s.t <= record.incidents[0].t)
      .some((s) => s.perceived);
    expect(everSeenBeforeIncident).toBe(false);
    expect(record.incidents[0].wasPerceived).toBe(false);
  });

  test('een schouderblik onthult de snorfiets ook als de spiegels overgeslagen zijn', () => {
    const record = driveRun(scenario, { mirrors: false, eyes: false, shoulderPrep: false });
    const track = record.actorTracks.snorfiets;
    const shoulderAt = find(record, 'schouderblik-rechts').actualT!;
    const before = track.filter((s) => s.t < shoulderAt).some((s) => s.perceived);
    const after = track.filter((s) => s.t > shoulderAt + 0.2).some((s) => s.perceived);
    expect(before).toBe(false);
    expect(after).toBe(true);
  });
});

describe('opdracht niet uitgevoerd', () => {
  const record = driveRun(scenario, { steer: false });

  test('rijdt rechtdoor in plaats van af te breken', () => {
    expect(record.branch).toBe('straight');
    expect(record.durationS).toBeGreaterThan(10);
    expect(record.samples.length).toBeGreaterThan(50);
  });

  test('telt als kritieke fout', () => {
    expect(find(record, 'sturen-rechts').severity).toBe('kritiek');
    expect(record.verdict).toBe('gezakt');
  });

  test('scoort handelingen "na de bocht" niet', () => {
    expect(record.results.some((r) => r.expectedId === 'richting-uit')).toBe(false);
  });
});

describe('richtingaanwijzer — de drie gradaties', () => {
  test('direct uitzetten is goed', () => {
    expect(find(driveRun(scenario), 'richting-uit').status).toBe('goed');
  });

  test('laat uitzetten is een opmerking', () => {
    const result = find(driveRun(scenario, { indicatorOff: 'laat' }), 'richting-uit');
    expect(result.status).toBe('te laat');
    expect(result.severity).toBe('opmerking');
  });

  test('nooit uitzetten is een fout', () => {
    const result = find(driveRun(scenario, { indicatorOff: 'nooit' }), 'richting-uit');
    expect(result.status).toBe('gemist');
    expect(result.severity).toBe('fout');
  });

  test('helemaal geen richting aangeven is een fout', () => {
    const record = driveRun(scenario, { indicator: false, indicatorOff: 'nooit' });
    expect(find(record, 'richting-rechts').severity).toBe('fout');
  });

  test('de verkeerde kant aangeven is een fout', () => {
    const record = driveRun(scenario, { indicatorWrongSide: true });
    expect(find(record, 'richting-links-ongewenst').severity).toBe('fout');
  });
});

describe('de voorgeschreven volgorde', () => {
  test('een correcte rit doorloopt de reeks op volgorde', () => {
    const record = driveRun(scenario);
    const ids = [
      'blik-links',
      'spiegel-links',
      'blik-rechts',
      'spiegel-rechts',
      'schouderblik-voorbereiding',
      'richting-rechts',
      'blik-links-eind',
      'schouderblik-rechts',
      'sturen-rechts',
    ];
    const times = ids.map((id) => find(record, id).actualT);
    expect(times.every((x) => x !== null)).toBe(true);
    for (let i = 1; i < times.length; i++) {
      expect(times[i]!).toBeGreaterThan(times[i - 1]!);
    }
    expect(record.results.some((r) => r.expectedId === 'volgorde')).toBe(false);
  });

  test('een omgedraaide reeks is een fout, ook al klopt elke stap op zich', () => {
    const record = driveRun(scenario, { swapLookOrder: true });
    const result = find(record, 'volgorde');
    expect(result.severity).toBe('fout');
    // The message has to name the two steps that were swapped, not just say "wrong order".
    expect(result.explanation).toContain('Spiegel links');
    expect(result.explanation).toContain('Blik links');
    // Each step on its own was still done inside its window.
    expect(find(record, 'blik-links').status).toBe('goed');
    expect(find(record, 'spiegel-links').status).toBe('goed');
  });
});

describe('twee stappen met dezelfde bediening', () => {
  test('de voorbereidende schouderblik telt niet als de beslissende', () => {
    const record = driveRun(scenario, { shoulder: false });
    expect(find(record, 'schouderblik-voorbereiding').status).toBe('goed');

    const decisive = find(record, 'schouderblik-rechts');
    expect(decisive.status).toBe('gemist');
    expect(decisive.severity).toBe('kritiek');
    // And it must not report the preparation look as if it were a stray attempt at this step.
    expect(decisive.actualT).toBeNull();
    expect(decisive.explanation).not.toMatch(/drukte hier wel op/);
  });
});

describe('de richtingaanwijzer kan pas ná het kijken aan', () => {
  const record = driveRun(scenario, { signalBeforeLooking: true });

  test('de knop doet niets vóór de schouderblik', () => {
    const refused = record.events.filter((e) => e.control === 'INDICATOR_RIGHT' && e.rejected);
    expect(refused.length).toBeGreaterThan(0);
    // The indicator must genuinely not have come on at that moment.
    const atRefusal = record.samples.find((s) => s.t >= refused[0].t);
    expect(atRefusal?.indicator).toBe('off');
  });

  test('de poging telt als fout en wordt benoemd', () => {
    const result = find(record, 'prerequisite-INDICATOR_RIGHT');
    expect(result.severity).toBe('fout');
    expect(result.explanation).toMatch(/schouder/i);
  });

  test('een geweigerde druk telt niet als richting aangeven', () => {
    // Otherwise the refused press would quietly satisfy the expected action it was refused for.
    const early = record.events.find((e) => e.control === 'INDICATOR_RIGHT');
    const credited = find(record, 'richting-rechts').actualT;
    expect(early!.rejected).toBe(true);
    expect(credited === null || credited > early!.t).toBe(true);
  });

  test('na de schouderblik werkt hij gewoon', () => {
    const clean = driveRun(scenario);
    expect(clean.events.some((e) => e.control === 'INDICATOR_RIGHT' && e.rejected)).toBe(false);
    expect(find(clean, 'richting-rechts').status).toBe('goed');
  });
});

describe('de laatste blik naar links', () => {
  test('hoort er ook bij als er niets van links komt', () => {
    // You look to confirm the crossing is clear, not because something is known to be there.
    const record = driveRun(scenario);
    const final = find(record, 'blik-links-eind');
    expect(final.status).toBe('goed');
    expect(final.actualT!).toBeGreaterThan(find(record, 'richting-rechts').actualT!);
    expect(final.actualT!).toBeLessThan(find(record, 'schouderblik-rechts').actualT!);
  });

  test('is een eigen stap, niet de openingsblik opnieuw geteld', () => {
    const first = find(driveRun(scenario), 'blik-links');
    const final = find(driveRun(scenario), 'blik-links-eind');
    expect(final.actualT).not.toBe(first.actualT);
    expect(final.actualD!).toBeLessThan(first.actualD!);
  });
});

describe('beide grenzen van een kijkvenster zijn echt', () => {
  test('een blik in het midden van het venster is gewoon goed', () => {
    expect(find(driveRun(scenario, { firstLookAtD: 70 }), 'blik-links').status).toBe('goed');
  });

  test('net te vroeg is een opmerking', () => {
    const result = find(driveRun(scenario, { firstLookAtD: 106 }), 'blik-links');
    expect(result.status).toBe('te vroeg');
    expect(result.severity).toBe('opmerking');
  });

  test('ver te vroeg telt helemaal niet als voorbereiding', () => {
    // The junction is not remotely in sight 124 m out, so a look there says nothing about the
    // turn — it cannot be what prepared it.
    const result = find(driveRun(scenario, { firstLookAtD: 124 }), 'blik-links');
    expect(result.status).toBe('gemist');
    expect(result.severity).toBe('fout');
  });

  test('de hele reeks afraffelen bij de start wordt afgestraft', () => {
    const record = driveRun(scenario, { rushSequenceAtStart: true });
    expect(record.verdict).toBe('gezakt');
  });
});

describe('kijkgedrag', () => {
  test('een nette reeks levert geen opmerking op', () => {
    const record = driveRun(scenario);
    expect(record.results.some((r) => r.expectedId === 'kijkgedrag')).toBe(false);
  });

  test('onafgebroken rondkijken is een fout', () => {
    const record = driveRun(scenario, { scanConstantly: true });
    const result = find(record, 'kijkgedrag');
    expect(result.severity).toBe('fout');
    expect(result.explanation).toMatch(/kijkacties/);
  });

  test('wie alleen maar scant, krijgt geen enkele kijkactie toegerekend', () => {
    // The loophole this closes: mashing every look control hits every window by accident. A
    // press that breaks the discipline rules is discarded before anything is credited, so a
    // scanner ends up having looked at nothing at all.
    const record = driveRun(scenario, {
      scanConstantly: true,
      eyes: false,
      mirrors: false,
      shoulderPrep: false,
      shoulder: false,
    });
    expect(record.events.filter((e) => e.phase === 'press').length).toBeGreaterThan(80);

    // The very first press of a control is clean by definition, so a scanner does bank the
    // opening one or two of the cycle. Everything after that is discarded, which is enough to
    // sink the run: the looks that matter are all gemist.
    for (const id of ['spiegel-rechts', 'schouderblik-voorbereiding', 'schouderblik-rechts']) {
      expect(find(record, id).status).toBe('gemist');
    }
    expect(find(record, 'kijkgedrag').severity).toBe('fout');
    expect(record.verdict).toBe('gezakt');
  });
});

describe('techniek', () => {
  test('schakelen zonder koppeling is een opmerking, geen blokkade', () => {
    const record = driveRun(scenario, { clutchless: true });
    const result = find(record, 'koppeling-techniek');
    expect(result.severity).toBe('opmerking');
    // Non-blocking: the shift still happened.
    expect(record.samples.some((s) => s.gear <= 2)).toBe(true);
  });

  test('niet terugschakelen is een opmerking', () => {
    expect(find(driveRun(scenario, { gear: false }), 'terugschakelen').severity).toBe('opmerking');
  });

  test('te hard het kruispunt op is een fout', () => {
    const record = driveRun(scenario, { slowDown: false, yieldToActor: false });
    expect(find(record, 'snelheid-minderen').severity).toBe('fout');
  });
});

describe('vensters volgen de positie, niet de klok', () => {
  test('een voorzichtige rijder haalt dezelfde vensters', () => {
    const normal = driveRun(scenario);
    const cautious = driveRun(scenario, { startSlowPresses: 2 });

    expect(cautious.durationS).toBeGreaterThan(normal.durationS + 1);
    expect(cautious.counts.fout).toBe(0);
    expect(cautious.counts.kritiek).toBe(0);

    // Same verdict, but every window sits later on the clock — which is the whole point of
    // anchoring them to metres-before-the-fietspad.
    const a = find(normal, 'schouderblik-rechts');
    const b = find(cautious, 'schouderblik-rechts');
    expect(b.status).toBe('goed');
    expect(b.windowT![0]).toBeGreaterThan(a.windowT![0]);
  });
});

describe('auto-sturen', () => {
  test('neemt de bocht zelf en beoordeelt het insturen niet', () => {
    const record = driveRun(scenario, { autoSteer: true, steer: false });
    expect(record.branch).toBe('turn');
    expect(record.autoSteer).toBe(true);
    expect(record.results.some((r) => r.expectedId === 'sturen-rechts')).toBe(false);
    expect(record.verdict).toBe('geslaagd');
  });

  test('laat de stuurbediening niets vastleggen', () => {
    // An inactive button that still filled the log would put phantom rows in the debrief.
    const record = driveRun(scenario, { autoSteer: true });
    const steerEvents = record.events.filter(
      (e) => e.control === 'STEER_LEFT' || e.control === 'STEER_RIGHT',
    );
    expect(steerEvents).toHaveLength(0);
  });

  test('uitgeschakeld blijft rechtdoor rijden mogelijk', () => {
    const record = driveRun(scenario, { autoSteer: false, steer: false });
    expect(record.branch).toBe('straight');
    expect(find(record, 'sturen-rechts').severity).toBe('kritiek');
  });
});

describe('volgorde van de tijdlijn', () => {
  test('de rijen volgen de voorgeschreven reeks, niet de klok', () => {
    // Sorting by when things happened reshuffles the numbered steps exactly on the runs where
    // the order went wrong — which is when reading down the list matters most.
    const record = driveRun(scenario, { swapLookOrder: true });
    const ids = record.results.map((r) => r.expectedId);
    const scenarioOrder = scenario.expected
      .filter((e) => !(e.onlyWhenManualSteering && record.autoSteer))
      .map((e) => e.id)
      .filter((id) => ids.includes(id));
    expect(ids.slice(0, scenarioOrder.length)).toEqual(scenarioOrder);
  });
});

describe('oefentempo', () => {
  test('verandert de beoordeling niet, alleen de reactietijd van de rijder', () => {
    const full = driveRun(scenario);
    const slow = driveRun(scenario, { timeScale: 0.25 });

    // Simulated time is the clock everything is scored against, so a slowed run must produce a
    // bit-for-bit identical record apart from the tempo it was flown at.
    expect(slow.timeScale).toBe(0.25);
    expect(full.timeScale).toBe(1);
    expect(slow.durationS).toBeCloseTo(full.durationS, 6);
    expect(slow.results.map((r) => [r.expectedId, r.status, r.severity])).toEqual(
      full.results.map((r) => [r.expectedId, r.status, r.severity]),
    );
    expect(slow.verdict).toBe(full.verdict);
  });
});

describe('de rit breekt nooit af', () => {
  test('ook een rit vol fouten wordt volledig uitgereden', () => {
    const record = driveRun(scenario, {
      mirrors: false,
      indicator: false,
      eyes: false,
      shoulderPrep: false,
      shoulder: false,
      gear: false,
      slowDown: false,
      yieldToActor: false,
      indicatorOff: 'nooit',
    });
    expect(record.counts.kritiek).toBeGreaterThan(0);
    expect(record.branch).toBe('turn');
    expect(record.samples.at(-1)!.t).toBeCloseTo(record.durationS, 1);
  });
});
