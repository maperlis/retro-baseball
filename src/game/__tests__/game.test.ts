import type { Player } from '../data/types';
import { buildLineup, type GameTeam } from '../data/lineup';
import { FALLBACK_TEAMS } from '../data/fallbackTeams';
import { batRatings, pitchRatings, parseIP } from '../data/ratings';
import {
  applyPitch, currentBatter, maybeRelieve, newGame, nextHalf, simulateGame, total, fielding,
} from '../sim/game';
import { resolvePlay } from '../sim/outcome';
import { DIFFICULTIES } from '../sim/difficulty';
import { seededRandom } from '../sim/rng';

const PRO = DIFFICULTIES.PRO;
const lineups = (seed = 's'): [GameTeam, GameTeam] => {
  const rnd = seededRandom(seed);
  return [buildLineup(FALLBACK_TEAMS[0], rnd), buildLineup(FALLBACK_TEAMS[1], rnd)];
};
const never = () => 0.999;

describe('ratings', () => {
  it('parses innings notation', () => {
    expect(parseIP('150.1')).toBeCloseTo(150.333, 2);
    expect(parseIP('7.2')).toBeCloseTo(7.667, 2);
  });
  it('regresses tiny samples toward average', () => {
    const hot = batRatings({ pa: 10, ab: 9, h: 6, d: 1, t: 0, hr: 3, bb: 1, so: 1, sb: 0 });
    expect(hot.power).toBeLessThan(7);
    expect(hot.power).toBeGreaterThan(5.5);
  });
  it('marks relievers as low stamina', () => {
    expect(pitchRatings({ ip: 60, er: 20, so: 70, bb: 20, h: 50, hr: 5, gs: 0, g: 60 }).stamina).toBeLessThan(3);
  });
});

describe('lineup', () => {
  it('fields nine distinct batters with one of each position', () => {
    const [a] = lineups();
    expect(a.lineup).toHaveLength(9);
    expect(new Set(a.lineup.map((l) => l.player.id)).size).toBe(9);
    expect(new Set(a.lineup.map((l) => l.pos)).size).toBe(9);
    expect(a.starter.isPitcher).toBe(true);
    expect(a.bullpen.length).toBeGreaterThan(0);
  });
});

describe('count and plate appearance', () => {
  it('walks on four balls and forces runners', () => {
    const s = newGame(...lineups(), 9);
    for (let i = 0; i < 3; i++) expect(applyPitch(s, { kind: 'ball' }, never).kind).toBe('ball');
    const ev = applyPitch(s, { kind: 'ball' }, never);
    expect(ev.kind).toBe('walk');
    expect(s.bases[0]).not.toBeNull();
    expect(s.balls).toBe(0);
  });

  it('strikes out on three strikes; fouls never make strike three', () => {
    const s = newGame(...lineups(), 9);
    applyPitch(s, { kind: 'called' }, never);
    applyPitch(s, { kind: 'foul' }, never);
    applyPitch(s, { kind: 'foul' }, never);
    expect(s.strikes).toBe(2);
    expect(applyPitch(s, { kind: 'swinging' }, never).kind).toBe('strikeout');
    expect(s.outs).toBe(1);
  });

  it('scores a bases-loaded walk', () => {
    const s = newGame(...lineups(), 9);
    const [a, b, c] = s.away.gt.lineup.map((l) => l.player);
    s.bases = [a, b, c];
    for (let i = 0; i < 4; i++) applyPitch(s, { kind: 'ball' }, never);
    expect(total(s.away)).toBe(1);
  });

  it('flags the half inning over at three outs', () => {
    const s = newGame(...lineups(), 9);
    for (let k = 0; k < 3; k++) for (let i = 0; i < 3; i++) applyPitch(s, { kind: 'called' }, never);
    expect(s.halfOver).toBe(true);
    nextHalf(s);
    expect(s.half).toBe('bottom');
    expect(s.outs).toBe(0);
  });
});

describe('batted balls', () => {
  const batter = { bat: { contact: 5, power: 5, eye: 5, speed: 5 } } as Player;
  const r = (n: number) => { const s = seededRandom(`bb${n}`); return s; };

  it('a crushed fly ball leaves the park and clears the bases', () => {
    const runner = { ...batter, id: 2 } as Player;
    const play = resolvePlay({ ev: 112, la: 28, spray: 0 }, batter, [runner, null, null], 0, r(1));
    expect(play.type).toBe('HR');
    expect(play.moves.filter((m) => m.to === 4)).toHaveLength(2);
  });

  it('a pop-up is almost always an out with runners holding', () => {
    let outs = 0;
    for (let i = 0; i < 100; i++) if (resolvePlay({ ev: 70, la: 70, spray: 5 }, batter, [null, null, null], 0, r(i)).type === 'OUT') outs++;
    expect(outs).toBeGreaterThan(90);
  });

  it('runs never score on a play that makes the third out', () => {
    const runner = { ...batter, id: 3 } as Player;
    for (let i = 0; i < 200; i++) {
      const play = resolvePlay({ ev: 85, la: 0, spray: -10 }, batter, [runner, runner, runner], 2, r(i));
      if (play.type === 'OUT') expect(play.moves.some((m) => m.to === 4)).toBe(false);
    }
  });
});

