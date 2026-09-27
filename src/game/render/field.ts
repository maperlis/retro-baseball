import type { Gfx } from './gfx';
import { C } from './palette';
import { fenceAt } from '../sim/outcome';

/** Top-down field geometry: home plate near the bottom, 0.42 px per foot. */
export const HOME: [number, number] = [128, 204];
export const PX_PER_FT = 0.42;

export function fieldPt(ft: number, spray: number): [number, number] {
  const r = (spray * Math.PI) / 180;
  return [HOME[0] + Math.sin(r) * ft * PX_PER_FT, HOME[1] - Math.cos(r) * ft * PX_PER_FT];
}

/** Base n (0 or 4 = home, 1 = first…) in field-view pixels. */
export function basePt(n: number): [number, number] {
  switch (n) {
    case 1: return fieldPt(90, 45);
    case 2: return fieldPt(127, 0);
    case 3: return fieldPt(90, -45);
    default: return HOME;
  }
}

/** Where each fielder stands before the pitch: [feet from home, spray]. */
export const FIELDER_SPOT: Record<string, [number, number]> = {
  P: [60, 0], C: [0, 0], '1B': [105, 34], '2B': [150, 13], SS: [150, -13],
  '3B': [105, -34], LF: [285, -28], CF: [315, 0], RF: [285, 28],
};

export function drawField(g: Gfx) {
  g.clear(C.crowd);
  // crowd speckle
  for (let y = 0; y < 60; y += 4) {
    for (let x = (y / 4) % 2 ? 2 : 0; x < 256; x += 5) {
      const k = (x * 7 + y * 13) % 5;
      g.rect(x, y, 2, 2, [C.red, C.white, C.blue, C.yellow, C.skin][k]);
    }
  }
  // outfield fan out to the fence
  const fence: [number, number][] = [];
  for (let s = -45; s <= 45; s += 3) fence.push(fieldPt(fenceAt(s), s));
  g.poly([HOME, ...fence.map(([x, y]) => [x, y - 5] as [number, number])], C.wall);
  g.poly([HOME, ...fence], C.grass);
  // mowing stripes, each wedge stopping at the fence
  for (let a = -45; a < 45; a += 7.5) {
    if (Math.round((a + 45) / 7.5) % 2) continue;
    const arc: [number, number][] = [];
    for (let k = a; k <= a + 3.75 + 1e-9; k += 1.25) arc.push(fieldPt(fenceAt(k) - 1, k));
    g.poly([HOME, ...arc], C.grass2);
  }
  // warning track just inside the fence
  for (let s = -45; s <= 45; s += 1) {
    const [x, y] = fieldPt(fenceAt(s) - 8, s);
    g.rect(x - 1, y - 1, 3, 3, C.dirtDark);
  }
  // infield dirt and grass
  const dirt: [number, number][] = [];
  for (let s = -45; s <= 45; s += 5) dirt.push(fieldPt(155, s));
  g.poly([HOME, ...dirt], C.dirt);
  g.poly([basePt(0), fieldPt(78, 45), fieldPt(112, 0), fieldPt(78, -45)], C.grass);
  g.ellipse(...fieldPt(60, 0), 5, 4, C.dirt);
  g.ellipse(HOME[0], HOME[1], 7, 5, C.dirt);
  // foul lines
  g.line(HOME[0], HOME[1], ...fieldPt(fenceAt(-45), -45), C.white);
  g.line(HOME[0], HOME[1], ...fieldPt(fenceAt(45), 45), C.white);
  for (const n of [1, 2, 3]) {
    const [x, y] = basePt(n);
    g.rect(x - 2, y - 2, 4, 4, C.white);
  }
  g.rect(HOME[0] - 2, HOME[1] - 1, 4, 3, C.white);
}
