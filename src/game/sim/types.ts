import type { Player } from '../data/types';

export type PitchType = 'FB' | 'CB' | 'CH';

/** Strike-zone coordinates: the zone is x,y in [-1, 1]; y up. */
export interface Loc {
  x: number;
  y: number;
}

export interface Pitch {
  type: PitchType;
  speed: number; // mph
  target: Loc;
  loc: Loc; // where it actually crosses the plate
  brk: Loc; // total break, for drawing the curve
  travelMs: number; // on-screen flight time
}

export interface BattedBall {
  ev: number; // exit velocity, mph
  la: number; // launch angle, degrees
  spray: number; // -45 = left-field line, 0 = center, 45 = right-field line
}

export type SwingResult =
  | { kind: 'miss' }
  | { kind: 'foul' }
  | { kind: 'inPlay'; ball: BattedBall };

export type PitchOutcome =
  | { kind: 'ball' }
  | { kind: 'called' }
  | { kind: 'swinging' }
  | { kind: 'foul' }
  | { kind: 'inPlay'; ball: BattedBall };

export type Bases = [Player | null, Player | null, Player | null];

/** 0 = batter at home; 1–3 bases; 4 = scored; -1 = put out. */
export interface Move {
  player: Player;
  from: 0 | 1 | 2 | 3;
  to: -1 | 1 | 2 | 3 | 4;
}

export type HitType = '1B' | '2B' | '3B' | 'HR' | 'OUT' | 'E';
export type Flight = 'ground' | 'line' | 'fly' | 'pop';

export interface Play {
  type: HitType;
  label: string;
  flight: Flight;
  dist: number; // feet
  spray: number;
  fielder: string;
  outs: number; // outs recorded on the play
  moves: Move[];
}
