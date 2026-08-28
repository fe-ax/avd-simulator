/**
 * Only buildings have front doors.
 *
 * `frontage` used to decide what was a building by asking whether the surface had a `facing`, which
 * was true of exactly one kind for as long as houses were the only thing that fronted anywhere. The
 * day signs gained a facing — so a B6 could look at the traffic it is for — every sign post in the
 * Kerkstraat sprouted a door and three windows, standing in the verge at post height.
 *
 * Worth a test rather than a fix alone, because the next thing to gain a facing will be somebody
 * else's, months from now, and the failure is visible only from the saddle.
 */
import { describe, expect, it } from 'vitest';
import { frontage } from '../buildWorld';
import { sign } from '../../sim/surfaces/signs';
import type { Surface } from '../../sim/roadSurfaces';

const house: Surface = {
  kind: 'house',
  points: [
    { x: 0, y: 0 },
    { x: 8, y: 0 },
    { x: 8, y: 6 },
    { x: 0, y: 6 },
  ],
  height: 5.2,
  facing: 'south',
};

describe('gevels horen bij huizen', () => {
  it('geeft een huis een deur en ramen', () => {
    expect(frontage(house).length).toBeGreaterThan(0);
  });

  it('maar hangt niets aan een bordpaal, die ook een voorkant heeft', () => {
    const posts = sign({ x: 9, y: -30 }, { type: 'speedLimit', kmh: 30 }, 'south');
    expect(posts[0].facing).toBe('south');
    expect(frontage(posts[0])).toEqual([]);
  });

  it('en niets aan iets zonder voorkant', () => {
    expect(frontage({ ...house, kind: 'hedge', facing: undefined })).toEqual([]);
  });
});