describe('game flow', () => {
  it('skips the bottom of the last inning when the home team leads', () => {
    const s = newGame(...lineups(), 3);
    s.inning = 3;
    s.home.runs = [1, 0, 0];
    s.away.runs = [0, 0, 0];
    nextHalf(s);
    expect(s.final).toBe(true);
  });

  it('ends on a walk-off', () => {
    const s = newGame(...lineups(), 3);
    s.inning = 3;
    s.half = 'bottom';
    s.away.runs = [0, 0, 0];
    s.home.runs = [0, 0, 0];
    const [a, b, c] = s.home.gt.lineup.map((l) => l.player);
    s.bases = [a, b, c];
    for (let i = 0; i < 4; i++) applyPitch(s, { kind: 'ball' }, never);
    expect(s.final).toBe(true);
  });

  it('goes to extra innings with a runner on second when tied', () => {
    const s = newGame(...lineups(), 3);
    s.inning = 3;
    s.half = 'bottom';
    s.away.runs = [0, 0, 1];
    s.home.runs = [0, 0, 1];
    nextHalf(s);
    expect(s.final).toBe(false);
    expect(s.inning).toBe(4);
    expect(s.bases[1]).not.toBeNull();
  });

  it('brings in a reliever once the starter is spent', () => {
    const s = newGame(...lineups(), 9);
    const starter = fielding(s).pitcher;
    fielding(s).pitches = 200;
    expect(maybeRelieve(s)).not.toBeNull();
    expect(fielding(s).pitcher).not.toBe(starter);
    expect(fielding(s).pitches).toBe(0);
  });

  it('rotates through the batting order', () => {
    const s = newGame(...lineups(), 9);
    const first = currentBatter(s).player;
    for (let i = 0; i < 9; i++) for (let k = 0; k < 4; k++) applyPitch(s, { kind: 'ball' }, never);
    expect(currentBatter(s).player).toBe(first);
  });
});

describe('simulated season balance', () => {
  it('produces realistic box scores over 200 seeded games', () => {
    let runs = 0, pa = 0, k = 0, bb = 0, hr = 0;
    const games = 200;
    for (let i = 0; i < games; i++) {
      const rnd = seededRandom(`g${i}`);
      const [a, b] = lineups(`l${i}`);
      const { state, events } = simulateGame(a, b, 9, rnd, PRO);
      expect(state.final).toBe(true);
      expect(total(state.home)).not.toBe(total(state.away));
      runs += total(state.home) + total(state.away);
      for (const e of events) {
        if (e.kind === 'walk' || e.kind === 'strikeout' || e.kind === 'play') pa++;
        if (e.kind === 'walk') bb++;
        if (e.kind === 'strikeout') k++;
        if (e.play?.type === 'HR') hr++;
      }
    }
    const perTeam = runs / games / 2;
    expect(perTeam).toBeGreaterThan(3);
    expect(perTeam).toBeLessThan(6.5);
    expect(k / pa).toBeGreaterThan(0.14);
    expect(k / pa).toBeLessThan(0.3);
    expect(bb / pa).toBeGreaterThan(0.05);
    expect(bb / pa).toBeLessThan(0.13);
    expect(hr / pa).toBeGreaterThan(0.015);
    expect(hr / pa).toBeLessThan(0.05);
  });

  it('power hitters homer more than slap hitters', () => {
    const rnd = seededRandom('pow');
    const make = (power: number) => ({ bat: { contact: 6, power, eye: 5, speed: 5 }, bats: 'R' } as Player);
    const count = (p: Player) => {
      let n = 0;
      for (let i = 0; i < 3000; i++) {
        const t = (rnd() - 0.5) * 1.2;
        const play = resolvePlay({ ev: 62 + (1 - Math.abs(t)) * (38 + p.bat.power * 2.2), la: 13 + (rnd() - 0.5) * 40, spray: t * 30 }, p, [null, null, null], 0, rnd);
        if (play.type === 'HR') n++;
      }
      return n;
    };
    expect(count(make(9))).toBeGreaterThan(count(make(2)) * 2);
  });
});
