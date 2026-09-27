/** 1–10 scales. 5.5 is a league-average regular. */
export interface BatRatings {
  contact: number;
  power: number;
  eye: number;
  speed: number;
}

export interface PitchRatings {
  velo: number;
  stuff: number;
  control: number;
  stamina: number;
}

export interface Player {
  id: number;
  name: string; // "A. JUDGE" style short name for the 8-bit screen
  fullName: string;
  number: string;
  pos: string; // primary position abbreviation
  bats: 'L' | 'R';
  throws: 'L' | 'R';
  isPitcher: boolean;
  isHitter: boolean;
  bat: BatRatings;
  pit: PitchRatings;
  /** Short stat line for the HUD, e.g. ".287 24HR" or "3.41 ERA". */
  batLine: string;
  pitLine: string;
  pa: number;
  gs: number;
  ip: number;
}

export interface TeamInfo {
  id: number;
  abbr: string;
  name: string; // "New York Yankees"
  short: string; // "Yankees"
}

export interface Team extends TeamInfo {
  players: Player[];
}
