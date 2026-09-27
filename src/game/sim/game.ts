import type { Player } from '../data/types';
import type { GameTeam } from '../data/lineup';
import type { DiffConfig } from './difficulty';
import { choosePitch, fatigue, makePitch, pitchLimit, isStrike } from './pitch';
import { resolvePlay, runsOn } from './outcome';
import { resolveSwing, cpuSwing } from './swing';
import type { Rng } from './rng';
import type { Bases, Move, Pitch, PitchOutcome, Play } from './types';

export interface Side {
  gt: GameTeam;
  batIdx: number;
  pitcher: Player;
  pitches: number;
  bullpenIdx: number;
  runs: number[]; // per inning
  hits: number;
}

export interface GameState {
  innings: number;
  inning: number;
  half: 'top' | 'bottom';
  outs: number;
  balls: number;
  strikes: number;
  bases: Bases;
  away: Side;
  home: Side;
  halfOver: boolean;
  final: boolean;
}

export type EventKind = 'ball' | 'strike' | 'foul' | 'walk' | 'strikeout' | 'play';

export interface GameEvent {
  kind: EventKind;
  text: string;
  play?: Play;
  moves: Move[];
  runs: number;
}

const side = (gt: GameTeam): Side => ({
  gt, batIdx: 0, pitcher: gt.starter, pitches: 0, bullpenIdx: 0, runs: [0], hits: 0,
});

export function newGame(away: GameTeam, home: GameTeam, innings: number): GameState {
  return {
    innings, inning: 1, half: 'top', outs: 0, balls: 0, strikes: 0,
    bases: [null, null, null], away: side(away), home: side(home), halfOver: false, final: false,
  };
}

export const batting = (s: GameState) => (s.half === 'top' ? s.away : s.home);
export const fielding = (s: GameState) => (s.half === 'top' ? s.home : s.away);
export const total = (sd: Side) => sd.runs.reduce((a, b) => a + b, 0);
export const currentBatter = (s: GameState) => batting(s).gt.lineup[batting(s).batIdx % 9];
export const currentFatigue = (s: GameState) => fatigue(fielding(s).pitcher, fielding(s).pitches);

function score(s: GameState, n: number) {
  const b = batting(s);
  b.runs[s.inning - 1] = (b.runs[s.inning - 1] ?? 0) + n;
  // Walk-off: the home team takes the lead in the last inning or later.
  if (s.half === 'bottom' && s.inning >= s.innings && total(s.home) > total(s.away)) s.final = true;
}

function endPA(s: GameState) {
  s.balls = 0;
  s.strikes = 0;
  batting(s).batIdx++;
}

function recordOuts(s: GameState, n: number) {
  s.outs += n;
  if (s.outs >= 3) s.halfOver = true;
}

/** Apply one pitch's result. The caller advances the half-inning with `nextHalf`. */
export function applyPitch(s: GameState, outcome: PitchOutcome, rnd: Rng): GameEvent {
  fielding(s).pitches++;
  const none = { moves: [], runs: 0 };
  const batter = currentBatter(s).player;

  if (outcome.kind === 'ball') {
    if (++s.balls < 4) return { kind: 'ball', text: 'BALL', ...none };
    const moves = walkMoves(s.bases, batter);
    applyMoves(s, moves);
    endPA(s);
    const runs = moves.filter((m) => m.to === 4).length;
    if (runs) score(s, runs);
    return { kind: 'walk', text: 'BALL FOUR - WALK', moves, runs };
  }
  if (outcome.kind === 'foul') {
    if (s.strikes < 2) s.strikes++;
    return { kind: 'foul', text: 'FOUL BALL', ...none };
  }
  if (outcome.kind === 'called' || outcome.kind === 'swinging') {
    if (++s.strikes < 3) return { kind: 'strike', text: outcome.kind === 'called' ? 'STRIKE' : 'SWING AND MISS', ...none };
    endPA(s);
    recordOuts(s, 1);
    return { kind: 'strikeout', text: outcome.kind === 'called' ? 'STRIKEOUT LOOKING' : 'STRIKEOUT', moves: [{ player: batter, from: 0, to: -1 }], runs: 0 };
  }

  const play = resolvePlay(outcome.ball, batter, s.bases, s.outs, rnd);
  applyMoves(s, play.moves);
  if (play.type !== 'OUT' && play.type !== 'E') batting(s).hits++;
  endPA(s);
  recordOuts(s, play.outs);
  const runs = runsOn(play);
  if (runs) score(s, runs);
  return { kind: 'play', text: play.label, play, moves: play.moves, runs };
}

