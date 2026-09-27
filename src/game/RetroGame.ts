import { Gfx, W, H } from './render/gfx';
import { C } from './render/palette';
import { Input } from './engine/input';
import { Chip } from './engine/audio';
import { loadTeam, loadTeams, type Source } from './data/mlbClient';
import type { Team, TeamInfo } from './data/types';
import type { Difficulty } from './sim/difficulty';
import { TitleScene } from './scenes/TitleScene';

export interface Scene {
  update(dt: number, now: number): void;
  render(g: Gfx, now: number): void;
}

export interface Settings {
  difficulty: Difficulty;
  innings: number;
  userHome: boolean;
}

const SETTINGS_KEY = 'retro-ball:settings';

/** Owns the canvas, the loop, shared data, and which scene is showing. */
export class RetroGame {
  readonly g: Gfx;
  readonly chip = new Chip();
  scene: Scene;
  paused = false;

  teams: TeamInfo[] = [];
  source: Source | 'loading' = 'loading';
  userTeam: TeamInfo | null = null;
  cpuTeam: TeamInfo | null = null;
  settings: Settings = { difficulty: 'ROOKIE', innings: 3, userHome: true };

  private rosters = new Map<number, Promise<Team>>();
  private raf = 0;
  private last = 0;
  private detach: () => void;

  constructor(canvas: HTMLCanvasElement, readonly input: Input) {
    canvas.width = W;
    canvas.height = H;
    this.g = new Gfx(canvas.getContext('2d')!);
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
      if (saved) this.settings = { ...this.settings, ...saved };
    } catch {
      /* first run or blocked storage */
    }
    input.onAnyPress = () => this.chip.unlock();
    input.onMute = () => this.chip.toggleMute();
    this.detach = input.attachKeyboard(window);
    this.scene = new TitleScene(this);
    void loadTeams().then(({ teams, source }) => {
      this.teams = teams;
      this.source = source;
    });
    this.raf = requestAnimationFrame(this.tick);
  }

  saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      /* ignore */
    }
  }

  /** Roster fetches are shared and started early (on team pick) to hide latency. */
  roster(info: TeamInfo): Promise<Team> {
    let p = this.rosters.get(info.id);
    if (!p) {
      p = loadTeam(info);
      p.catch(() => this.rosters.delete(info.id));
      this.rosters.set(info.id, p);
    }
    return p;
  }

  go(scene: Scene) {
    this.scene = scene;
    this.paused = false;
  }

  private tick = (now: number) => {
    const dt = Math.min(0.05, (now - (this.last || now)) / 1000);
    this.last = now;
    if (this.paused) {
      if (this.input.pressed('start') || this.input.pressed('a')) {
        this.paused = false;
        this.chip.blip();
      } else if (this.input.pressed('b')) {
        this.go(new TitleScene(this));
      }
    } else {
      this.scene.update(dt, now);
    }
    this.scene.render(this.g, now);
    if (this.paused) this.drawPause();
    this.input.endTick();
    this.raf = requestAnimationFrame(this.tick);
  };

  private drawPause() {
    const g = this.g;
    g.box(56, 76, 144, 60);
    g.ctext('PAUSED', 86, C.yellow, 2);
    g.ctext('A  RESUME', 106, C.white, 1, false);
    g.ctext('B  QUIT GAME', 118, C.white, 1, false);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.detach();
  }
}
