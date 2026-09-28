import type { TeamInfo } from '../data/types';
import { FALLBACK_TEAMS } from '../data/fallbackTeams';
import { benchOf, buildLineup, ensureInLineup, hittersByPower, startersOf, withStarter } from '../data/lineup';
import { alive, champion, completeRound, matchups, newTournament } from '../scenes/BracketScene';
import { seededRandom } from '../sim/rng';

const teams: TeamInfo[] = Array.from({ length: 30 }, (_, i) => ({ id: 100 + i, abbr: `T${i}`, name: `Team ${i}`, short: `T${i}` }));

describe('tournament bracket', () => {
  it('seeds 8 teams including yours and plays down to one champion', () => {
    const me = teams[5];
    let t = newTournament(teams, me, seededRandom('t'));
    expect(t.teams).toHaveLength(8);
    expect(t.teams.some((x) => x.id === me.id)).toBe(true);
    expect(new Set(t.teams.map((x) => x.id)).size).toBe(8);
    expect(matchups(t)).toHaveLength(4);

    const lowerId = (a: number, b: number) => Math.min(a, b);
    t = completeRound(t, new Map(), lowerId);
    expect(alive(t)).toHaveLength(4);
    t = completeRound(t, new Map(), lowerId);
    t = completeRound(t, new Map(), lowerId);
    expect(champion(t)).toBe(Math.min(...t.teams.map((x) => x.id)));
  });

  it('uses the result of your game instead of simulating it', () => {
    const me = teams[0];
    let t = newTournament(teams, me, seededRandom('u'));
    const [a, b] = matchups(t).find((m) => m.includes(me.id))!;
    t = completeRound(t, new Map([[`${a}-${b}`, me.id]]), () => -1);
    expect(alive(t)).toContain(me.id);
  });

  it('shrinks the bracket when only a couple of teams exist (offline demo)', () => {
    const t = newTournament(teams.slice(0, 2), teams[0]);
    expect(t.teams).toHaveLength(2);
    expect(matchups(t)).toHaveLength(1);
  });
});

describe('lineup choices', () => {
  const team = FALLBACK_TEAMS[0];
  const gt = buildLineup(team, seededRandom('l'));

  it('offers bench hitters who are not already batting', () => {
    const bench = benchOf(gt);
    expect(bench.length).toBeGreaterThan(0);
    for (const p of bench) expect(gt.lineup.some((l) => l.player.id === p.id)).toBe(false);
  });

  it('changing the starter rebuilds the bullpen without him', () => {
    const other = startersOf(team).find((p) => p !== gt.starter)!;
    const next = withStarter(gt, other);
    expect(next.starter).toBe(other);
    expect(next.bullpen).not.toContain(other);
    expect(next.bullpen.length).toBeGreaterThan(0);
  });

  it('puts your chosen player into the lineup for Be a Player', () => {
    const benchGuy = benchOf(gt)[0];
    const withHero = ensureInLineup(gt, benchGuy);
    expect(withHero.lineup.some((l) => l.player.id === benchGuy.id)).toBe(true);
    expect(withHero.lineup).toHaveLength(9);
  });

  it('lists sluggers first for the derby picker', () => {
    const list = hittersByPower(team);
    expect(list[0].bat.power).toBeGreaterThanOrEqual(list[list.length - 1].bat.power);
  });
});