function walkMoves(bases: Bases, batter: Player): Move[] {
  const moves: Move[] = [{ player: batter, from: 0, to: 1 }];
  // Only forced runners move.
  if (bases[0]) {
    moves.push({ player: bases[0], from: 1, to: 2 });
    if (bases[1]) {
      moves.push({ player: bases[1], from: 2, to: 3 });
      if (bases[2]) moves.push({ player: bases[2], from: 3, to: 4 });
    }
  }
  return moves;
}

function applyMoves(s: GameState, moves: Move[]) {
  const next: Bases = [...s.bases];
  for (const m of moves) if (m.from >= 1) next[m.from - 1] = null;
  for (const m of moves) if (m.to >= 1 && m.to <= 3) next[m.to - 1] = m.player;
  s.bases = next;
}

/** Move to the next half-inning, or end the game. */
export function nextHalf(s: GameState) {
  s.halfOver = false;
  s.outs = 0;
  s.balls = 0;
  s.strikes = 0;
  s.bases = [null, null, null];
  const away = total(s.away);
  const home = total(s.home);
  if (s.half === 'top') {
    if (s.inning >= s.innings && home > away) {
      s.final = true;
      return;
    }
    s.half = 'bottom';
  } else {
    if (s.inning >= s.innings && home !== away) {
      s.final = true;
      return;
    }
    s.half = 'top';
    s.inning++;
  }
  batting(s).runs[s.inning - 1] ??= 0;
  // Extra innings start with a runner on second (the previous batter).
  if (s.inning > s.innings) {
    const b = batting(s);
    s.bases[1] = b.gt.lineup[(b.batIdx + 8) % 9].player;
  }
}

/** Bring in a reliever if the pitcher is gassed. Returns the new pitcher, if any. */
export function maybeRelieve(s: GameState): Player | null {
  const f = fielding(s);
  if (f.pitches <= pitchLimit(f.pitcher) + 8) return null;
  const next = f.gt.bullpen[f.bullpenIdx];
  if (!next) return null;
  f.bullpenIdx++;
  f.pitcher = next;
  f.pitches = 0;
  return next;
}

/** One computer-vs-computer pitch. Used for simulation tests and balance checks. */
export function cpuPitch(s: GameState, rnd: Rng, diff: DiffConfig): { pitch: Pitch; outcome: PitchOutcome } {
  const f = fielding(s);
  const batter = currentBatter(s).player;
  const { type, target } = choosePitch(s.balls, s.strikes, rnd, diff);
  const pitch = makePitch(f.pitcher, f.pitches, type, target, rnd, diff);
  const swing = cpuSwing(batter, f.pitcher, pitch, s.balls, s.strikes, fatigue(f.pitcher, f.pitches), rnd, diff);
  if (!swing) return { pitch, outcome: { kind: isStrike(pitch.loc) ? 'called' : 'ball' } };
  const r = resolveSwing(swing, batter, rnd);
  return {
    pitch,
    outcome: r.kind === 'miss' ? { kind: 'swinging' } : r.kind === 'foul' ? { kind: 'foul' } : r,
  };
}

/** Plays a whole game with no human, returning the final state. */
export function simulateGame(away: GameTeam, home: GameTeam, innings: number, rnd: Rng, diff: DiffConfig) {
  const s = newGame(away, home, innings);
  const events: GameEvent[] = [];
  let guard = 0;
  while (!s.final && guard++ < 5000) {
    if (s.balls === 0 && s.strikes === 0) maybeRelieve(s);
    const { outcome } = cpuPitch(s, rnd, diff);
    events.push(applyPitch(s, outcome, rnd));
    if (s.halfOver && !s.final) nextHalf(s);
  }
  return { state: s, events };
}
