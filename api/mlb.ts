import { MLB_ORIGIN, upstreamPath } from './_routes';

export const config = { runtime: 'edge' };

/**
 * GET /api/mlb?path=teams
 * GET /api/mlb?path=roster&team=147&season=2026[&type=40Man]
 *
 * Cached at Vercel's edge for 6 hours, so rosters stay current without
 * every game hitting MLB directly.
 */
export default async function handler(req: Request): Promise<Response> {
  const upstream = upstreamPath(new URL(req.url).searchParams);
  if (!upstream) return new Response('Bad request', { status: 400 });

  const res = await fetch(MLB_ORIGIN + upstream, { headers: { accept: 'application/json' } });
  if (!res.ok) return new Response('Upstream error', { status: 502 });
  return new Response(await res.text(), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, s-maxage=21600, stale-while-revalidate=86400',
    },
  });
}
