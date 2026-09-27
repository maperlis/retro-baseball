import type { Gfx } from './gfx';
import { C } from './palette';

export interface Kit {
  jersey: string; // body
  trim: string; // helmet/cap, belt, sleeves
  pants: string;
}

/** Home teams wear white, visitors road gray, NES style. */
export const kitFor = (primary: string, home: boolean): Kit => ({
  jersey: home ? C.white : C.light,
  trim: primary,
  pants: home ? C.white : C.light,
});

/** Draws in "units" so one figure definition can be scaled and mirrored. */
function painter(g: Gfx, ox: number, oy: number, u: number, width: number, mirror: boolean) {
  const mx = (x: number, w: number) => (mirror ? width - x - w : x);
  return {
    r(x: number, y: number, w: number, h: number, color: string) {
      g.rect(ox + mx(x, w) * u, oy + y * u, w * u, h * u, color);
    },
    pt(x: number, y: number): [number, number] {
      return [ox + (mirror ? width - x : x) * u, oy + y * u];
    },
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Batter seen from behind the plate, 14×24 units. `swing` < 0 is the stance;
 * 0→1 animates the swing (contact ≈ 0.35). Right-handers face right.
 */
export function drawBatter(g: Gfx, x: number, y: number, bats: 'L' | 'R', kit: Kit, swing: number, u = 2) {
  const W = 14;
  const p = painter(g, x, y, u, W, bats === 'L');
  const s = Math.max(0, Math.min(1, swing));
  const stride = swing < 0 ? 0 : Math.min(1, s * 3);

  // legs & shoes (front leg strides toward the plate)
  p.r(3, 15, 3, 7, kit.pants);
  p.r(7 + stride, 15, 3, 7, kit.pants);
  p.r(2, 22, 4, 2, C.black);
  p.r(7 + stride, 22, 4, 2, C.black);
  // body
  p.r(4, 7, 6, 7, kit.jersey);
  p.r(4, 7, 6, 1, kit.trim);
  p.r(4, 14, 6, 1, kit.trim);
  // head & helmet
  p.r(6, 6, 2, 1, C.skin);
  p.r(5, 3, 4, 3, C.skin);
  p.r(8, 4, 1, 1, C.black);
  p.r(4, 1, 6, 2, kit.trim);
  p.r(5, 0, 5, 1, kit.trim);
  p.r(10, 2, 2, 1, kit.trim);
  p.r(4, 3, 1, 2, kit.trim); // ear flap

  // hands travel stance → contact → finish
  const hx = swing < 0 ? 4 : s < 0.35 ? lerp(4, 10, s / 0.35) : lerp(10, 5, (s - 0.35) / 0.65);
  const hy = swing < 0 ? 6 : s < 0.35 ? lerp(6, 10, s / 0.35) : lerp(10, 6, (s - 0.35) / 0.65);
  const [sx, sy] = p.pt(7, 8);
  const [hpx, hpy] = p.pt(hx, hy);
  g.line(sx, sy, hpx, hpy, kit.jersey, u * 2);

  // bat: angle in degrees, 0 = toward the plate, -90 = straight up
  let ang = swing < 0 ? -115 : -115 + s * 310;
  if (bats === 'L') ang = 180 - ang;
  const rad = (ang * Math.PI) / 180;
  const len = 12 * u;
  g.line(hpx, hpy, hpx + Math.cos(rad) * len, hpy + Math.sin(rad) * len, C.wood, u);
  g.rect(hpx - u, hpy - u, u * 2, u * 2, C.skin);
}

export type PitcherPose = 'set' | 'kick' | 'release';

/** Pitcher on the mound facing the camera, 10×20 px at u=1. */
export function drawPitcher(g: Gfx, cx: number, y: number, throws: 'L' | 'R', kit: Kit, pose: PitcherPose, u = 1) {
  const W = 10;
  const x = cx - (W * u) / 2;
  const p = painter(g, x, y, u, W, throws === 'L');
  // legs
  if (pose === 'kick') {
    p.r(5, 13, 2, 6, kit.pants);
    p.r(1, 11, 4, 2, kit.pants);
    p.r(5, 19, 3, 1, C.black);
  } else {
    p.r(2, 13, 2, 6, kit.pants);
    p.r(6, 13, 2, 6, kit.pants);
    p.r(1, 19, 3, 1, C.black);
    p.r(6, 19, 3, 1, C.black);
  }
  p.r(2, 6, 6, 7, kit.jersey);
  p.r(2, 12, 6, 1, kit.trim);
  p.r(3, 3, 4, 3, C.skin);
  p.r(3, 1, 4, 2, kit.trim);
  p.r(2, 2, 6, 1, kit.trim);
  // arms: glove side (left of screen for a righty), throwing side (right)
  if (pose === 'set') {
    p.r(3, 7, 4, 2, C.dirtDark); // glove at chest
  } else if (pose === 'kick') {
    p.r(0, 6, 2, 3, C.dirtDark);
    p.r(8, 0, 2, 6, kit.jersey);
    p.r(8, -1, 2, 1, C.skin);
  } else {
    p.r(0, 8, 2, 3, C.dirtDark);
    p.r(6, 8, 4, 2, kit.jersey);
    p.r(2, 10, 2, 2, C.skin);
  }
}

/** Catcher (back view, crouched) and the umpire behind, near the camera. */
export function drawCatcher(g: Gfx, cx: number, y: number, kit: Kit, mitt: [number, number] | null, u = 2) {
  // umpire peeking over the catcher
  g.rect(cx - 7 * u, y - 3 * u, 14 * u, 10 * u, C.dark);
  g.rect(cx - 3 * u, y - 7 * u, 6 * u, 4 * u, C.black);
  g.rect(cx - 2 * u, y - 6 * u, 4 * u, 2 * u, C.gray);
  // catcher
  const x = cx - 8 * u;
  const r = (a: number, b: number, w: number, h: number, c: string) => g.rect(x + a * u, y + b * u, w * u, h * u, c);
  r(1, 11, 5, 4, kit.pants);
  r(10, 11, 5, 4, kit.pants);
  r(0, 15, 6, 2, C.black);
  r(10, 15, 6, 2, C.black);
  r(2, 4, 12, 8, kit.jersey);
  r(2, 4, 12, 1, kit.trim);
  r(5, 0, 6, 4, C.dark);
  if (mitt) {
    const [mx, my] = mitt;
    g.line(x + 12 * u, y + 5 * u, mx, my, C.dark, u);
    g.ellipse(mx, my, 4, 4, C.dirtDark);
    g.ellipse(mx, my, 2, 2, C.dirt);
  }
}

export function drawBall(g: Gfx, x: number, y: number, r: number) {
  if (r <= 1.2) {
    g.rect(x - 1, y - 1, 2, 2, C.white);
    return;
  }
  g.circle(x, y, r, C.white);
  if (r >= 3) {
    g.rect(x - 1, y - r + 1, 1, 1, C.red);
    g.rect(x, y + r - 2, 1, 1, C.red);
  }
}

/** Tiny top-down player for the field view. */
export function drawDot(g: Gfx, x: number, y: number, body: string, cap: string) {
  g.rect(x - 2, y - 2, 5, 5, C.black);
  g.rect(x - 1, y - 1, 3, 3, body);
  g.rect(x - 1, y - 1, 3, 1, cap);
}
