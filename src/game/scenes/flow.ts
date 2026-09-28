import type { RetroGame } from '../RetroGame';
import type { Team, TeamInfo } from '../data/types';
import { buildLineup, ensureInLineup, type GameTeam } from '../data/lineup';
import { DIFFICULTIES } from '../sim/difficulty';
import { TeamSelectScene } from './TeamSelectScene';
import { PickPlayerScene } from './PickPlayerScene';
import { SetupScene } from './SetupScene';
import { LineupScene } from './LineupScene';
import { PlayScene } from './PlayScene';
import { TitleScene } from './TitleScene';
import { BracketScene } from './BracketScene';

/**
 * Which screen follows which, per game mode. Keeping it in one place means
 * each screen only says "I'm done" and doesn't need to know about the others.
 */
export type Mode = 'game1' | 'game2' | 'derby' | 'player' | 'tournament';

export const MODES: { id: Mode; label: string; blurb: string }[] = [
  { id: 'game1', label: '1 PLAYER', blurb: 'YOU VS THE COMPUTER' },
  { id: 'game2', label: '2 PLAYERS', blurb: 'TWO PEOPLE, ONE DEVICE' },
  { id: 'derby', label: 'HOME RUN DERBY', blurb: '10 OUTS - HIT AS MANY AS YOU CAN' },
  { id: 'player', label: 'BE A PLAYER', blurb: 'CONTROL ONE HITTER ALL GAME' },
  { id: 'tournament', label: 'TOURNAMENT', blurb: '8 TEAMS - WIN 3 TO TAKE THE CUP' },
];

export function startMode(game: RetroGame) {
  game.settings.players = game.settings.mode === 'game2' ? 2 : 1;
  game.saveSettings();
  game.go(new TeamSelectScene(game, 'user'));
}

export function afterUserTeam(game: RetroGame, info: TeamInfo) {
  const back = () => game.go(new TeamSelectScene(game, 'user'));
  switch (game.settings.mode) {
    case 'derby':
      game.go(new PickPlayerScene(game, info, 'DERBY: PICK A HITTER', (team, p) => startDerby(game, team, p), back));
      return;
    case 'player':
      game.go(
        new PickPlayerScene(game, info, 'PICK YOUR PLAYER', (_t, p) => {
          game.hero = p;
          game.go(new TeamSelectScene(game, 'cpu'));
        }, back),
      );
      return;
    case 'tournament':
      game.go(new SetupScene(game));
      return;
    default:
      game.go(new TeamSelectScene(game, 'cpu'));
  }
}

function startDerby(game: RetroGame, team: Team, hitter: import('../data/types').Player) {
  const gt = buildLineup(team, Math.random);
  game.chip.charge();
  game.go(
    new PlayScene(game, {
      away: gt, home: gt, ctl: { away: 1, home: 0 }, innings: 1,
      diff: DIFFICULTIES[game.settings.difficulty],
      derby: { hitter, outs: 10 },
    }),
  );
}

/** Let each human side set its lineup, one after another. */
export function editLineups(
  game: RetroGame,
  queue: { gt: GameTeam; label: string }[],
  done: (edited: GameTeam[]) => void,
  back: () => void,
  edited: GameTeam[] = [],
) {
  if (queue.length === 0) return done(edited);
  const [first, ...rest] = queue;
  game.go(
    new LineupScene(game, first.gt, first.label, (gt) => editLineups(game, rest, done, back, [...edited, gt]), back),
  );
}

/** From the setup screen: build lineups and start the game for the current mode. */
export async function startFromSetup(game: RetroGame) {
  const { userTeam, cpuTeam, settings } = game;
  if (settings.mode === 'tournament') {
    if (!userTeam) return;
    game.go(BracketScene.fresh(game, userTeam));
    return;
  }
  if (!userTeam || !cpuTeam) return;
  const [u, c] = await Promise.all([game.roster(userTeam), game.roster(cpuTeam)]);
  let user = buildLineup(u, Math.random);
  const cpu = buildLineup(c, Math.random);
  const diff = DIFFICULTIES[settings.difficulty];
  const side = settings.userHome ? 'home' : 'away';
  const back = () => game.go(new SetupScene(game));

  const launch = (p1: GameTeam, p2: GameTeam) => {
    game.chip.charge();
    const other = settings.mode === 'game2' ? 2 : 0;
    const hero = settings.mode === 'player' && game.hero ? { player: game.hero, side } as const : undefined;
    // Be a Player: the computer runs both teams except when your hitter is up.
    const mine = hero ? 0 : 1;
    const ctl = settings.userHome ? { home: mine, away: other } as const : { home: other, away: mine } as const;
    game.go(
      new PlayScene(game, {
        away: settings.userHome ? p2 : p1, home: settings.userHome ? p1 : p2,
        ctl, innings: settings.innings, diff, hero,
      }),
    );
  };

  if (settings.mode === 'player' && game.hero) {
    user = ensureInLineup(user, game.hero);
    launch(user, cpu);
    return;
  }
  const two = settings.mode === 'game2';
  const queue = [{ gt: user, label: two ? 'P1 ' : '' }];
  if (two) queue.push({ gt: cpu, label: 'P2 ' });
  editLineups(game, queue, ([p1, p2]) => launch(p1, p2 ?? cpu), back);
}

export function toTitle(game: RetroGame) {
  game.go(new TitleScene(game));
}
