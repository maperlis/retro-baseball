import type { Player, Team, TeamInfo } from './types';
import {
  EMPTY_HIT, EMPTY_PITCH, PITCHER_BAT, addCounts, batLine, batRatings,
  parseIP, pitLine, pitchRatings, type HitCounts, type PitchCounts,
} from './ratings';
import { FALLBACK_TEAMS } from './fallbackTeams';

/* ---------- Parsing (pure; tested against a saved fixture) ---------------- */

// Only the fields we read. The real payload is much larger.
interface ApiTeam {
  id: number;
  name: string;
  abbreviation: string;
  teamName: string;
  sport?: { id: number };
  active?: boolean;
}

interface ApiStatBlock {
  group?: { displayName?: string };
  splits?: { stat: Record<string, string | number> }[];
}

interface ApiRosterEntry {
  person: {
    id: number;
    fullName: string;
    lastName?: string;
    firstName?: string;
    useName?: string;
    primaryNumber?: string;
    batSide?: { code: string };
    pitchHand?: { code: string };
    primaryPosition?: { abbreviation: string };
    stats?: ApiStatBlock[];
  };
  jerseyNumber?: string;
  position?: { abbreviation: string; type?: string };
}

export function parseTeams(json: { teams?: ApiTeam[] }): TeamInfo[] {
  return (json.teams ?? [])
    .filter((t) => (t.sport?.id ?? 1) === 1 && t.active !== false)
    .map((t) => ({ id: t.id, abbr: t.abbreviation, name: t.name, short: t.teamName }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const n = (v: unknown) => (v == null || v === '' ? 0 : Number(v) || 0);

function sumGroup(stats: ApiStatBlock[] | undefined, group: string) {
  const blocks = (stats ?? []).filter((s) => s.group?.displayName === group);
  return blocks.flatMap((b) => b.splits ?? []).map((s) => s.stat);
}

export function hitCounts(stats: ApiStatBlock[] | undefined): HitCounts {
  return sumGroup(stats, 'hitting').reduce<HitCounts>(
    (acc, s) =>
      addCounts(acc, {
        pa: n(s.plateAppearances), ab: n(s.atBats), h: n(s.hits),
        d: n(s.doubles), t: n(s.triples), hr: n(s.homeRuns),
        bb: n(s.baseOnBalls), so: n(s.strikeOuts), sb: n(s.stolenBases),
      }),
    EMPTY_HIT,
  );
}

export function pitchCounts(stats: ApiStatBlock[] | undefined): PitchCounts {
  return sumGroup(stats, 'pitching').reduce<PitchCounts>(
    (acc, s) =>
      addCounts(acc, {
        ip: parseIP(s.inningsPitched as string), er: n(s.earnedRuns),
        so: n(s.strikeOuts), bb: n(s.baseOnBalls), h: n(s.hits),
        hr: n(s.homeRuns), gs: n(s.gamesStarted), g: n(s.gamesPitched ?? s.gamesPlayed),
      }),
    EMPTY_PITCH,
  );
}

export function shortName(first: string | undefined, last: string | undefined, full: string): string {
  const l = (last ?? full.split(' ').slice(-1)[0] ?? full).toUpperCase();
  const f = (first ?? full)[0]?.toUpperCase() ?? '';
  return f ? `${f}. ${l}` : l;
}

/**
 * `extra` is an optional second roster payload (previous season's stats for
 * the same players), added in when the current season is still thin.
 */
export function parseRoster(
  info: TeamInfo,
  json: { roster?: ApiRosterEntry[] },
  extra?: { roster?: ApiRosterEntry[] },
): Team {
  const extraById = new Map((extra?.roster ?? []).map((r) => [r.person.id, r.person.stats]));
  const players: Player[] = (json.roster ?? []).map((r) => {
    const p = r.person;
    const pos = r.position?.abbreviation ?? p.primaryPosition?.abbreviation ?? 'UT';
    const isTwoWay = pos === 'TWP';
    const isPitcher = isTwoWay || pos === 'P' || r.position?.type === 'Pitcher';
    const isHitter = isTwoWay || !isPitcher;
    const hc = addCounts(hitCounts(p.stats), hitCounts(extraById.get(p.id)));
    const pc = addCounts(pitchCounts(p.stats), pitchCounts(extraById.get(p.id)));
    const bats = p.batSide?.code === 'L' ? 'L' : p.batSide?.code === 'S'
      ? (p.pitchHand?.code === 'L' ? 'R' : 'L') // switch hitters: bat opposite a typical righty
      : 'R';
    return {
      id: p.id,
      name: shortName(p.useName ?? p.firstName, p.lastName, p.fullName),
      fullName: p.fullName,
      number: r.jerseyNumber ?? p.primaryNumber ?? '',
      pos,
      bats,
      throws: p.pitchHand?.code === 'L' ? 'L' : 'R',
      isPitcher,
      isHitter,
      bat: isHitter ? batRatings(hc) : PITCHER_BAT,
      pit: pitchRatings(pc),
      batLine: batLine(hc),
      pitLine: pitLine(pc),
      pa: hc.pa,
      gs: pc.gs,
      ip: pc.ip,
    };
  });
  return { ...info, players };
}

/** Total plate appearances across a roster payload: tells us if the season is thin. */
export function rosterPA(json: { roster?: ApiRosterEntry[] }): number {
  return (json.roster ?? []).reduce((s, r) => s + hitCounts(r.person.stats).pa, 0);
}

/* ---------- Fetching with an offline cache ------------------------------- */

const CACHE_PREFIX = 'retro-ball:';

function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function cacheSet(key: string, value: unknown) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: live data still works, just not offline */
  }
}

async function getJSON(params: Record<string, string>) {
  const res = await fetch(`/api/mlb?${new URLSearchParams(params)}`);
  if (!res.ok) throw new Error(`MLB feed ${res.status}`);
  return res.json();
}

/** Stats season: before April there's no current season yet, so use last year. */
export function statSeason(now = new Date()): number {
  return now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
}

export type Source = 'live' | 'cached' | 'offline';

export async function loadTeams(): Promise<{ teams: TeamInfo[]; source: Source }> {
  try {
    const teams = parseTeams(await getJSON({ path: 'teams' }));
    if (teams.length < 2) throw new Error('empty team list');
    cacheSet('teams', teams);
    return { teams, source: 'live' };
  } catch {
    const cached = cacheGet<TeamInfo[]>('teams');
    if (cached?.length) return { teams: cached, source: 'cached' };
    return { teams: FALLBACK_TEAMS.map(({ players: _p, ...info }) => info), source: 'offline' };
  }
}

export async function loadTeam(info: TeamInfo): Promise<Team> {
  const fallback = FALLBACK_TEAMS.find((t) => t.id === info.id);
  if (fallback) return fallback;
  const season = String(statSeason());
  try {
    let json = await getJSON({ path: 'roster', team: String(info.id), season });
    if ((json.roster ?? []).length < 20) {
      json = await getJSON({ path: 'roster', team: String(info.id), season, type: '40Man' });
    }
    // Early season: fold in last year so April ratings aren't all coin flips.
    let extra;
    if (rosterPA(json) < 1500) {
      extra = await getJSON({
        path: 'roster', team: String(info.id), season: String(Number(season) - 1),
      }).catch(() => undefined);
    }
    const team = parseRoster(info, json, extra);
    cacheSet(`team:${info.id}`, team);
    return team;
  } catch (e) {
    const cached = cacheGet<Team>(`team:${info.id}`);
    if (cached) return cached;
    throw e;
  }
}
