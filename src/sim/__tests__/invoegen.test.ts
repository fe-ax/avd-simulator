/**
 * Scenario 2, ridden headless. These are the assertions that say the exercise still teaches what
 * it is supposed to teach — not that the code runs.
 */
import { describe, expect, test } from 'vitest';
import { driveMerge } from '../testDriver';
import { invoegenSnelweg } from '../scenario.invoegen-snelweg';
import type { Scenario } from '../types';

const CLEAN = { throttlePresses: 5, throttleFromD: 148, throttleEveryM: 6, mergeAtD: 60 };
const headway = (r: ReturnType<typeof driveMerge>, id: string) =>
  r.results.find((x) => x.expectedId === id);

describe('een nette invoeging', () => {
  test('haalt het examen zonder aanmerkingen', () => {
    const r = driveMerge(invoegenSnelweg, CLEAN);
    expect(r.verdict).toBe('geslaagd');
    expect(r.counts).toEqual({ kritiek: 0, fout: 0, opmerking: 0 });
  });

  test('voegt in het gat: achter de auto en vóór de vrachtwagen', () => {
    const r = driveMerge(invoegenSnelweg, CLEAN);
    // Both sides of the gap are judged, which is what invoegen actually is.
    expect(headway(r, 'volgafstand-auto')?.status).toBe('goed');
    expect(headway(r, 'volgafstand')?.status).toBe('goed');
    expect(r.incidents).toHaveLength(0);
  });

  test('komt op snelheid vóórdat de strook ophoudt', () => {
    const r = driveMerge(invoegenSnelweg, CLEAN);
    expect(r.results.find((x) => x.expectedId === 'snelheid-op')?.status).toBe('goed');
    const top = r.samples.reduce((m, s) => Math.max(m, s.speed * 3.6), 0);
    expect(top).toBeGreaterThanOrEqual(95);
  });
});

describe('wat er misgaat', () => {
  test('op 50 blijven rijden laat de vrachtwagen remmen, en dat is kritiek', () => {
    const r = driveMerge(invoegenSnelweg, { ...CLEAN, throttlePresses: 0 });
    expect(r.incidents.length).toBeGreaterThan(0);
    expect(r.counts.kritiek).toBeGreaterThan(0);
    expect(r.verdict).toBe('gezakt');
  });

  test('te weinig gas is een fout, ook als het gat toevallig goed uitpakt', () => {
    const r = driveMerge(invoegenSnelweg, { ...CLEAN, throttlePresses: 3, throttleFromD: 120 });
    expect(r.results.find((x) => x.expectedId === 'snelheid-op')?.status).toBe('gemist');
    expect(r.counts.fout).toBeGreaterThan(0);
  });

  test('sturen zonder schouderblik wordt geweigerd, niet uitgevoerd', () => {
    const r = driveMerge(invoegenSnelweg, { ...CLEAN, shoulder: false });
    const steer = r.events.find((e) => e.control === 'STEER_LEFT');
    expect(steer?.rejected).toBe(true);
    // Refused means refused: the machine stays on the strook and rides it out.
    expect(r.manoeuvreCompletedAt).toBeNull();
    expect(r.results.find((x) => x.expectedId === 'invoegen')?.status).toBe('gemist');
  });

  test('een manoeuvre die nooit afkomt laat geen stille gaten achter', () => {
    const r = driveMerge(invoegenSnelweg, { ...CLEAN, shoulder: false });

    // `afterTurn` expectations hang off the manoeuvre, so with no manoeuvre there is nothing to
    // hang off and the row is dropped. That is right — "richtingaanwijzer uit ná het invoegen"
    // is not a fair thing to mark when there was no invoegen — but it is dropped SILENTLY, so
    // this pins that the student is still told plainly what did go wrong.
    expect(r.manoeuvreCompletedAt).toBeNull();
    expect(r.results.some((x) => x.expectedId === 'richting-uit')).toBe(false);
    expect(r.faults.some((x) => x.expectedId === 'invoegen')).toBe(true);
    expect(r.verdict).toBe('gezakt');

    // And no following distance either, which is the claim that let the temporal gate go. Headway
    // used to be measured only from `manoeuvreCompletedAt`; it is measured from the first frame
    // now, and a rider still on the oprit is more than half a lane off the carriageway, so
    // `headwaySeconds` refuses every sample on the lateral test alone. Two gates said one thing.
    expect(r.results.some((x) => x.expectedId === 'volgafstand-auto')).toBe(false);
    expect(r.results.some((x) => x.expectedId === 'volgafstand')).toBe(false);
  });

  test('de reeks in de verkeerde volgorde wordt apart aangerekend', () => {
    const r = driveMerge(invoegenSnelweg, { ...CLEAN, signalBeforeLooking: true });
    expect(r.faults.some((f) => f.expectedId === 'volgorde')).toBe(true);
  });
});

describe('de volgafstandsregel is een toestand, geen momentopname', () => {
  const heldSeconds = (r: ReturnType<typeof driveMerge>, id: string) =>
    Number(headway(r, id)?.explanation?.match(/was ([\d,]+) seconde/)?.[1].replace(',', '.'));

  test('ruim invoegen en dan aankruipen wordt niet beoordeeld op het moment van invoegen', () => {
    const clean = driveMerge(invoegenSnelweg, CLEAN);
    const chaser = driveMerge(invoegenSnelweg, { ...CLEAN, chaseAfterMerge: true });

    // Identical up to the moment the lane change finished: same room, same instant.
    expect(clean.manoeuvreCompletedAt).toBeCloseTo(chaser.manoeuvreCompletedAt ?? -1, 1);
    // Reading the gap at that instant would have scored these two the same. Because the rule is
    // the distance actually held, closing up afterwards shows.
    expect(heldSeconds(chaser, 'volgafstand-auto')).toBeLessThan(
      heldSeconds(clean, 'volgafstand-auto') - 0.5,
    );
  });

  test('en onder de twee seconden zitten is een fout, hoe je er ook komt', () => {
    // The band, tested directly rather than by hoping a particular way of riding lands in it:
    // put the car where there is not two seconds of room and ride the merge perfectly anyway.
    const tight: Scenario = {
      ...invoegenSnelweg,
      actors: invoegenSnelweg.actors.map((a) =>
        a.id === 'auto' ? { ...a, from: { ...a.from, y: a.from.y - 105 } } : a,
      ),
    };
    const r = driveMerge(tight, CLEAN);
    expect(heldSeconds(r, 'volgafstand-auto')).toBeLessThan(2);
    expect(headway(r, 'volgafstand-auto')?.status).not.toBe('goed');
    expect(r.counts.fout).toBeGreaterThan(0);
  });
});
