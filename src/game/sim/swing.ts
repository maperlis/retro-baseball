import type { Player } from '../data/types';
import type { DiffConfig } from './difficulty';
import { isStrike } from './pitch';
import { clamp, gauss, type Rng } from './rng';
import type { Pitch, SwingResult } from './types';

/**
 * dx, dy: where the pitch is relative to the bat's aim point (zone units, y up).
 * t: timing error divided by the batter's timing window; negative = early.
 */
export interface SwingInput {
  dx: number;
  dy: number;
  t: number;
}

/** Timing window in ms for a human swing. Better contact hitters get more slack. */
export const timingWindow = (b: Player, diff: DiffConfig) => (90 + b.bat.contact * 5) * diff.window;

export const reachOf = (b: Player, diff: DiffConfig) => (0.42 + b.bat.contact * 0.03) * diff.reach;

export function resolveSwing(inp: SwingInput, batter: Player, rnd: Rng, reachMult = 1): SwingResult {
  const reach = (0.42 + batter.bat.contact * 0.03) * reachMult;
  const d = Math.hypot(inp.dx * 0.6, inp.dy);
  const at = Math.abs(inp.t);
  if (d > reach || at > 1.5) return { kind: 'miss' };

  const q = clamp(1 - (d / reach) * 0.55 - Math.min(1, at / 1.5) * 0.45, 0, 1);
  if (at > 1.05 || rnd() < 0.22 + 0.4 * (1 - q)) return { kind: 'foul' };

  const ev = 62 + q * (38 + batter.bat.power * 2.2) + gauss(rnd) * 6;
  // Bat under the ball (pitch above aim, dy > 0) lifts it.
  const la = 13 + inp.dy * 45 + gauss(rnd) * 14 + (batter.bat.power - 5) * 1.5;
  const side = batter.bats === 'L' ? -1 : 1; // early = pull
  const spray = side * inp.t * 30 + gauss(rnd) * 13;
  if (Math.abs(spray) > 46) return { kind: 'foul' };
  return { kind: 'inPlay', ball: { ev, la, spray } };
}

/** Computer batter: decide whether to swing, and how well it's timed. */
export function cpuSwing(
  batter: Player,
  pitcher: Player,
  pitch: Pitch,
  balls: number,
  strikes: number,
  fatigueLevel: number,
  rnd: Rng,
  diff: DiffConfig,
): SwingInput | null {
  const inZone = isStrike(pitch.loc);
  const outBy = Math.max(Math.abs(pitch.loc.x) - 1, Math.abs(pitch.loc.y) - 1, 0);
  let p: number;
  if (inZone) {
    p = 0.66 + (strikes === 2 ? 0.22 : 0) - (balls === 3 && strikes < 2 ? 0.25 : 0);
  } else {
    p = 0.4 - batter.bat.eye * 0.028 + (strikes === 2 ? 0.14 : 0) - outBy * 0.35;
  }
  if (rnd() >= clamp(p, 0.03, 0.97)) return null;

  const difficulty =
    (1 + (pitcher.pit.stuff - 5) * 0.05 + (pitch.type === 'FB' ? 0 : 0.12) - fatigueLevel * 0.3) *
    diff.cpuBatNoise;
  const tsd = (0.85 - batter.bat.contact * 0.035) * difficulty;
  const ysd = (0.5 - batter.bat.contact * 0.02) * difficulty;
  return {
    t: gauss(rnd) * tsd,
    dx: gauss(rnd) * ysd * 0.8,
    dy: gauss(rnd) * ysd + Math.sign(pitch.loc.y || 1) * outBy * 0.5,
  };
}
