import type { Gfx } from './gfx';
import { C } from './palette';
import { teamColors } from '../data/teamColors';
import { total, type GameState } from '../sim/game';

const dot = (g: Gfx, x: number, y: number, on: boolean, color: string) => {
  g.rect(x, y, 5, 5, C.black);
  g.rect(x + 1, y + 1, 3, 3, on ? color : C.dark);
};

function baseDiamond(g: Gfx, cx: number, cy: number, on: boolean) {
  g.poly([[cx, cy - 3], [cx + 4, cy + 1], [cx, cy + 5], [cx - 4, cy + 1]], on ? C.yellow : C.gray);
}

/** Score, inning, count, outs and runners. */
export function drawHUD(g: Gfx, s: GameState) {
  g.box(2, 2, 62, 22);
  const rows: [string, number][] = [
    [s.away.gt.team.abbr, total(s.away)],
    [s.home.gt.team.abbr, total(s.home)],
  ];
  rows.forEach(([abbr, runs], i) => {
    const y = 5 + i * 9;
    g.rect(5, y, 4, 7, teamColors(abbr)[0]);
    g.text(abbr, 12, y, C.white);
    g.rtext(String(runs), 60, y, C.yellow);
  });

  g.box(176, 2, 78, 31);
  const lab = (t: string, y: number) => g.text(t, 181, y, C.white);
  lab('B', 6);
  lab('S', 15);
  lab('O', 24);
  for (let i = 0; i < 3; i++) dot(g, 189 + i * 7, 7, s.balls > i, '#38d838');
  for (let i = 0; i < 2; i++) dot(g, 189 + i * 7, 16, s.strikes > i, C.yellow);
  for (let i = 0; i < 2; i++) dot(g, 189 + i * 7, 25, s.outs > i, C.red);
  g.text(`${s.half === 'top' ? '^' : '~'}${s.inning}`, 218, 6, C.white);
  baseDiamond(g, 238, 16, !!s.bases[1]);
  baseDiamond(g, 245, 22, !!s.bases[0]);
  baseDiamond(g, 231, 22, !!s.bases[2]);
}

/** Classic line score table. */
export function drawLineScore(g: Gfx, s: GameState, y: number) {
  const n = Math.max(s.innings, s.inning);
  const first = Math.max(1, n - 11); // show at most 12 innings
  const cols = n - first + 1;
  const cw = 13;
  const w = 32 + cols * cw + 2 * 18 + 8;
  const x = Math.round((256 - w) / 2);
  g.box(x, y, w, 36);
  const hx = x + 32;
  for (let i = 0; i < cols; i++) g.text(String((first + i) % 10), hx + i * cw + 3, y + 5, C.light);
  g.text('R', hx + cols * cw + 6, y + 5, C.yellow);
  g.text('H', hx + cols * cw + 24, y + 5, C.yellow);
  [s.away, s.home].forEach((sd, r) => {
    const ry = y + 15 + r * 10;
    g.rect(x + 5, ry, 4, 7, teamColors(sd.gt.team.abbr)[0]);
    g.text(sd.gt.team.abbr, x + 11, ry, C.white);
    for (let i = 0; i < cols; i++) {
      const inn = first + i;
      const v = sd.runs[inn - 1];
      const played = r === 0 ? inn <= s.inning : inn < s.inning || (inn === s.inning && s.half === 'bottom');
      const txt = v == null || !played ? (s.final && r === 1 && inn === s.inning && s.half === 'top' ? 'X' : '') : String(v);
      g.text(txt, hx + i * cw + 3, ry, C.white);
    }
    g.rtext(String(total(sd)), hx + cols * cw + 11, ry, C.yellow);
    g.rtext(String(sd.hits), hx + cols * cw + 29, ry, C.white);
  });
}
