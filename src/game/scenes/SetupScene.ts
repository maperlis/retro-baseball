import type { RetroGame, Scene } from '../RetroGame';
import type { Gfx } from '../render/gfx';
import { C } from '../render/palette';
import { teamColors } from '../data/teamColors';
import { buildLineup } from '../data/lineup';
import { DIFFICULTIES, DIFFICULTY_ORDER } from '../sim/difficulty';
import { TeamSelectScene } from './TeamSelectScene';
import { PlayScene } from './PlayScene';

const INNINGS = [3, 6, 9];
type Item = 'difficulty' | 'innings' | 'side' | 'play';
const ITEMS: Item[] = ['difficulty', 'innings', 'side', 'play'];

export class SetupScene implements Scene {
  private cursor = 3;
  private t = 0;
  private status: 'idle' | 'loading' | 'error' = 'idle';

  constructor(private game: RetroGame) {}

  update(dt: number) {
    this.t += dt;
    const { input, chip, settings } = this.game;
    if (this.status === 'loading') return;
    if (input.pressed('up')) { this.cursor = (this.cursor + 3) % 4; chip.blip(); }
    if (input.pressed('down')) { this.cursor = (this.cursor + 1) % 4; chip.blip(); }
    const item = ITEMS[this.cursor];
    const d = input.pressed('left') ? -1 : input.pressed('right') ? 1 : 0;
    if (d) {
      chip.blip();
      if (item === 'difficulty') {
        const i = DIFFICULTY_ORDER.indexOf(settings.difficulty);
        settings.difficulty = DIFFICULTY_ORDER[(i + d + 3) % 3];
      } else if (item === 'innings') {
        settings.innings = INNINGS[(INNINGS.indexOf(settings.innings) + d + 3) % 3] ?? 3;
      } else if (item === 'side') {
        settings.userHome = !settings.userHome;
      }
      this.game.saveSettings();
    }
    if (input.pressed('b')) {
      this.game.go(new TeamSelectScene(this.game, 'cpu'));
      return;
    }
    if (input.pressed('a') || input.pressed('start')) {
      if (item !== 'play') {
        this.cursor = 3;
        chip.blip();
        return;
      }
      void this.start();
    }
  }

  private async start() {
    const { userTeam, cpuTeam, settings } = this.game;
    if (!userTeam || !cpuTeam) return;
    this.status = 'loading';
    try {
      const [u, c] = await Promise.all([this.game.roster(userTeam), this.game.roster(cpuTeam)]);
      const rnd = Math.random;
      const user = buildLineup(u, rnd);
      const cpu = buildLineup(c, rnd);
      this.game.chip.charge();
      this.game.go(
        new PlayScene(this.game, settings.userHome ? cpu : user, settings.userHome ? user : cpu,
          settings.userHome ? 'home' : 'away', settings.innings, DIFFICULTIES[settings.difficulty]),
      );
    } catch {
      this.status = 'error';
    }
  }

  render(g: Gfx) {
    g.clear(C.navy);
    const { userTeam, cpuTeam, settings } = this.game;
    const badge = (abbr: string, x: number, who: string) => {
      const [pri, sec] = teamColors(abbr);
      g.rect(x, 14, 72, 36, pri);
      g.rect(x, 46, 72, 4, sec);
      g.stext(abbr, x + Math.round((72 - (abbr.length * 12 - 2)) / 2), 22, C.white, 2);
      g.text(who, x + Math.round((72 - who.length * 6) / 2), 54, C.light);
    };
    if (userTeam) badge(userTeam.abbr, 24, 'YOU');
    if (cpuTeam) badge(cpuTeam.abbr, 160, 'CPU');
    g.ctext('VS', 26, C.yellow, 2);

    const rows: [Item, string, string][] = [
      ['difficulty', 'LEVEL', DIFFICULTIES[settings.difficulty].label],
      ['innings', 'INNINGS', String(settings.innings)],
      ['side', 'YOU ARE', settings.userHome ? 'HOME' : 'AWAY'],
    ];
    rows.forEach(([, label, value], i) => {
      const y = 78 + i * 18;
      const on = this.cursor === i;
      if (on) g.text('>', 30, y, C.yellow);
      g.text(label, 42, y, on ? C.yellow : C.white);
      g.text(`< ${value.padEnd(8)} >`, 124, y, on ? C.yellow : C.light);
    });
    g.ctext(DIFFICULTIES[settings.difficulty].blurb, 132, C.light);
    const playOn = this.cursor === 3;
    const blink = Math.floor(this.t * 3) % 2 === 0;
    g.box(64, 148, 128, 22, playOn ? C.red : C.black);
    g.ctext('PLAY BALL!', 155, playOn && blink ? C.yellow : C.white, 1, false);

    if (this.status === 'loading') g.ctext('LOADING ROSTERS...', 182, C.yellow);
    else if (this.status === 'error') g.ctext('COULD NOT LOAD ROSTER - PRESS A', 182, C.orange);
    else g.ctext(settings.userHome ? 'HOME TEAM BATS SECOND' : 'AWAY TEAM BATS FIRST', 182, C.gray);
    g.ctext('UP/DOWN PICK  LEFT/RIGHT CHANGE', 204, C.gray);
    g.ctext('A START  B BACK', 214, C.gray);
  }
}
