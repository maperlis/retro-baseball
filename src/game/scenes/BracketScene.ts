import type { RetroGame, Scene } from '../RetroGame';
import type { Gfx } from '../render/gfx';
import { C } from '../render/palette';
import { teamColors } from '../data/teamColors';
import type { TeamInfo } from '../data/types';
import { buildLineup } from '../data/lineup';
import { DIFFICULTIES } from '../sim/difficulty';
import { simulateGame, total, type GameState } from '../sim/game';
import { PlayScene } from './PlayScene';
import { editLineups, toTitle } from './flow';

const SAVE_KEY = 'retro-ball:tournament';

/** A single-elimination bracket. `winners[r]` lists who won round r, in bracket order. */
export interface Tournament {
  teams: TeamInfo[];
  userId: number;
  winners: number[][];
}

export function loadTournament(): Tournament | null {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
  } catch {
    return null;
  }
}

function save(t: Tournament | null) {
  try {
    if (t) localStorage.setItem(SAVE_KEY, JSON.stringify(t));
    else localStorage.removeItem(SAVE_KEY);
  } catch {
    /* progress just won't survive a reload */
  }
}

/** Teams still alive at the start of the current round. */
export const alive = (t: Tournament) => (t.winners.length ? t.winners[t.winners.length - 1] : t.teams.map((x) => x.id));
export const champion = (t: Tournament) => (alive(t).length === 1 ? alive(t)[0] : null);

/** Pair up the teams alive this round: [a, b], [c, d], ... */
export const matchups = (t: Tournament): [number, number][] => {
  const a = alive(t);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < a.length; i += 2) out.push([a[i], a[i + 1]]);
  return out;
};

export function newTournament(teams: TeamInfo[], user: TeamInfo, rnd = Math.random): Tournament {
  const others = teams.filter((t) => t.id !== user.id);
  let size = 8;
  while (size > 2 && size > others.length + 1) size /= 2;
  const field = [user, ...shuffle(others, rnd).slice(0, size - 1)];
  return { teams: shuffle(field, rnd), userId: user.id, winners: [] };
}

function shuffle<T>(a: T[], rnd: () => number): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

/** Record one round's results. `decided` holds winners already known (the user's game). */
export function completeRound(t: Tournament, decided: Map<string, number>, sim: (a: number, b: number) => number): Tournament {
  const round = matchups(t).map(([a, b]) => decided.get(`${a}-${b}`) ?? sim(a, b));
  return { ...t, winners: [...t.winners, round] };
}

export class BracketScene implements Scene {
  private t = 0;
  private busy: string | null = null;

  static fresh(game: RetroGame, user: TeamInfo) {
    const t = newTournament(game.teams, user);
    save(t);
    return new BracketScene(game, t);
  }

  constructor(private game: RetroGame, private tour: Tournament) {}

  private info = (id: number) => this.tour.teams.find((x) => x.id === id)!;
  private userAlive = () => alive(this.tour).includes(this.tour.userId);

  update(dt: number) {
    this.t += dt;
    const { input, chip } = this.game;
    if (this.busy) return;
    if (input.pressed('b')) return toTitle(this.game);
    if (input.pressed('start') && champion(this.tour) == null) {
      save(null); // abandon this tournament
      return toTitle(this.game);
    }
    if (!input.pressed('a')) return;
    chip.select();
    if (champion(this.tour) != null) {
      save(null);
      return toTitle(this.game);
    }
    if (this.userAlive()) void this.playUserGame();
    else void this.simRest();
  }

  /** Simulate a computer-vs-computer game; returns the winner's id. */
  private async simGame(a: number, b: number): Promise<number> {
    try {
      const [ta, tb] = await Promise.all([this.game.roster(this.info(a)), this.game.roster(this.info(b))]);
      const { state } = simulateGame(buildLineup(ta, Math.random), buildLineup(tb, Math.random), 9, Math.random, DIFFICULTIES.PRO);
      return total(state.away) > total(state.home) ? a : b;
    } catch {
      return Math.random() < 0.5 ? a : b; // roster unavailable offline: flip a coin
    }
  }

  private async finishRound(decided: Map<string, number>) {
    this.busy = 'SIMULATING OTHER GAMES...';
    const sims = new Map(decided);
    for (const [a, b] of matchups(this.tour)) {
      if (!sims.has(`${a}-${b}`)) sims.set(`${a}-${b}`, await this.simGame(a, b));
    }
    this.tour = completeRound(this.tour, sims, (a) => a);
    save(this.tour);
    this.busy = null;
  }

  private async simRest() {
    while (champion(this.tour) == null) await this.finishRound(new Map());
    this.game.go(new BracketScene(this.game, this.tour));
  }

