import { describe, expect, test } from 'vitest';
import { LOOK_DIRECTIONS, LOOK_REGIONS, lookRegionFor, mirrorInFocus } from '../perception';
import type { LookControl } from '../types';

const at = (yawDeg: number, pitchDeg = 0) => ({
  yaw: (yawDeg * Math.PI) / 180,
  pitch: (pitchDeg * Math.PI) / 180,
});

describe('een blik is een richting, geen punt', () => {
  test('recht vooruit is geen enkele controle', () => {
    expect(lookRegionFor(at(0))).toBeNull();
    expect(lookRegionFor(at(14, 3))).toBeNull();
    expect(lookRegionFor(at(-14, -3))).toBeNull();
  });

  test('overal over je schouder telt als schouderblik', () => {
    // The point of the region: no aiming. Anywhere past the threshold is the same check.
    // Sampled just inside the boundary rather than exactly on it — degrees make a round trip
    // through radians on the way in, and 60 comes back as 59.999…
    for (const yaw of [-62, -75, -102, -125, -140]) {
      expect(lookRegionFor(at(yaw))).toBe('SHOULDER_RIGHT');
      expect(lookRegionFor(at(-yaw))).toBe('SHOULDER_LEFT');
    }
    // And at any pitch, because turning round is turning round.
    expect(lookRegionFor(at(-102, 30))).toBe('SHOULDER_RIGHT');
    expect(lookRegionFor(at(-102, -30))).toBe('SHOULDER_RIGHT');
  });

  test('de drempel ligt buiten wat vooruitkijken al bestrijkt', () => {
    // Forward vision reaches 31 degrees; a schouderblik has to be past where that ever looked.
    expect(LOOK_REGIONS.shoulderDeg).toBeGreaterThan(31);
  });

  test('opzij en omlaag is de spiegel, opzij en vlak is een blik', () => {
    expect(lookRegionFor(at(-26, -12))).toBe('MIRROR_RIGHT');
    expect(lookRegionFor(at(-26, 0))).toBe('EYE_RIGHT');
    expect(lookRegionFor(at(30, -20))).toBe('MIRROR_LEFT');
    expect(lookRegionFor(at(30, 5))).toBe('EYE_LEFT');
  });

  test('elke richting hoort bij hooguit één controle', () => {
    // The regions partition the head's travel; nothing can be two checks at once, and the whole
    // reachable range is accounted for.
    const seen = new Set<LookControl>();
    for (let yaw = -140; yaw <= 140; yaw += 1) {
      for (let pitch = -45; pitch <= 45; pitch += 1) {
        const region = lookRegionFor(at(yaw, pitch));
        if (region) seen.add(region);
      }
    }
    expect([...seen].sort()).toEqual([
      'EYE_LEFT',
      'EYE_RIGHT',
      'MIRROR_LEFT',
      'MIRROR_RIGHT',
      'SHOULDER_LEFT',
      'SHOULDER_RIGHT',
    ]);
  });

  test('de aim waar de simulator zelf mee rijdt valt in de juiste regio', () => {
    for (const [control, pose] of Object.entries(LOOK_DIRECTIONS)) {
      expect(lookRegionFor(at(pose.yaw, pose.pitch))).toBe(control);
    }
  });

  test('een spiegel is alleen leesbaar als je die kant op omlaag kijkt', () => {
    expect(mirrorInFocus(at(-26, -12), 'right')).toBe(true);
    expect(mirrorInFocus(at(-26, -12), 'left')).toBe(false);
    expect(mirrorInFocus(at(0, 0), 'right')).toBe(false);
    expect(mirrorInFocus(at(-102, -12), 'right')).toBe(false);
  });
});
