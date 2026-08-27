/**
 * The scenario the builder built, ridden headlessly.
 *
 * This is the round-trip proof for the shakedown: the scenario in `scenario.auto-van-rechts.ts`
 * was assembled in the browser and exported, and these tests ride the registered article rather
 * than a copy — so if the export ever stops matching what the builder showed, this goes red.
 *
 * The second test is the one that matters. A rule that a careless rider also passes teaches
 * nothing, and the model rider going green only proves the exercise is *possible*, not that it is
 * *about* anything. Riding it twice — once reading the car, once ignoring it — is what proves the
 * braking rule has teeth.
 */
import { describe, expect, it } from 'vitest';
import { referenceRide, unscoredActors } from '../referenceRide';
import { autoVanRechts } from '../scenario.auto-van-rechts';
import { scenarioById } from '../scenarios';
import { scoreRun } from '../scoring';
import { findOffRoad, riddenPath } from '../validate';

/** Wide enough to hold the whole junction, the approach and the run-out. */
const EXTENT = { minX: -120, maxX: 200, minY: -160, maxY: 120 };

const statuses = (record: Parameters<typeof scoreRun>[0]) =>
  scoreRun(record, autoVanRechts).results.map((r) => r.status);

describe('auto van rechts', () => {
  it('is registered under the id its runs will store', () => {
    expect(scenarioById('auto-van-rechts-v1')).toBe(autoVanRechts);
  });

  it('a rider who reads the car passes the whole reeks', () => {
    const { record, error } = referenceRide(autoVanRechts);
    expect(error).toBeNull();
    expect(statuses(record!)).toEqual(['goed', 'goed']);
    expect(scoreRun(record!, autoVanRechts).counts).toEqual({ opmerking: 0, fout: 0, kritiek: 0 });
  });

  it('a rider who ignores it fails the braking rule, and only that one', () => {
    const { record } = referenceRide(autoVanRechts, { anticipate: false });
    expect(statuses(record!)).toEqual(['gemist', 'goed']);
  });

  it('the car is what the exercise is about, not decor', () => {
    const { record } = referenceRide(autoVanRechts);
    expect(unscoredActors(autoVanRechts, record!)).toEqual([]);
  });

  it('the model rider never leaves the road', () => {
    const { record } = referenceRide(autoVanRechts);
    expect(findOffRoad(autoVanRechts.world, riddenPath(record!.samples), EXTENT)).toEqual([]);
  });
});
