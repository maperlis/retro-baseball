import { parseRoster, parseTeams, rosterPA, statSeason, shortName } from '../data/mlbClient';
import { ROSTER_JSON, TEAMS_JSON } from './fixture';

describe('parseTeams', () => {
  it('keeps only MLB clubs, sorted by name', () => {
    const teams = parseTeams(TEAMS_JSON);
    expect(teams.map((t) => t.abbr)).toEqual(['BOS', 'NYY']);
    expect(teams[1]).toMatchObject({ id: 147, name: 'New York Yankees', short: 'Yankees' });
  });
});

describe('parseRoster', () => {
  const team = parseRoster({ id: 147, abbr: 'NYY', name: 'New York Yankees', short: 'Yankees' }, ROSTER_JSON);
  const byId = (id: number) => team.players.find((p) => p.id === id)!;

  it('builds short 8-bit names and stat lines', () => {
    expect(byId(1).name).toBe('A. SLUGGER');
    expect(byId(1).number).toBe('99');
    expect(byId(1).batLine).toBe('.315 50HR');
    expect(byId(3).pitLine).toBe('2.60 ERA');
  });

  it('turns stats into ratings that separate player types', () => {
    const slugger = byId(1).bat;
    const slapper = byId(2).bat;
    expect(slugger.power).toBeGreaterThan(8);
    expect(slapper.power).toBeLessThan(3);
    expect(slapper.speed).toBeGreaterThan(slugger.speed);
    expect(slugger.eye).toBeGreaterThan(slapper.eye);
  });

  it('gives an ace pitcher strong ratings and a starter workload', () => {
    const ace = byId(3).pit;
    expect(ace.velo).toBeGreaterThan(6);
    expect(ace.control).toBeGreaterThan(6);
    expect(ace.stamina).toBeGreaterThan(5);
    expect(byId(3).isHitter).toBe(false);
  });

  it('gives players with no stats league-average ratings', () => {
    expect(byId(4).bat).toEqual({ contact: 5.5, power: 5.5, eye: 5.5, speed: 5.5 });
    expect(byId(4).batLine).toBe('NO STATS');
  });

  it('treats a two-way player as both hitter and pitcher', () => {
    expect(byId(5).isHitter).toBe(true);
    expect(byId(5).isPitcher).toBe(true);
  });

  it('adds a second season of stats when supplied', () => {
    const doubled = parseRoster(team, ROSTER_JSON, ROSTER_JSON);
    expect(doubled.players.find((p) => p.id === 1)!.pa).toBe(1300);
    expect(rosterPA(ROSTER_JSON)).toBe(1950);
  });
});

describe('helpers', () => {
  it('uses last season before April', () => {
    expect(statSeason(new Date(2026, 1, 10))).toBe(2025);
    expect(statSeason(new Date(2026, 8, 26))).toBe(2026);
  });
  it('handles single-word names', () => {
    expect(shortName(undefined, undefined, 'Ichiro')).toBe('I. ICHIRO');
  });
});
