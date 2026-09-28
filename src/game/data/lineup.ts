import type { Player, Team } from './types';

export interface GameTeam {
  team: Team;
  lineup: { player: Player; pos: string }[]; // 9 batters in order
  starter: Player;
  bullpen: Player[]; // in the order they'll be used
}

const SLOTS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
const OF = new Set(['LF', 'CF', 'RF', 'OF']);

const hitValue = (p: Player) => p.bat.contact + p.bat.power + p.bat.eye * 0.6;
const pitchValue = (p: Player) => p.pit.stuff + p.pit.control + p.pit.velo;

/** Picks nine regulars by playing time and fills each defensive slot once. */
export function buildLineup(team: Team, rnd: () => number): GameTeam {
  const hitters = team.players.filter((p) => p.isHitter).sort((a, b) => b.pa - a.pa);
  const open = new Set(SLOTS);
  const chosen: { player: Player; pos: string }[] = [];

  const take = (p: Player, pos: string) => {
    open.delete(pos);
    chosen.push({ player: p, pos });
  };
  for (const p of hitters) {
    if (chosen.length === 9) break;
    if (open.has(p.pos)) take(p, p.pos);
    else if (OF.has(p.pos) && [...open].some((s) => OF.has(s)))
      take(p, [...open].find((s) => OF.has(s))!);
    else if (open.has('DH')) take(p, 'DH');
  }
  // Thin roster: anyone left plays wherever there's a gap.
  const pool = [...hitters, ...team.players].filter((p) => !chosen.some((c) => c.player === p));
  while (chosen.length < 9 && pool.length) take(pool.shift()!, [...open][0] ?? 'DH');

  // Batting order: best on-base type with some speed leads off, then the
  // best overall hitters, the rest in descending order.
  const byValue = [...chosen].sort((a, b) => hitValue(b.player) - hitValue(a.player));
  const leadoff = byValue
    .slice(0, 5)
    .sort((a, b) => b.player.bat.eye + b.player.bat.speed - (a.player.bat.eye + a.player.bat.speed))[0];
  const order = [leadoff, ...byValue.filter((x) => x !== leadoff)];

  // Rotation: pick one of the top five by starts, so each game differs.
  const pitchers = team.players.filter((p) => p.isPitcher);
  const rotation = [...pitchers].sort((a, b) => b.gs - a.gs || b.pit.stamina - a.pit.stamina).slice(0, 5);
  const starter = rotation[Math.floor(rnd() * rotation.length)] ?? team.players[0];
  let bullpen = pitchers.filter((p) => p !== starter && p.gs < 5);
  if (bullpen.length === 0) bullpen = pitchers.filter((p) => p !== starter);
  bullpen.sort((a, b) => pitchValue(a) - pitchValue(b)); // save the best for late

  return { team, lineup: order, starter, bullpen };
}

/** Hitters on the roster who aren't in the batting order: the bench. */
export function benchOf(gt: GameTeam): Player[] {
  const inOrder = new Set(gt.lineup.map((l) => l.player.id));
  return gt.team.players.filter((p) => p.isHitter && !inOrder.has(p.id)).sort((a, b) => b.pa - a.pa);
}

/** Every pitcher, starters first: the choices for today's starting pitcher. */
export function startersOf(team: Team): Player[] {
  return team.players
    .filter((p) => p.isPitcher)
    .sort((a, b) => b.gs - a.gs || b.pit.stamina - a.pit.stamina);
}

/** Swap in a new starting pitcher; the bullpen is everyone else, best saved for last. */
export function withStarter(gt: GameTeam, starter: Player): GameTeam {
  const pitchers = gt.team.players.filter((p) => p.isPitcher && p !== starter);
  let bullpen = pitchers.filter((p) => p.gs < 5);
  if (bullpen.length === 0) bullpen = pitchers;
  bullpen.sort((a, b) => pitchValue(a) - pitchValue(b));
  return { ...gt, starter, bullpen };
}

/** Hitters for pickers (derby, be-a-player), sluggers first. */
export function hittersByPower(team: Team): Player[] {
  return team.players.filter((p) => p.isHitter).sort((a, b) => b.bat.power - a.bat.power || b.pa - a.pa);
}

/** Make sure a chosen player is in the batting order (Be a Player), taking the DH's spot. */
export function ensureInLineup(gt: GameTeam, p: Player): GameTeam {
  if (gt.lineup.some((l) => l.player.id === p.id)) return gt;
  const lineup = [...gt.lineup];
  let i = lineup.findIndex((l) => l.pos === 'DH');
  if (i < 0) i = lineup.findIndex((l) => l.pos === p.pos);
  if (i < 0) i = 3;
  lineup[i] = { player: p, pos: lineup[i].pos };
  return { ...gt, lineup };
}
