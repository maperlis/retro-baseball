import type { RetroGame, Scene } from '../RetroGame';
import type { Gfx } from '../render/gfx';
import { C } from '../render/palette';
import { drawBall } from '../render/sprites';
import { MODES, startMode } from './flow';
import { BracketScene, champion, loadTournament } from './BracketScene';

export class TitleScene implements Scene {
  private t = 0;
  constructor(private game: RetroGame) {}

  update(dt: number) {
    this.t += dt;
    const i = this.game.input;
    const st = this.game.settings;
    const n = MODES.length;
    const idx = Math.max(0, MODES.findIndex((m) => m.id === st.mode));
    const d = i.pressed('up') ? -1 : i.pressed('down') ? 1 : 0;
    if (d) {
      st.mode = MODES[(idx + d + n) % n].id;
      this.game.saveSettings();
      this.game.chip.blip();
    }
    if ((i.pressed('a') || i.pressed('start')) && this.game.teams.length) {
      this.game.chip.select();
      const saved = st.mode === 'tournament' ? loadTournament() : null;
      if (saved && champion(saved) == null) this.game.go(new BracketScene(this.game, saved));
      else startMode(this.game);
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

    g.ctext('RETRO', 18, C.yellow, 4);
    g.ctext('BASEBALL', 52, C.white, 3);
    drawBall(g, 128, 88 + Math.round(Math.sin(this.t * 3) * 3), 5);

    if (!this.game.teams.length) {
      g.ctext('LOADING TEAMS...', 118, C.white);
    } else {
      const blink = Math.floor(this.t * 3) % 2 === 0;
      const saved = loadTournament();
      MODES.forEach((m, k) => {
        const on = m.id === this.game.settings.mode;
        const label = m.id === 'tournament' && saved && champion(saved) == null ? 'TOURNAMENT (CONTINUE)' : m.label;
        g.stext(`${on && blink ? '>' : ' '} ${label}`, 70, 104 + k * 11, on ? C.yellow : C.light);
      });
      const cur = MODES.find((m) => m.id === this.game.settings.mode);
      if (cur) g.ctext(cur.blurb, 162, C.white);
    }
    const src = this.game.source;
    const label =
      src === 'live' ? 'LIVE MLB ROSTERS' : src === 'cached' ? 'SAVED ROSTERS (OFFLINE)' : src === 'offline' ? 'OFFLINE - DEMO TEAMS' : '';
    g.ctext(label, 178, C.gray);
    g.ctext('UP/DOWN PICK   A OR START = GO', 200, C.white);
  }
}