  private async playUserGame() {
    const pair = matchups(this.tour).find((m) => m.includes(this.tour.userId))!;
    const oppId = pair[0] === this.tour.userId ? pair[1] : pair[0];
    this.busy = 'LOADING ROSTERS...';
    let userTeam, oppTeam;
    try {
      [userTeam, oppTeam] = await Promise.all([this.game.roster(this.info(this.tour.userId)), this.game.roster(this.info(oppId))]);
    } catch {
      this.busy = null;
      return;
    }
    this.busy = null;
    const { settings } = this.game;
    const back = () => this.game.go(new BracketScene(this.game, this.tour));
    editLineups(this.game, [{ gt: buildLineup(userTeam, Math.random), label: '' }], ([mine]) => {
      const cpu = buildLineup(oppTeam, Math.random);
      this.game.chip.charge();
      this.game.go(
        new PlayScene(this.game, {
          away: settings.userHome ? cpu : mine,
          home: settings.userHome ? mine : cpu,
          ctl: settings.userHome ? { home: 1, away: 0 } : { home: 0, away: 1 },
          innings: settings.innings,
          diff: DIFFICULTIES[settings.difficulty],
          onDone: (s: GameState) => {
            const homeWon = total(s.home) > total(s.away);
            const won = homeWon === settings.userHome;
            const next = new BracketScene(this.game, this.tour);
            this.game.go(next);
            void next.finishRound(new Map([[`${pair[0]}-${pair[1]}`, won ? this.tour.userId : oppId]]));
          },
        }),
      );
    }, back);
  }

  render(g: Gfx) {
    g.clear(C.navy);
    g.ctext('TOURNAMENT', 4, C.yellow, 2);
    const t = this.tour;
    const rounds = [t.teams.map((x) => x.id), ...t.winners];
    const cols = Math.log2(t.teams.length) + 1;
    const colW = Math.floor(248 / cols);
    const top = 26;
    const span = 150;
    const blink = Math.floor(this.t * 3) % 2 === 0;

    for (let r = 0; r < cols; r++) {
      const n = t.teams.length / 2 ** r;
      const ids = rounds[r] ?? [];
      const x = 4 + r * colW;
      for (let i = 0; i < n; i++) {
        const cy = top + ((i + 0.5) * span) / n;
        const id = ids[i];
        const w = colW - 10;
        if (r + 1 < cols && i % 2 === 0) {
          // connector to the next round
          const cy2 = top + ((i + 1.5) * span) / n;
          const nx = x + w;
          g.rect(nx, cy, 5, 1, C.gray);
          g.rect(nx, cy2, 5, 1, C.gray);
          g.rect(nx + 4, cy, 1, cy2 - cy + 1, C.gray);
          g.rect(nx + 4, (cy + cy2) / 2, 6, 1, C.gray);
        }
        if (id == null) {
          g.frame(x, cy - 6, w, 12, C.dark);
          continue;
        }
        const lost = rounds[r + 1] && !rounds[r + 1].includes(id);
        const info = this.info(id);
        g.rect(x, cy - 6, w, 12, lost ? C.dark : teamColors(info.abbr)[0]);
        g.stext(info.abbr, x + 3, cy - 3, lost ? C.gray : C.white);
        if (id === t.userId && (!lost || blink)) g.frame(x - 1, cy - 7, w + 2, 14, C.yellow);
      }
    }

    g.rect(0, 182, 256, 42, C.black);
    const champ = champion(t);
    if (this.busy) g.ctext(this.busy, 190, C.yellow);
    else if (champ != null) {
      g.ctext(champ === t.userId ? 'CHAMPIONS!' : `${this.info(champ).name.toUpperCase()} WIN IT ALL`, 188, C.yellow);
      g.ctext('A: NEW GAME', 204, C.white);
    } else if (this.userAlive()) {
      const pair = matchups(t).find((m) => m.includes(t.userId))!;
      const opp = this.info(pair[0] === t.userId ? pair[1] : pair[0]);
      const games = matchups(t).length;
      const round = games === 1 ? 'FINAL' : games === 2 ? 'SEMIFINAL' : 'QUARTERFINAL';
      g.ctext(`${round}: VS ${opp.name.toUpperCase()}`.slice(0, 42), 188, C.white);
      g.ctext(blink ? 'A: PLAY BALL   B: SAVE & QUIT' : '              B: SAVE & QUIT', 200, C.yellow);
      g.ctext('START: ABANDON TOURNAMENT', 212, C.gray);
    } else {
      g.ctext('ELIMINATED', 188, C.orange);
      g.ctext('A: SIMULATE THE REST', 204, C.white);
    }
  }
}
