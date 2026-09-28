import type { RetroGame, Scene } from '../RetroGame';
import type { Gfx } from '../render/gfx';
import { C } from '../render/palette';
import { teamColors } from '../data/teamColors';
import { TitleScene } from './TitleScene';
import { SetupScene } from './SetupScene';
import { afterUserTeam } from './flow';

const COLS = 5;

export class TeamSelectScene implements Scene {
  private idx: number;
  private t = 0;

  constructor(private game: RetroGame, private step: 'user' | 'cpu') {
    const pick = step === 'user' ? game.userTeam : game.cpuTeam;
    const i = pick ? game.teams.findIndex((t) => t.id === pick.id) : -1;
    this.idx = i >= 0 ? i : step === 'cpu' ? this.nextFree(0) : 0;
  }

  private blocked(i: number) {
    return this.step === 'cpu' && this.game.teams[i]?.id === this.game.userTeam?.id;
  }

  private nextFree(i: number) {
    return this.blocked(i) ? (i + 1) % this.game.teams.length : i;
  }

  update(dt: number) {
    this.t += dt;
    const { input, teams, chip } = this.game;
    const n = teams.length;
    const move = (d: number) => {
      let j = (this.idx + d + n) % n;
      if (this.blocked(j)) j = (j + Math.sign(d) + n) % n;
      this.idx = j;
      chip.blip();
    };
    if (input.pressed('left')) move(-1);
    if (input.pressed('right')) move(1);
    if (input.pressed('up')) move(-COLS);
    if (input.pressed('down')) move(COLS);
    if (input.pressed('b')) {
      this.game.go(this.step === 'user' ? new TitleScene(this.game) : new TeamSelectScene(this.game, 'user'));
      return;
    }
    if (input.pressed('a') || input.pressed('start')) {
      const team = teams[this.idx];
      chip.select();
      void this.game.roster(team).catch(() => undefined); // start loading now
      if (this.step === 'user') {
        this.game.userTeam = team;
        if (this.game.cpuTeam?.id === team.id) this.game.cpuTeam = null;
        afterUserTeam(this.game, team);
      } else {
        this.game.cpuTeam = team;
        this.game.go(new SetupScene(this.game));
      }
    }
  }

  render(g: Gfx) {
    g.clear(C.navy);
    const two = this.game.settings.players === 2;
    const title = this.step === 'user'
      ? two ? 'PLAYER 1: CHOOSE TEAM' : 'CHOOSE YOUR TEAM'
      : two ? 'PLAYER 2: CHOOSE TEAM' : 'CHOOSE OPPONENT';
    g.ctext(title, 8, C.yellow);
    const teams = this.game.teams;
    const rows = Math.ceil(teams.length / COLS);
    const cellH = rows > 6 ? 18 : 22;
    teams.forEach((t, i) => {
      const x = 9 + (i % COLS) * 48;
      const y = 24 + Math.floor(i / COLS) * cellH;
      const [pri, sec] = teamColors(t.abbr);
      const off = this.blocked(i);
      g.rect(x, y, 44, cellH - 3, off ? C.dark : pri);
      g.rect(x, y + cellH - 5, 44, 2, off ? C.dark : sec);
      const label = t.abbr;
      g.stext(label, x + Math.round((44 - label.length * 6) / 2), y + Math.round((cellH - 11) / 2), off ? C.gray : C.white);
      if (i === this.idx && Math.floor(this.t * 4) % 2 === 0) g.frame(x - 2, y - 2, 48, cellH + 1, C.yellow, 2);
    });
    const sel = teams[this.idx];
    g.rect(0, 186, 256, 38, C.black);
    if (sel) g.ctext(sel.name.toUpperCase(), 192, C.white);
    if (this.step === 'cpu' && this.game.userTeam) g.ctext(`${two ? 'P1' : 'YOU'}: ${this.game.userTeam.name.toUpperCase()}`, 202, C.light);
    g.ctext('ARROWS MOVE  A PICK  B BACK', 213, C.gray);
  }
}
