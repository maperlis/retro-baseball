import type { Player } from '../data/types';
import type { DiffConfig } from './difficulty';
import { clamp, gauss, type Rng } from './rng';
import type { Loc, Pitch, PitchType } from './types';

export const PITCH_TYPES: PitchType[] = ['FB', 'CB', 'CH'];

export const PITCH_INFO: Record<PitchType, { name: string; dv: number; brk: Loc }> = {
  FB: { name: 'FASTBALL', dv: 0, brk: { x: 0.12, y: 0.15 } },
  CB: { name: 'CURVE', dv: -13, brk: { x: 0.35, y: -0.9 } },
  CH: { name: 'CHANGEUP', dv: -9, brk: { x: -0.3, y: -0.4 } },
};

/** Pitches before a pitcher starts to tire. Stamina 10 ≈ 115, a reliever ≈ 50. */
export const pitchLimit = (p: Player) => 35 + p.pit.stamina * 8;

export function fatigue(p: Player, pitches: number): number {
  return clamp((pitches - pitchLimit(p)) / 30, 0, 1);
}

export const isStrike = (l: Loc) => Math.abs(l.x) <= 1 && Math.abs(l.y) <= 1;

export function makePitch(
  pitcher: Player,
  pitches: number,
  type: PitchType,
  target: Loc,
  rnd: Rng,
  diff: DiffConfig,
  scatter = 1,
): Pitch {
  const f = fatigue(pitcher, pitches);
  const { dv, brk } = PITCH_INFO[type];
  const speed = Math.round(88 + pitcher.pit.velo * 0.9 + dv - f * 3 + gauss(rnd) * 0.7);
  const sd = (0.1 + (10 - pitcher.pit.control) * 0.03) * (1 + f) * scatter;
  const loc = { x: target.x + gauss(rnd) * sd, y: target.y + gauss(rnd) * sd };
  const k = 0.6 + pitcher.pit.stuff * 0.08;
  const hand = pitcher.throws === 'L' ? -1 : 1;
  // Real ~0.43s at 95mph, stretched by difficulty so it's playable on a screen.
  const travelMs = (60.5 / (speed * 1.4667)) * 1000 * diff.slow;
  return { type, speed, target, loc, brk: { x: brk.x * k * hand, y: brk.y * k }, travelMs };
}

/** Computer pitcher: pitch type and target, shaped by the count. */
export function choosePitch(
  balls: number,
  strikes: number,
  rnd: Rng,
  diff: DiffConfig,
): { type: PitchType; target: Loc } {
  const r = rnd();
  const type: PitchType = r < 0.55 ? 'FB' : r < 0.8 ? 'CB' : 'CH';
  let zone = 0.5 + (balls - strikes) * 0.06 + diff.cpuZone;
  if (balls === 3) zone += 0.25;
  if (strikes === 2 && balls < 2) zone -= 0.15;
  const u = (lo: number, hi: number) => lo + rnd() * (hi - lo);
  if (rnd() < zone) return { type, target: { x: u(-0.85, 0.85), y: u(-0.85, 0.85) } };
  const out = u(1.15, 1.6) * (rnd() < 0.5 ? -1 : 1);
  const other = u(-1, 1);
  return { type, target: rnd() < 0.5 ? { x: out, y: other } : { x: other, y: out } };
}
