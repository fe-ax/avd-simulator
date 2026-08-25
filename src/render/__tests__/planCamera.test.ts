/**
 * The plan camera exists to be invertible, so that is what these check. A drag that lands one
 * metre away from where the cursor is looks like a bug in the editor and is a bug in here.
 */
import { describe, expect, test } from 'vitest';
import { PlanCamera } from '../planCamera';

function cam(scale = 6, yaw = Math.PI / 2) {
  const c = new PlanCamera();
  c.resize(800, 600);
  c.scale = scale;
  c.yaw = yaw;
  c.x = 12;
  c.y = -40;
  return c;
}

describe('de plattegrondcamera', () => {
  test('unproject draait project precies terug, overal in beeld', () => {
    for (const scale of [1.5, 6, 18, 39]) {
      const c = cam(scale);
      for (const px of [0, 137, 400, 799]) {
        for (const py of [0, 91, 300, 599]) {
          const world = c.unproject(px, py);
          const back = c.project(world.x, world.y);
          expect(back.x).toBeCloseTo(px, 6);
          expect(back.y).toBeCloseTo(py, 6);
        }
      }
    }
  });

  test('en andersom, ook als de camera gedraaid staat', () => {
    for (const yaw of [0, Math.PI / 2, 2.3, -1.1]) {
      const c = cam(9, yaw);
      for (const p of [
        { x: 0, y: 0 },
        { x: 5.5, y: -127.5 },
        { x: -30, y: 44 },
      ]) {
        const s = c.project(p.x, p.y);
        const back = c.unproject(s.x, s.y);
        expect(back.x).toBeCloseTo(p.x, 6);
        expect(back.y).toBeCloseTo(p.y, 6);
      }
    }
  });

  test('heeft geen diepte: q is overal 1 en niets wordt platgedrukt', () => {
    const c = cam();
    expect(c.project(0, 0).q).toBe(1);
    expect(c.project(0, 900).q).toBe(1);
    expect(c.depthRatioAt()).toBe(1);
  });

  test('zoomt om de cursor, zodat wat je aanwijst blijft waar het is', () => {
    const c = cam();
    const under = c.unproject(210, 480);
    c.zoomAt(210, 480, 2.5);
    const still = c.unproject(210, 480);
    expect(still.x).toBeCloseTo(under.x, 6);
    expect(still.y).toBeCloseTo(under.y, 6);
    expect(c.scale).toBeCloseTo(15, 6);
  });

  test('slepen verplaatst de wereld precies zoveel als de muis', () => {
    const c = cam();
    const before = c.unproject(400, 300);
    c.panBy(60, -24);
    const after = c.unproject(460, 276);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  test('fit brengt een hele route in beeld', () => {
    const c = cam();
    c.fit({ minX: -10, maxX: 60, minY: -130, maxY: 20 });
    const b = c.worldBounds();
    expect(b.minX).toBeLessThanOrEqual(-10);
    expect(b.maxX).toBeGreaterThanOrEqual(60);
    expect(b.minY).toBeLessThanOrEqual(-130);
    expect(b.maxY).toBeGreaterThanOrEqual(20);
  });
});
