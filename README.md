# Retro Baseball

An 8-bit baseball game with **real, current MLB rosters**. Pick any two clubs
and play an exhibition: you bat and pitch, and fielding and baserunning are
simulated. It runs in the browser, installs to a phone's home screen, and works
offline.

## Game modes

| Mode | What it is |
| --- | --- |
| 1 Player | You vs. the computer. You bat and pitch. |
| 2 Players | Two people on one device take turns batting and pitching. |
| Home Run Derby | Pick a hitter. Batting-practice pitches, 10 outs; any swing that isn't a homer is an out. Your record is saved. |
| Be a Player | Pick one hitter. The rest of the game plays itself, and you bat every time your player comes up. You get a box-score line at the end. |
| Tournament | An 8-team single-elimination bracket. You play your games and the others are simulated. Progress is saved, so you can quit and come back. |

**Set your lineup:** before a game, move batters around the order (press A on
one, then A on another to swap), bring in a bench player (LEFT/RIGHT on a
batter), and choose your starting pitcher (LEFT/RIGHT on the SP row).

## How to play

1. Choose **1 PLAYER** (vs. the computer) or **2 PLAYERS**, then pick teams.
2. Choose a **level** and **innings** (3, 6 or 9), then **PLAY BALL!**
3. **Batting:** tap **A** to swing as the pitch reaches the plate. Timing is
   everything. On Pro and All-Star, move the yellow aim box over the ball with
   the D-pad.
4. **Pitching:** move the target with the D-pad, press **B** to change pitch
   (fastball / curve / changeup), and press **A** to throw.

| Level | What it's like |
| --- | --- |
| Rookie | Slow pitches, a wide timing window, and the ball glows when it's time to swing. The game aims for you. |
| Pro | Real speed, aim assist, and the same swing glow. |
| All-Star | Fast pitches, you aim yourself, and computer hitters are sharper. |

**Controls:** on a phone, use the on-screen D-pad and A/B buttons (portrait or
landscape). On a keyboard, use the arrows, `Z`/`Space` = A, `X` = B,
`Enter` = pause and `M` = sound.

### Two players

Choose **2 PLAYERS** on the title screen. Player 1 and Player 2 each pick a
team, and the two of you take turns batting and pitching.

- **Same phone:** the on-screen buttons control whoever's turn it is, so the
  pitcher aims and throws, then hands off to the batter to swing.
- **Keyboard:** Player 1 uses `W A S D` + `F` (A) / `G` (B), and Player 2 uses
  the arrows + `K` (A) / `L` (B). Each player's keys only work on their turn.

## Real MLB data

- Rosters and this season's stats come from MLB's public Stats API through
  `api/mlb.ts`, a Vercel edge function. It only accepts a fixed set of requests
  and caches results for 6 hours. Early in the season, last year's stats are
  folded in.
- **Stats drive ratings.** Hitters get contact (AVG, K%), power (ISO), eye
  (BB%) and speed (SB, triples). Pitchers get velocity and stuff (K/9, hits,
  ERA), control (BB/9) and stamina (innings per start). Small samples are pulled
  toward average.
- The title screen says **LIVE MLB ROSTERS**, **SAVED ROSTERS (OFFLINE)** (the
  last copy saved on the device), or **OFFLINE - DEMO TEAMS** (a first launch
  with no signal).

Real team and player names are fine for private use. Publishing the game
publicly or commercially would need MLB/MLBPA licensing.

## Running it locally

```bash
npm install
npm run dev      # http://localhost:5173 (proxies /api/mlb to MLB)
npm test         # rules, ratings, feed parsing, 200-game balance check
npm run build    # production build into dist/
```

`npm run shots` plays the game in Chromium against a stubbed MLB feed and saves
screenshots. It needs `npm run preview -- --port 4173` running first.

## Deploying to Vercel

1. Go to [vercel.com](https://vercel.com), then **Add New → Project**.
2. **Import** this repository and keep the defaults. Vercel detects Vite and
   the `api/` function.
3. Click **Deploy**. Every push to `main` redeploys after that.

To install it on a phone, open the URL, then Share → **Add to Home Screen**.

## Project layout

```
api/                 Vercel edge function + whitelisted MLB routes
src/game/
  data/              MLB feed parsing, stats -> ratings, lineups, demo teams
  sim/               pure game rules: pitch, swing, batted ball, game state
  render/            pixel font, drawing helpers, sprites, field, HUD
  engine/            input (keyboard + touch) and chiptune audio
  scenes/            title, team select, setup, play
  GameApp.tsx        React shell: canvas + on-screen controls
scripts/game-shots.mjs  automated play-through with screenshots
```
