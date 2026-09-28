import type { RetroGame, Scene } from '../RetroGame';
import type { Gfx } from '../render/gfx';
import { C } from '../render/palette';
import { drawBall } from '../render/sprites';
import { TeamSelectScene } from './TeamSelectScene';

export class TitleScene implements Scene {
  private t = 0;
  constructor(private game: RetroGame) {}

  update(dt: number) {
    this.t += dt;
    const i = this.game.input;
    const st = this.game.settings;
    if (i.pressed('up') || i.pressed('down')) {
      st.players = st.players === 1 ? 2 : 1;
      this.game.saveSettings();
      this.game.chip.blip();
    }
    if ((i.pressed('a') || i.pressed('start')) && this.game.teams.length) {
      this.game.chip.select();
      this.game.go(new TeamSelectScene(this.game, 'user'));
    }
  }

  render(g: Gfx) {
    g.clear(C.navy);
    // night sky stars
    for (let k = 0; k < 40; k++) g.rect((k * 53) % 256, (k * 29) % 90, 1, 1, C.light);
    // stadium silhouette + light towers
    g.poly([[0, 150], [40, 120], [216, 120], [256, 150], [256, 224], [0, 224]], C.crowd);
    for (const x of [24, 232]) {
      g.rect(x - 1, 70, 2, 60, C.gray);
      g.rect(x - 8, 64, 16, 8, C.yellow);
    }
    g.poly([[0, 224], [128, 150], [256, 224]], C.grass);
    g.poly([[60, 224], [128, 175], [196, 224]], C.dirt);

    g.ctext('RETRO', 30, C.yellow, 4);
    g.ctext('BASEBALL', 66, C.white, 3);
    const by = 108 + Math.round(Math.sin(this.t * 3) * 4);
    drawBall(g, 128, by, 6);

    if (!this.game.teams.length) {
      g.ctext('LOADING TEAMS...', 136, C.white);
    } else {
      const two = this.game.settings.players === 2;
      const blink = Math.floor(this.t * 3) % 2 === 0;
      g.stext(`${!two && blink ? '>' : ' '} 1 PLAYER`, 98, 128, two ? C.light : C.yellow);
      g.stext(`${two && blink ? '>' : ' '} 2 PLAYERS`, 98, 140, two ? C.yellow : C.light);
    }
    const src = this.game.source;
    const label =
      src === 'live' ? 'LIVE MLB ROSTERS' : src === 'cached' ? 'SAVED ROSTERS (OFFLINE)' : src === 'offline' ? 'OFFLINE - DEMO TEAMS' : '';
    g.ctext(label, 160, C.light);
    g.ctext('UP/DOWN PICK   A OR START = GO', 200, C.white);
  }
}
