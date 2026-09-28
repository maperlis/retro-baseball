export type Difficulty = 'ROOKIE' | 'PRO' | 'ALLSTAR';

export interface DiffConfig {
  label: string;
  blurb: string;
  /** Pitch flight is stretched by this factor so it's hittable on a screen. */
  slow: number;
  /** Multiplies the swing timing window. */
  window: number;
  /** Multiplies the bat's reach around the aim cursor. */
  reach: number;
  /** 1 = the game aims for you (timing only); 0 = fully manual. */
  autoAim: number;
  /** >1 makes computer hitters miss more. */
  cpuBatNoise: number;
  /** Extra chance the computer pitcher throws a strike. */
  cpuZone: number;
  /** Multiplies how far your pitches miss their target. */
  pitchScatter: number;
  /** Multiplies how often your contact goes foul (lower = more balls in play). */
  foul: number;
  /** Added to your contact quality, so decent swings are hit harder. */
  boost: number;
  /** Flash the ball when it's the right moment to swing. */
  cue: boolean;
}

export const DIFFICULTIES: Record<Difficulty, DiffConfig> = {
  ROOKIE: {
    label: 'ROOKIE', blurb: 'SWING WHEN THE BALL FLASHES',
    slow: 2.7, window: 2.4, reach: 1.6, autoAim: 1, cpuBatNoise: 1.35, cpuZone: 0.12, pitchScatter: 0.7,
    foul: 0.45, boost: 0.2, cue: true,
  },
  PRO: {
    label: 'PRO', blurb: 'REAL SPEED - AIM ASSIST',
    slow: 2.1, window: 1.7, reach: 1.35, autoAim: 0.6, cpuBatNoise: 1, cpuZone: 0, pitchScatter: 1,
    foul: 0.7, boost: 0.1, cue: true,
  },
  ALLSTAR: {
    label: 'ALL-STAR', blurb: 'FAST PITCHES - AIM YOURSELF',
    slow: 1.75, window: 1.25, reach: 1.15, autoAim: 0, cpuBatNoise: 0.88, cpuZone: -0.05, pitchScatter: 1.1,
    foul: 0.9, boost: 0.04, cue: false,
  },
};

export const DIFFICULTY_ORDER: Difficulty[] = ['ROOKIE', 'PRO', 'ALLSTAR'];
