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
}

export const DIFFICULTIES: Record<Difficulty, DiffConfig> = {
  ROOKIE: {
    label: 'ROOKIE', blurb: 'SLOW PITCHES - JUST TIME IT',
    slow: 2.5, window: 1.5, reach: 1.35, autoAim: 1, cpuBatNoise: 1.35, cpuZone: 0.12, pitchScatter: 0.7,
  },
  PRO: {
    label: 'PRO', blurb: 'REAL SPEED - AIM ASSIST',
    slow: 2.0, window: 1.15, reach: 1.12, autoAim: 0.5, cpuBatNoise: 1, cpuZone: 0, pitchScatter: 1,
  },
  ALLSTAR: {
    label: 'ALL-STAR', blurb: 'FAST PITCHES - AIM YOURSELF',
    slow: 1.65, window: 1, reach: 1, autoAim: 0, cpuBatNoise: 0.88, cpuZone: -0.05, pitchScatter: 1.1,
  },
};

export const DIFFICULTY_ORDER: Difficulty[] = ['ROOKIE', 'PRO', 'ALLSTAR'];
