import type { BatRatings, PitchRatings } from './types';

/** Counting stats, so two seasons can simply be added together. */
export interface HitCounts {
  pa: number;
  ab: number;
  h: number;
  d: number;
  t: number;
  hr: number;
  bb: number;
  so: number;
  sb: number;
}

export interface PitchCounts {
  ip: number; // true innings (150.1 -> 150.333)
  er: number;
  so: number;
  bb: number;
  h: number;
  hr: number;
  gs: number;
  g: number;
}

export const EMPTY_HIT: HitCounts = { pa: 0, ab: 0, h: 0, d: 0, t: 0, hr: 0, bb: 0, so: 0, sb: 0 };
export const EMPTY_PITCH: PitchCounts = { ip: 0, er: 0, so: 0, bb: 0, h: 0, hr: 0, gs: 0, g: 0 };

export const AVERAGE = 5.5;

export function addCounts<T extends object>(a: T, b: T): T {
  const out = { ...a } as Record<string, number>;
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + (v as number);
  return out as T;
}

/** Linear map of `v` from [lo, hi] onto 1–10, clamped. lo may exceed hi. */
function scale(v: number, lo: number, hi: number): number {
  const t = (v - lo) / (hi - lo);
  return 1 + 9 * Math.min(1, Math.max(0, t));
}

/** Pull a rating toward average when the sample is small. */
function regress(raw: number, sample: number, k: number): number {
  const w = sample / (sample + k);
  return round1(AVERAGE + (raw - AVERAGE) * w);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * League-anchored ranges: roughly a replacement-level regular maps to 1–2
 * and an MVP-level season to 9–10.
 */
export function batRatings(c: HitCounts): BatRatings {
  if (c.pa <= 0 || c.ab <= 0) {
    return { contact: AVERAGE, power: AVERAGE, eye: AVERAGE, speed: AVERAGE };
  }
  const avg = c.h / c.ab;
  const kPct = c.so / c.pa;
  const bbPct = c.bb / c.pa;
  const iso = (c.d + 2 * c.t + 3 * c.hr) / c.ab;
  const sbRate = (c.sb / c.pa) * 600;
  const tripRate = (c.t / c.pa) * 600;

  const contact = 0.6 * scale(avg, 0.2, 0.32) + 0.4 * scale(kPct, 0.32, 0.1);
  const power = scale(iso, 0.08, 0.3);
  const eye = scale(bbPct, 0.04, 0.15);
  const speed = scale(sbRate + tripRate * 4, 0, 45);

  return {
    contact: regress(contact, c.pa, 120),
    power: regress(power, c.pa, 120),
    eye: regress(eye, c.pa, 120),
    speed: regress(speed, c.pa, 200),
  };
}

export function pitchRatings(c: PitchCounts): PitchRatings {
  if (c.ip <= 0) {
    return { velo: AVERAGE, stuff: AVERAGE, control: AVERAGE, stamina: 3 };
  }
  const k9 = (c.so * 9) / c.ip;
  const bb9 = (c.bb * 9) / c.ip;
  const h9 = (c.h * 9) / c.ip;
  const era = (c.er * 9) / c.ip;

  // The public feed has no radar data, so velocity leans on strikeout rate.
  const velo = scale(k9, 6, 12.5);
  const stuff = 0.5 * scale(h9, 10, 6) + 0.5 * scale(era, 5.5, 2.2);
  const control = scale(bb9, 4.5, 1.5);
  const ipPerStart = c.gs > 0 ? c.ip / c.gs : 1;
  const stamina = c.gs >= 3 ? scale(ipPerStart, 4, 6.8) : 2;

  return {
    velo: regress(velo, c.ip, 30),
    stuff: regress(stuff, c.ip, 30),
    control: regress(control, c.ip, 30),
    stamina: round1(stamina),
  };
}

/** Pitchers who never bat: weak but not zero, so a forced pitcher at-bat still works. */
export const PITCHER_BAT: BatRatings = { contact: 1.5, power: 1, eye: 1, speed: 2 };

/** "150.1" innings notation -> 150.333 */
export function parseIP(ip: string | number | undefined): number {
  if (ip == null) return 0;
  const s = String(ip);
  const [whole, frac] = s.split('.');
  return Number(whole) + (frac ? Number(frac) / 3 : 0);
}

export function batLine(c: HitCounts): string {
  if (c.ab <= 0) return 'NO STATS';
  const avg = (c.h / c.ab).toFixed(3).replace(/^0/, '');
  return `${avg} ${c.hr}HR`;
}

export function pitLine(c: PitchCounts): string {
  if (c.ip <= 0) return 'NO STATS';
  return `${((c.er * 9) / c.ip).toFixed(2)} ERA`;
}
