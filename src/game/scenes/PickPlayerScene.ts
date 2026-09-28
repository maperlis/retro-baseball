import type { RetroGame, Scene } from '../RetroGame';
import type { Gfx } from '../render/gfx';
import { C } from '../render/palette';
import { teamColors } from '../data/teamColors';
import type { Player, Team, TeamInfo } from '../data/types';
import { hittersByPower } from '../data/lineup';

const ROWS = 12;

/** Choose one hitter from a roster (Home Run Derby, Be a Player). */
export class PickPlayerScene implements Scene {
  private team: Team | null = null;
  private list: Player[] = [];
  private idx = 0;
  private t = 0;
  private error = false;

  constructor(
    private game: RetroGame,
    private info: TeamInfo,
    private title: string,
    private next: (team: Team, p: Player) => void,
    private back: () => void,
  ) {
    this.load();
  }

  private load() {
    this.error = false;
    this.game.roster(this.info).then(
      (team) => {
        this.team = team;
        this.list = hittersByPower(team);
      },
      () => (this.error = true),
    );
  }

  update(dt: number) {
    this.t += dt;
    const { input, chip } = this.game;
    if (input.pressed('b')) return this.back();
    if (this.error && input.pressed('a')) return this.load();
    if (!this.team || !this.list.length) return;
    const n = this.list.length;
    if (input.pressed('up')) { this.idx = (this.idx + n - 1) % n; chip.blip(); }
    if (input.pressed('down')) { this.idx = (this.idx + 1) % n; chip.blip(); }
    if (input.pressed('left')) { this.idx = Math.max(0, this.idx - ROWS); chip.blip(); }
    if (input.pressed('right')) { this.idx = Math.min(n - 1, this.idx + ROWS); chip.blip(); }
    if (input.pressed('a') || input.pressed('start')) {
      chip.select();
      this.next(this.team, this.list[this.idx]);
    }
  }

  render(g: Gfx) {
    g.clear(C.navy);
    g.rect(0, 0, 256, 18, teamColors(this.info.abbr)[0]);
    g.stext(this.title, 6, 6, C.white);
    if (this.error) return g.ctext('COULD NOT LOAD ROSTER - A TO RETRY', 100, C.orange);
    if (!this.team) return g.ctext('LOADING ROSTER...', 100, C.yellow);

    const start = Math.floor(this.idx / ROWS) * ROWS;
    g.text('PLAYER', 16, 22, C.gray);
    g.text('POW CON SPD', 150, 22, C.gray);
    this.list.slice(start, start + ROWS).forEach((p, k) => {
      const i = start + k;
      const y = 32 + k * 12;
      const on = i === this.idx;
      if (on) g.rect(2, y - 2, 252, 11, C.dark);
      g.text(`${on ? '>' : ' '}${p.pos.padEnd(3)} ${p.name.slice(0, 14)}`, 4, y, on ? C.yellow : C.white);
      const r = (v: number) => String(Math.round(v)).padStart(3);
      g.text(`${r(p.bat.power)} ${r(p.bat.contact)} ${r(p.bat.speed)}`, 150, y, on ? C.yellow : C.light);
    });
    const sel = this.list[this.idx];
    g.rect(0, 184, 256, 40, C.black);
    if (sel) g.ctext(`${sel.fullName.toUpperCase()}  ${sel.batLine}`, 190, C.white);
    g.ctext(`${this.idx + 1}/${this.list.length}  UP/DOWN  </> PAGE  A PICK`, 206, C.gray);
  }
}
