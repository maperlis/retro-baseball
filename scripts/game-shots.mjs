/**
 * Plays the retro game in Chromium with a stubbed MLB feed and captures
 * each screen. Checks for console errors and horizontal overflow.
 *
 *   npm run build && npm run preview -- --port 4173 &
 *   node scripts/game-shots.mjs ./shots [baseUrl]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? './shots';
const base = process.argv[3] ?? 'http://localhost:4173';
mkdirSync(out, { recursive: true });

const TEAMS = [
  [147, 'NYY', 'New York Yankees', 'Yankees'], [111, 'BOS', 'Boston Red Sox', 'Red Sox'],
  [119, 'LAD', 'Los Angeles Dodgers', 'Dodgers'], [121, 'NYM', 'New York Mets', 'Mets'],
  [112, 'CHC', 'Chicago Cubs', 'Cubs'], [137, 'SF', 'San Francisco Giants', 'Giants'],
];
const teamsJson = {
  teams: TEAMS.map(([id, abbreviation, name, teamName]) => ({ id, abbreviation, name, teamName, sport: { id: 1 }, active: true })),
};
const POS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'C', 'OF', 'IF', 'OF'];
function rosterJson(teamId) {
  const roster = [];
  for (let i = 0; i < 26; i++) {
    const pitcher = i >= POS.length;
    const stats = pitcher
      ? [{ group: { displayName: 'pitching' }, splits: [{ stat: { inningsPitched: String(60 + i * 5), earnedRuns: 25 + i, strikeOuts: 70 + i * 5, baseOnBalls: 25, hits: 60 + i * 3, gamesStarted: i < POS.length + 5 ? 28 : 0, gamesPitched: 30 } }] }]
      : [{ group: { displayName: 'hitting' }, splits: [{ stat: { plateAppearances: 600 - i * 20, atBats: 540 - i * 20, hits: 150 - i * 3, doubles: 25, triples: i % 4, homeRuns: 35 - i * 2, baseOnBalls: 55, strikeOuts: 120, stolenBases: i * 2 } }] }];
    roster.push({
      jerseyNumber: String(i + 1),
      position: { abbreviation: pitcher ? 'P' : POS[i], type: pitcher ? 'Pitcher' : 'Hitter' },
      person: {
        id: teamId * 100 + i, fullName: `Player${i} Last${String.fromCharCode(65 + i)}son`, firstName: `Player${i}`,
        lastName: `Last${String.fromCharCode(65 + i)}son`, batSide: { code: i % 3 ? 'R' : 'L' }, pitchHand: { code: i % 4 ? 'R' : 'L' }, stats,
      },
    });
  }
  return { roster };
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

async function run(name, viewport, touch) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('**/api/mlb?**', (route) => {
    const q = new URL(route.request().url()).searchParams;
    const body = q.get('path') === 'teams' ? teamsJson : rosterJson(Number(q.get('team')));
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });

  const key = async (k, wait = 120) => { await page.keyboard.press(k); await page.waitForTimeout(wait); };
  const shot = (n) => page.screenshot({ path: `${out}/game-${name}-${n}.png` });

  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await shot('1-title');
  await key('Enter', 300);
  await key('ArrowRight');
  await shot('2-teams');
  await key('KeyZ', 300); // pick user team
  await key('KeyZ', 300); // pick opponent
  await shot('3-setup');
  await key('KeyZ', 1200); // PLAY BALL (cursor starts there)
  await shot('4-intro');

  // Play pitches: pitch or swing on a rhythm, capturing a few moments.
  let n = 0;
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press(i % 3 === 0 ? 'KeyX' : 'KeyZ');
    await page.waitForTimeout(i % 5 === 0 ? 550 : 900);
    if (i % 8 === 3 && n < 5) await shot(`5-play-${n++}`);
  }
  await shot('6-later');

  // Keep playing until a ball is put in play and the top-down field view shows.
  // In that view the foul ground at (20,150) is crowd-coloured; at the plate it's grass.
  const inFieldView = () =>
    page.evaluate(() => {
      const c = document.querySelector('canvas');
      const [r, g, b] = c.getContext('2d').getImageData(20, 150, 1, 1).data;
      return r === 0x20 && g === 0x20 && b === 0x40;
    });
  let sawField = false;
  for (let i = 0; i < 300 && !sawField; i++) {
    await page.keyboard.press('KeyZ');
    for (let k = 0; k < 4 && !sawField; k++) {
      await page.waitForTimeout(100);
      if (await inFieldView()) sawField = true;
    }
  }
  if (sawField) {
    await page.waitForTimeout(500);
    await shot('7-field');
    await page.waitForTimeout(1500);
    await shot('8-field-result');
  }
  console.log(`[${name}] reached field view: ${sawField}`);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  const canvasBox = await page.locator('canvas').boundingBox();
  console.log(`[${name}] canvas ${Math.round(canvasBox.width)}x${Math.round(canvasBox.height)}, overflow=${overflow}`);
  console.log(`[${name}] ${errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors'}`);
  await page.close();
}

await run('desktop', { width: 1280, height: 900 }, false);
await run('phone', { width: 390, height: 844 }, true);
await run('phone-land', { width: 844, height: 390 }, true);
await browser.close();
