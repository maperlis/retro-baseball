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
    } else if (Math.floor(this.t * 2) % 2 === 0) {
      g.ctext('PRESS START', 136, C.white);
    }
    const src = this.game.source;
    const label =
      src === 'live' ? 'LIVE MLB ROSTERS' : src === 'cached' ? 'SAVED ROSTERS (OFFLINE)' : src === 'offline' ? 'OFFLINE - DEMO TEAMS' : '';
    g.ctext(label, 154, C.light);
    g.ctext('Z/SPACE OR A = GO   M = SOUND', 200, C.white);
  }
}
