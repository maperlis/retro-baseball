import type { Player, Team } from './types';
import { seededRandom } from '../sim/rng';

/**
 * Two made-up clubs, used only when the MLB feed has never been reached on
 * this device (first launch with no signal). Everything is seeded, so the
 * rosters are identical every time.
 */
const FIRST = ['Ace', 'Buck', 'Chip', 'Dusty', 'Eddie', 'Flash', 'Gus', 'Hank', 'Iggy', 'Jax',
  'Kip', 'Lefty', 'Moe', 'Nate', 'Otis', 'Pip', 'Red', 'Sal', 'Tex', 'Vic'];
const LAST = ['Bitwell', 'Cartridge', 'Dotson', 'Famicom', 'Gridley', 'Hexler', 'Joypad',
  'Kilobyte', 'Lowres', 'Mapper', 'Nybble', 'Octet', 'Pixley', 'Raster', 'Sprite', 'Tilemap',
  'Vector', 'Waveform', 'Bytesmith', 'Chiptune'];
const HIT_POS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'C', '2B', 'OF', '1B', 'OF'];

function makeTeam(id: number, abbr: string, name: string, short: string, seed: string): Team {
  const rnd = seededRandom(seed);
  const r = (lo: number, hi: number) => Math.round((lo + rnd() * (hi - lo)) * 10) / 10;
  const players: Player[] = [];
  for (let i = 0; i < 26; i++) {
    const pitcher = i >= HIT_POS.length;
    const first = FIRST[Math.floor(rnd() * FIRST.length)];
    const last = LAST[(i * 7 + Math.abs(id) * 3) % LAST.length];
    const starter = pitcher && i < HIT_POS.length + 5;
    players.push({
      id: id * 100 + i,
      name: `${first[0]}. ${last.toUpperCase()}`,
      fullName: `${first} ${last}`,
      number: String(((i * 11 + Math.abs(id) * 5) % 70) + 1),
      pos: pitcher ? 'P' : HIT_POS[i],
      bats: rnd() < 0.35 ? 'L' : 'R',
      throws: rnd() < 0.3 ? 'L' : 'R',
      isPitcher: pitcher,
      isHitter: !pitcher,
      bat: pitcher
        ? { contact: 1.5, power: 1, eye: 1, speed: 2 }
        : { contact: r(3, 8), power: r(2, 9), eye: r(3, 8), speed: r(2, 9) },
      pit: { velo: r(3, 8), stuff: r(3, 8), control: r(3, 8), stamina: starter ? r(6, 9) : r(1, 3) },
      batLine: pitcher ? 'NO STATS' : `.${Math.round(230 + rnd() * 80)} ${Math.round(rnd() * 35)}HR`,
      pitLine: pitcher ? `${(2.8 + rnd() * 2).toFixed(2)} ERA` : 'NO STATS',
      pa: pitcher ? 0 : Math.round(300 + rnd() * 350),
      gs: starter ? 25 - (i - HIT_POS.length) : 0,
      ip: pitcher ? 60 + rnd() * 100 : 0,
    });
  }
  return { id, abbr, name, short, players };
}

export const FALLBACK_TEAMS: Team[] = [
  makeTeam(-1, 'PXL', 'Pixel City Pilots', 'Pilots', 'pilots'),
  makeTeam(-2, 'RBR', 'Retro Bay Rockets', 'Rockets', 'rockets'),
];
