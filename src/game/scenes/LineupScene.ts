import type { RetroGame, Scene } from '../RetroGame';
import type { Gfx } from '../render/gfx';
import { C } from '../render/palette';
import { teamColors } from '../data/teamColors';
import { benchOf, startersOf, withStarter, type GameTeam } from '../data/lineup';

const SP_ROW = 9;
const DONE_ROW = 10;

/**
 * Set your batting order and starting pitcher before a game.
 * A on a batter picks them up; A on another swaps the two.
 * LEFT/RIGHT on a batter brings in a bench player; on SP, cycles pitchers.
 */
export class LineupScene implements Scene {
  private row = DONE_ROW;
  private held: number | null = null;
  private t = 0;
  private gt: GameTeam;

  constructor(
    private game: RetroGame,
    gt: GameTeam,
    private label: string,
    private next: (gt: GameTeam) => void,
    private back: () => void,
  ) {
    this.gt = { ...gt, lineup: [...gt.lineup] };
  }

  update(dt: number) {
    this.t += dt;
    const { input, chip } = this.game;
    if (input.pressed('up')) { this.row = (this.row + DONE_ROW) % (DONE_ROW + 1); chip.blip(); }
    if (input.pressed('down')) { this.row = (this.row + 1) % (DONE_ROW + 1); chip.blip(); }
    const d = input.pressed('left') ? -1 : input.pressed('right') ? 1 : 0;

    if (d && this.row < SP_ROW) this.substitute(this.row, d);
    if (d && this.row === SP_ROW) {
      const all = startersOf(this.gt.team);
      const i = all.indexOf(this.gt.starter);
      this.gt = withStarter(this.gt, all[(i + d + all.length) % all.length]);
      chip.blip();
    }

    if (input.pressed('b')) {
      if (this.held != null) this.held = null;
      else this.back();
      return;
    }
    if (input.pressed('a') || input.pressed('start')) {
      if (this.row === DONE_ROW || input.pressed('start')) {
        chip.select();
        this.next(this.gt);
      } else if (this.row < SP_ROW) {
        if (this.held == null) this.held = this.row;
        else {
          const l = this.gt.lineup;
          [l[this.held], l[this.row]] = [l[this.row], l[this.held]];
          this.held = null;
        }
        chip.blip();
      }
    }
  }

  /** Replace the batter in this slot with the next bench player; they take over the position. */
  private substitute(i: number, d: number) {
    const bench = benchOf(this.gt);
    if (!bench.length) return;
    const out = this.gt.lineup[i];
    const pool = [out.player, ...bench];
    const next = pool[(d + pool.length) % pool.length];
    this.gt.lineup[i] = { player: next, pos: out.pos };
    this.game.chip.blip();
  }

  render(g: Gfx) {
    g.clear(C.navy);
    const team = this.gt.team;
    g.rect(0, 0, 256, 18, teamColors(team.abbr)[0]);
    g.stext(`${this.label}${team.abbr} LINEUP`, 6, 6, C.white);
    const blink = Math.floor(this.t * 4) % 2 === 0;

    this.gt.lineup.forEach((l, i) => {
      const y = 24 + i * 12;
      const on = this.row === i;
      const held = this.held === i;
      if (held) g.rect(2, y - 2, 252, 11, C.dark);
      const col = held ? C.yellow : on ? C.yellow : C.white;
      if (on && (blink || held)) g.text('>', 4, y, C.yellow);
      g.text(`${i + 1} ${l.pos.padEnd(3)}`, 12, y, col);
      g.text(l.player.name.slice(0, 16), 48, y, col);
      g.rtext(l.player.batLine, 252, y, C.light);
    });

    const spY = 24 + 9 * 12 + 4;
    const spOn = this.row === SP_ROW;
    if (spOn && blink) g.text('>', 4, spY, C.yellow);
    g.text('SP', 12, spY, spOn ? C.yellow : C.white);
    g.text(`< ${this.gt.starter.name.slice(0, 14)} >`, 36, spY, spOn ? C.yellow : C.white);
    g.rtext(this.gt.starter.pitLine, 252, spY, C.light);

    const doneOn = this.row === DONE_ROW;
    g.box(80, 150, 96, 18, doneOn ? C.red : C.black);
    g.ctext('PLAY BALL!', 155, doneOn && blink ? C.yellow : C.white, 1, false);

    const help =
      this.held != null ? 'PICK ANOTHER BATTER TO SWAP' :
      this.row < SP_ROW ? 'A MOVE IN ORDER  </> BENCH PLAYER' :
      this.row === SP_ROW ? '</> CHOOSE STARTING PITCHER' : 'A START  B BACK';
    g.rect(0, 186, 256, 38, C.black);
    g.ctext(help, 194, C.yellow);
    g.ctext('UP/DOWN MOVE   START = PLAY BALL', 208, C.gray);
  }
}
