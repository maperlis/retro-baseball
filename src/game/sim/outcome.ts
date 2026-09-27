import type { Player } from '../data/types';
import { clamp, type Rng } from './rng';
import type { BattedBall, Bases, Flight, HitType, Move, Play } from './types';

const rad = (d: number) => (d * Math.PI) / 180;

/** Fence distance by spray angle: 330 down the lines, ~405 to center. */
export const fenceAt = (spray: number) => 330 + 75 * Math.cos(rad(clamp(spray, -45, 45) * 2));

export function carry(ball: BattedBall): number {
  const base = Math.max(0, ball.ev - 25) * 5.3;
  const shape = Math.max(0.15, 1 - ((ball.la - 28) / 42) ** 2);
  const lineDamp = ball.la < 25 ? 0.82 : 1;
  return base * shape * lineDamp;
}

function flightOf(la: number): Flight {
  if (la < 10) return 'ground';
  if (la < 25) return 'line';
  if (la < 50) return 'fly';
  return 'pop';
}

export function fielderFor(flight: Flight, dist: number, spray: number, ev: number): string {
  if ((flight === 'fly' || flight === 'line') && dist > 200) {
    return spray < -15 ? 'LF' : spray > 15 ? 'RF' : 'CF';
  }
  if (flight === 'ground' && ev < 72 && Math.abs(spray) < 6) return 'P';
  if (spray < -24) return '3B';
  if (spray < -3) return 'SS';
  if (spray < 22) return '2B';
  return '1B';
}

/** What kind of hit (or out) a batted ball becomes. */
export function classify(ball: BattedBall, speed: number, rnd: Rng): { type: HitType; dist: number; flight: Flight } {
  const flight = flightOf(ball.la);
  const dist = flight === 'ground' ? 90 + Math.max(0, ball.ev - 50) * 1.4 : carry(ball);
  const fence = fenceAt(ball.spray);
  const gap = Math.abs(ball.spray) > 12 && Math.abs(ball.spray) < 34;
  const sp = (speed - 5) * 0.01;
  let type: HitType = 'OUT';

  if (flight === 'ground') {
    if (rnd() < clamp(0.17 + (ball.ev - 80) * 0.008 + sp, 0.06, 0.45)) {
      type = ball.ev > 100 && Math.abs(ball.spray) > 30 && rnd() < 0.35 ? '2B' : '1B';
    }
  } else if (flight === 'line') {
    if (dist >= fence) type = 'HR';
    else if (rnd() < clamp(0.45 + (ball.ev - 88) * 0.012, 0.2, 0.8)) {
      type = dist >= 270 && (gap || rnd() < 0.4) ? (rnd() < 0.08 + sp * 3 ? '3B' : '2B') : '1B';
    }
  } else if (flight === 'fly') {
    if (dist >= fence) type = 'HR';
    else if (dist >= fence - 25) {
      if (rnd() < 0.4) type = rnd() < 0.1 + sp * 3 && gap ? '3B' : '2B';
    } else if (dist >= 220) {
      if (rnd() < 0.1) type = gap && rnd() < 0.5 ? '2B' : '1B';
    } else if (rnd() < 0.18) type = '1B';
  } else if (rnd() < 0.03) type = '1B';

  if (type === 'OUT' && rnd() < 0.015) type = 'E';
  return { type, dist, flight };
}

const HIT_LABEL: Record<string, string> = { '1B': 'SINGLE', '2B': 'DOUBLE', '3B': 'TRIPLE', HR: 'HOME RUN!' };

/**
 * Resolves a ball in play into outs, runs and runner movement.
 * Pure apart from `rnd`.
 */
