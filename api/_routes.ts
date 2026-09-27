/**
 * Maps our tiny whitelisted API onto MLB's public Stats API. Shared by the
 * Vercel function (production) and the Vite dev proxy (local), so both
 * accept exactly the same requests. Returns null for anything else, which
 * keeps this from being an open proxy.
 */
export const MLB_ORIGIN = 'https://statsapi.mlb.com';

export function upstreamPath(query: URLSearchParams): string | null {
  const path = query.get('path');
  if (path === 'teams') return '/api/v1/teams?sportId=1';
  if (path === 'roster') {
    const team = query.get('team') ?? '';
    const season = query.get('season') ?? '';
    const type = query.get('type') === '40Man' ? '40Man' : 'active';
    if (!/^\d{3,4}$/.test(team) || !/^\d{4}$/.test(season)) return null;
    // The roster is always today's; `season` picks which year's stats come with it.
    const hydrate = `person(stats(type=[season],season=${season},group=[hitting,pitching]))`;
    return `/api/v1/teams/${team}/roster?rosterType=${type}&hydrate=${encodeURIComponent(hydrate)}`;
  }
  return null;
}