export function resolvePlay(ball: BattedBall, batter: Player, bases: Bases, outs: number, rnd: Rng): Play {
  const { type, dist, flight } = classify(ball, batter.bat.speed, rnd);
  const fielder = fielderFor(flight, dist, ball.spray, ball.ev);
  const moves: Move[] = [];
  const occ: (Player | null)[] = [null, null, null, null, null]; // index 1–3 used
  let outsMade = 0;
  let label = '';

  const runners = ([3, 2, 1] as const).filter((b) => bases[b - 1]).map((b) => ({ p: bases[b - 1]!, b }));
  const put = (p: Player, from: Move['from'], to: Move['to']) => {
    moves.push({ player: p, from, to });
    if (to >= 1 && to <= 3) occ[to] = p;
    if (to === -1) outsMade++;
  };
  /** Lead runners first; a runner never passes or lands on an occupied base. */
  const advance = (want: (b: number, p: Player) => number) => {
    for (const { p, b } of runners) {
      let to = Math.min(4, want(b, p));
      while (to < 4 && to > b && occ[to]) to--;
      put(p, b, to as Move['to']);
    }
  };
  const sp = (p: Player) => (p.bat.speed - 5) * 0.03;

  switch (type) {
    case 'HR':
    case '3B':
      advance(() => 4);
      put(batter, 0, type === 'HR' ? 4 : 3);
      label = HIT_LABEL[type];
      break;
    case '2B':
      advance((b, p) => (b >= 2 ? 4 : rnd() < 0.38 + sp(p) ? 4 : 3));
      put(batter, 0, 2);
      label = HIT_LABEL[type];
      break;
    case '1B':
      advance((b, p) => (b === 3 ? 4 : b === 2 ? (rnd() < 0.58 + sp(p) ? 4 : 3) : rnd() < 0.25 + sp(p) ? 3 : 2));
      put(batter, 0, 1);
      label = HIT_LABEL[type];
      break;
    case 'E':
      advance((b) => b + 1);
      put(batter, 0, 1);
      label = `ERROR ${fielder}`;
      break;
    case 'OUT': {
      if (flight === 'ground') {
        const onFirst = bases[0];
        if (onFirst && outs < 2 && rnd() < 0.3 - (batter.bat.speed - 5) * 0.025) {
          label = 'DOUBLE PLAY';
          const after = outs + 2;
          for (const { p, b } of runners) {
            if (b === 1) put(p, 1, -1);
            else put(p, b, after < 3 ? ((b + 1) as Move['to']) : (b as Move['to']));
          }
          put(batter, 0, -1);
        } else if (onFirst && outs < 2 && rnd() < 0.4) {
          label = "FIELDER'S CHOICE";
          for (const { p, b } of runners) {
            if (b === 1) put(p, 1, -1);
            else put(p, b, b === 3 && rnd() < 0.5 ? 4 : ((b + 1 <= 3 && !occ[b + 1] ? b + 1 : b) as Move['to']));
          }
          put(batter, 0, 1);
        } else {
          label = `GROUNDOUT ${fielder}`;
          if (outs < 2) advance((b) => (b === 3 ? (rnd() < 0.5 ? 4 : 3) : b + 1));
          else advance((b) => b);
          put(batter, 0, -1);
        }
      } else if (flight === 'fly') {
        const tagThird = outs < 2 && bases[2] && dist >= 230 && rnd() < 0.85;
        label = tagThird ? 'SAC FLY' : `FLYOUT ${fielder}`;
        advance((b) => (b === 3 && tagThird ? 4 : b === 2 && outs < 2 && dist >= 290 && rnd() < 0.5 ? 3 : b));
        put(batter, 0, -1);
      } else {
        label = `${flight === 'line' ? 'LINEOUT' : 'POPUP'} ${fielder}`;
        advance((b) => b);
        put(batter, 0, -1);
      }
      break;
    }
  }

  // Runs don't count if the play itself makes the third out (force/DP).
  if (outs + outsMade >= 3) {
    for (const m of moves) if (m.to === 4) m.to = m.from === 0 ? -1 : (m.from as Move['to']);
  }
  return { type, label, flight, dist, spray: ball.spray, fielder, outs: outsMade, moves };
}

export const runsOn = (play: Play) => play.moves.filter((m) => m.to === 4).length;
