import type { RetroGame, Scene } from '../RetroGame';
import type { Gfx } from '../render/gfx';
import { C } from '../render/palette';
import { teamColors } from '../data/teamColors';
import type { GameTeam } from '../data/lineup';
import type { DiffConfig } from '../sim/difficulty';
import {
  applyPitch, batting, currentBatter, currentFatigue, fielding, maybeRelieve, newGame, nextHalf, total,
  type GameEvent, type GameState,
} from '../sim/game';
import { PITCH_INFO, PITCH_TYPES, choosePitch, fatigue, isStrike, makePitch } from '../sim/pitch';
import { cpuSwing, reachOf, resolveSwing, timingWindow, type SwingInput } from '../sim/swing';
import { clamp } from '../sim/rng';
import type { Bases, Loc, Pitch, PitchOutcome, PitchType } from '../sim/types';
import { drawBall, drawBatter, drawCatcher, drawDot, drawPitcher, kitFor, type Kit, type PitcherPose } from '../render/sprites';
import { FIELDER_SPOT, basePt, drawField, fieldPt, HOME } from '../render/field';
import { drawHUD, drawLineScore } from '../render/hud';
import { TitleScene } from './TitleScene';

type Phase = 'intro' | 'aim' | 'windup' | 'flight' | 'hitAway' | 'field' | 'result' | 'switch' | 'final';

// Strike zone on screen (behind-the-plate view).
const ZX = 128;
const ZY = 150;
const ZW = 13;
const ZH = 16;
const toScreen = (l: Loc): [number, number] => [ZX + l.x * ZW, ZY - l.y * ZH];
const MOUND: [number, number] = [128, 86];
const CURSOR_SPEED = 2.6; // zone units per second

interface Banner {
  big: string;
  small?: string;
  color: string;
}

export class PlayScene implements Scene {
  private s: GameState;
  private phase: Phase = 'intro';
  private t = 0; // seconds in phase
  private rnd = Math.random;
  private firstPA = true;

  private cursor: Loc = { x: 0, y: 0 };
  private pitchType: PitchType = 'FB';
  private pitch: Pitch | null = null;
  private releaseAt = 0;
  private swingAt: number | null = null;
  private cpuSwingIn: SwingInput | null = null;
  private outcome: PitchOutcome | null = null;
  private event: GameEvent | null = null;
  private banner: Banner | null = null;
  private basesBefore: Bases = [null, null, null];
  private contactAt: [number, number] = [ZX, ZY];
  private catchFlash = 0;

  constructor(
    private game: RetroGame,
    away: GameTeam,
    home: GameTeam,
    private userSide: 'home' | 'away',
    innings: number,
    private diff: DiffConfig,
  ) {
    this.s = newGame(away, home, innings);
    this.startPA();
  }

  private get userBatting() {
    return (this.s.half === 'top') === (this.userSide === 'away');
  }

  private kit(side: 'home' | 'away'): Kit {
    return kitFor(teamColors(this.s[side].gt.team.abbr)[0], side === 'home');
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.t = 0;
  }

  /* ------------------------------------------------------------------ flow */

  private startPA() {
    const reliever = maybeRelieve(this.s);
    const b = currentBatter(this.s);
    if (reliever) {
      this.banner = { big: 'NEW PITCHER', small: `${reliever.name}  ${reliever.pitLine}`, color: C.yellow };
    } else if (this.firstPA) {
      this.banner = { big: 'PLAY BALL!', small: `${b.player.name} LEADS OFF`, color: C.yellow };
    } else {
      this.banner = { big: b.player.name, small: `${b.pos}  ${b.player.batLine}`, color: C.white };
    }
    this.firstPA = false;
    this.cursor = { x: 0, y: 0 };
    this.setPhase('intro');
  }

  private nextPitch() {
    this.pitch = null;
    this.swingAt = null;
    this.cpuSwingIn = null;
    this.outcome = null;
    this.banner = null;
    if (this.userBatting) this.setPhase('windup');
    else this.setPhase('aim');
  }

  private throwPitch(now: number) {
    const f = fielding(this.s);
    const b = currentBatter(this.s).player;
    if (this.userBatting) {
      const { type, target } = choosePitch(this.s.balls, this.s.strikes, this.rnd, this.diff);
      this.pitch = makePitch(f.pitcher, f.pitches, type, target, this.rnd, this.diff);
    } else {
      this.pitch = makePitch(f.pitcher, f.pitches, this.pitchType, { ...this.cursor }, this.rnd, this.diff, this.diff.pitchScatter);
      this.cpuSwingIn = cpuSwing(b, f.pitcher, this.pitch, this.s.balls, this.s.strikes, fatigue(f.pitcher, f.pitches), this.rnd, this.diff);
    }
    this.releaseAt = now;
    this.game.chip.pitch();
    this.setPhase('flight');
  }

  private resolve() {
    const pitch = this.pitch!;
    const batter = currentBatter(this.s).player;
    let outcome: PitchOutcome;
    if (this.userBatting) {
      if (this.swingAt == null) {
        outcome = { kind: isStrike(pitch.loc) ? 'called' : 'ball' };
      } else {
        const W = timingWindow(batter, this.diff);
        const t = (this.swingAt - this.releaseAt - pitch.travelMs) / W;
        const aim = {
          x: this.cursor.x + (pitch.loc.x - this.cursor.x) * this.diff.autoAim,
          y: this.cursor.y + (pitch.loc.y - this.cursor.y) * this.diff.autoAim,
        };
        const r = resolveSwing({ dx: pitch.loc.x - aim.x, dy: pitch.loc.y - aim.y, t }, batter, this.rnd, this.diff.reach);
        outcome = r.kind === 'miss' ? { kind: 'swinging' } : r.kind === 'foul' ? { kind: 'foul' } : r;
      }
    } else if (!this.cpuSwingIn) {
      outcome = { kind: isStrike(pitch.loc) ? 'called' : 'ball' };
    } else {
      const r = resolveSwing(this.cpuSwingIn, batter, this.rnd);
      outcome = r.kind === 'miss' ? { kind: 'swinging' } : r.kind === 'foul' ? { kind: 'foul' } : r;
    }

    this.outcome = outcome;
    this.basesBefore = [...this.s.bases];
    this.contactAt = toScreen(pitch.loc);
    this.event = applyPitch(this.s, outcome, this.rnd);
    const chip = this.game.chip;

    if (outcome.kind === 'inPlay' || outcome.kind === 'foul') {
      chip.crack();
      this.setPhase('hitAway');
      return;
    }
    this.catchFlash = 0.15;
    chip.mitt();
    const ev = this.event;
    if (ev.kind === 'strikeout') {
      chip.out();
      this.banner = { big: ev.text, color: C.orange };
    } else if (ev.kind === 'walk') {
      chip.hit();
      this.banner = { big: 'BALL FOUR', small: ev.runs ? `RUN SCORES!` : 'TAKE YOUR BASE', color: '#38d838' };
    } else if (ev.kind === 'strike') {
      chip.strike();
      this.banner = { big: ev.text === 'STRIKE' ? 'STRIKE!' : 'SWING & MISS', color: C.yellow };
    } else {
      this.banner = { big: 'BALL', color: C.white };
    }
    this.setPhase('result');
  }

  private afterResult() {
    const s = this.s;
    if (s.final) {
      this.finish();
    } else if (s.halfOver) {
      this.setPhase('switch');
    } else if (this.event && this.event.kind !== 'ball' && this.event.kind !== 'strike' && this.event.kind !== 'foul') {
      this.startPA();
    } else {
      this.nextPitch();
    }
  }

  private finish() {
    const userWon = total(this.s[this.userSide]) > total(this.s[this.userSide === 'home' ? 'away' : 'home']);
    if (userWon) this.game.chip.charge();
    else this.game.chip.lose();
    this.setPhase('final');
  }

  private playBanner(ev: GameEvent): Banner {
    const p = ev.play!;
    const runs = ev.runs ? `${ev.runs} RUN${ev.runs > 1 ? 'S' : ''} SCORE${ev.runs > 1 ? '' : 'S'}!` : undefined;
    if (p.type === 'HR') {
      const n = ev.runs;
      return { big: n === 4 ? 'GRAND SLAM!' : 'HOME RUN!', small: `${Math.round(p.dist)} FEET`, color: C.yellow };
    }
    if (p.type === 'OUT') return { big: p.label, small: runs, color: C.orange };
    return { big: p.label, small: runs, color: '#38d838' };
  }

  /* ---------------------------------------------------------------- update */

  update(dt: number, now: number) {
    this.t += dt;
    this.catchFlash = Math.max(0, this.catchFlash - dt);
    const input = this.game.input;
    const chip = this.game.chip;
    const skip = input.pressed('a');

    if (input.pressed('start') && this.phase !== 'final') {
      this.game.paused = true;
      return;
    }

    // Aim cursor: batting eye (Pro/All-Star) or pitch target.
    const canAim =
      (this.userBatting && this.diff.autoAim < 1 && (this.phase === 'windup' || this.phase === 'flight')) ||
      (!this.userBatting && this.phase === 'aim');
    if (canAim) {
      const dx = (input.down('right') ? 1 : 0) - (input.down('left') ? 1 : 0);
      const dy = (input.down('up') ? 1 : 0) - (input.down('down') ? 1 : 0);
      const lim = this.userBatting ? 1.4 : 1.7;
      this.cursor.x = clamp(this.cursor.x + dx * CURSOR_SPEED * dt, -lim, lim);
      this.cursor.y = clamp(this.cursor.y + dy * CURSOR_SPEED * dt, -lim, lim);
    }

    switch (this.phase) {
      case 'intro':
        if (this.t > 1.3 || (skip && this.t > 0.2)) this.nextPitch();
        break;

      case 'aim': {
        if (input.pressed('b')) {
          this.pitchType = PITCH_TYPES[(PITCH_TYPES.indexOf(this.pitchType) + 1) % PITCH_TYPES.length];
          chip.blip();
        }
        if (skip) this.setPhase('windup');
        break;
      }

      case 'windup': {
        const len = this.userBatting ? 0.9 : 0.45;
        if (this.t >= len) this.throwPitch(now);
        break;
      }

      case 'flight': {
        const pitch = this.pitch!;
        const elapsed = now - this.releaseAt;
        const batter = currentBatter(this.s).player;
        if (this.userBatting) {
          if (this.swingAt == null && skip) {
            this.swingAt = input.pressedAt('a');
            chip.swing();
          }
          const late = timingWindow(batter, this.diff) * 1.5;
          if (elapsed >= pitch.travelMs && (this.swingAt != null || elapsed >= pitch.travelMs + late)) this.resolve();
        } else if (elapsed >= pitch.travelMs) {
          this.resolve();
        }
        break;
      }

      case 'hitAway':
        if (this.t >= 0.45) {
          if (this.outcome?.kind === 'foul') {
            chip.foul();
            this.banner = { big: 'FOUL BALL', color: C.white };
            this.setPhase('result');
          } else {
            this.setPhase('field');
          }
        }
        break;

      case 'field': {
        const dur = this.fieldDuration();
        if (this.t >= dur || (skip && this.t > 0.3)) {
          const ev = this.event!;
          this.banner = this.playBanner(ev);
          if (ev.play?.type === 'HR') chip.homer();
          else if (ev.play?.type === 'OUT') chip.out();
          else chip.hit();
          if (ev.runs && ev.play?.type !== 'HR') chip.cheer();
          this.setPhase('result');
        }
        break;
      }

      case 'result': {
        const hold = this.event?.kind === 'play' ? 1.8 : 1.0;
        if (this.t > hold || (skip && this.t > 0.25)) this.afterResult();
        break;
      }

      case 'switch':
        if (this.t > 3 || (skip && this.t > 0.3)) {
          nextHalf(this.s);
          if (this.s.final) this.finish();
          else this.startPA();
        }
        break;

      case 'final':
        if (this.t > 1 && (skip || input.pressed('start'))) this.game.go(new TitleScene(this.game));
        break;
    }
  }

  /* ------------------------------------------------------------ field anim */

  private hang() {
    const p = this.event?.play;
    if (!p) return 1;
    if (p.type === 'HR') return 1.7;
    return { ground: 0.7, line: 0.6, fly: 1.3, pop: 1.3 }[p.flight];
  }

  private fieldDuration() {
    const moves = this.event?.moves ?? [];
    const run = Math.max(0, ...moves.map((m) => runLen(m.from, m.to) * 0.42));
    return Math.max(this.hang(), 0.2 + run) + 0.5;
  }

  /* ---------------------------------------------------------------- render */

  render(g: Gfx, now: number) {
    const showField = this.phase === 'field' || (this.phase === 'result' && this.event?.kind === 'play');
    if (this.phase === 'switch' || this.phase === 'final') {
      this.renderScoreboard(g);
      return;
    }
    if (showField) this.renderField(g);
    else this.renderPlate(g, now);
    drawHUD(g, this.s);
    this.renderBottom(g);
    if (this.banner && (this.phase === 'intro' || this.phase === 'result')) this.renderBanner(g, this.banner);
  }

  private renderPlate(g: Gfx, now: number) {
    const s = this.s;
    const batSide = s.half === 'top' ? 'away' : 'home';
    const fieldSide = batSide === 'home' ? 'away' : 'home';
    const bKit = this.kit(batSide);
    const fKit = this.kit(fieldSide);
    const batter = currentBatter(s).player;
    const pitcher = fielding(s).pitcher;

    // stands and wall
    g.clear(C.crowd);
    for (let y = 2; y < 40; y += 4) {
      for (let x = (y / 4) % 2 ? 2 : 0; x < 256; x += 5) {
        const k = (x * 7 + y * 13) % 5;
        g.rect(x, y, 2, 2, [C.red, C.white, C.blue, C.yellow, C.skin][k]);
      }
    }
    g.rect(0, 40, 256, 8, C.wall);
    g.rect(0, 40, 256, 1, C.yellow);
    for (let y = 48, i = 0; y < 224; i++) {
      const h = 4 + i * 2;
      g.rect(0, y, 256, h, i % 2 ? C.grass : C.grass2);
      y += h;
    }
    // infield
    g.poly([[128, 184], [240, 118], [128, 76], [16, 118]], C.dirt);
    g.poly([[128, 162], [196, 118], [128, 90], [60, 118]], C.grass);
    g.ellipse(MOUND[0], MOUND[1] + 19, 13, 4, C.dirt);
    g.ellipse(128, 176, 40, 10, C.dirt);
    for (const [x, y] of [[226, 117], [128, 76], [30, 117]] as [number, number][]) g.rect(x - 3, y - 1, 6, 3, C.white);
    // runners on base
    const runners: [number, number][] = [[210, 112], [128, 70], [46, 112]];
    s.bases.forEach((r, i) => r && drawDot(g, runners[i][0], runners[i][1], bKit.jersey, bKit.trim));
    // plate and chalk
    g.poly([[120, 174], [136, 174], [136, 177], [128, 181], [120, 177]], C.white);
    g.frame(82, 160, 32, 26, C.white);
    g.frame(142, 160, 32, 26, C.white);

    // pitcher pose
    let pose: PitcherPose = 'set';
    if (this.phase === 'windup') {
      const len = this.userBatting ? 0.9 : 0.45;
      const f = this.t / len;
      pose = f < 0.4 ? 'set' : f < 0.85 ? 'kick' : 'release';
    } else if (this.phase === 'flight' && now - this.releaseAt < 250) pose = 'release';
    drawPitcher(g, MOUND[0], MOUND[1], pitcher.throws, fKit, pose);

    // strike zone
    const zoneColor = this.userBatting ? 'rgba(252,252,252,0.35)' : 'rgba(252,252,252,0.6)';
    g.frame(ZX - ZW, ZY - ZH, ZW * 2 + 1, ZH * 2 + 1, zoneColor);

    // ball in flight
    let ballPos: [number, number] | null = null;
    let ballR = 1;
    if (this.phase === 'flight' && this.pitch) {
      const p = this.pitch;
      const f = clamp((now - this.releaseAt) / p.travelMs, 0, 1);
      const e = Math.pow(f, 1.35);
      const rel: [number, number] = [MOUND[0] + (pitcher.throws === 'L' ? -4 : 4), MOUND[1] + 4];
      const aim = toScreen({ x: p.loc.x - p.brk.x, y: p.loc.y - p.brk.y });
      ballPos = [
        rel[0] + (aim[0] - rel[0]) * e + p.brk.x * ZW * f * f,
        rel[1] + (aim[1] - rel[1]) * e - p.brk.y * ZH * f * f,
      ];
      ballR = 1 + 2.5 * e;
    } else if (this.phase === 'hitAway') {
      const f = this.t / 0.45;
      const foul = this.outcome?.kind === 'foul';
      const spray = this.outcome?.kind === 'inPlay' ? this.outcome.ball.spray : 0;
      const [cx, cy] = this.contactAt;
      ballPos = foul ? [cx + f * 90 * (spray >= 0 ? 1 : -1), cy - f * 160] : [cx + f * spray * 3, cy - f * 150];
      ballR = Math.max(1, 3 - f * 2.5);
    }

    // batter
    let swing = -1;
    if (this.userBatting && this.swingAt != null) swing = (now - this.swingAt) / 200;
    if (!this.userBatting && this.cpuSwingIn && this.pitch && this.phase !== 'windup' && this.phase !== 'aim') {
      const tW = timingWindow(batter, this.diff);
      const start = this.releaseAt + this.pitch.travelMs + this.cpuSwingIn.t * tW - 70;
      if (now >= start) swing = (now - start) / 200;
    }
    if (this.phase === 'hitAway' || this.phase === 'result') swing = swing < 0 ? -1 : 1;
    const bx = batter.bats === 'L' ? ZX + 18 : ZX - 18 - 28;
    drawBatter(g, bx, 122, batter.bats, bKit, swing);

    // catcher with mitt at the target
    const mittLoc = !this.userBatting && this.phase === 'aim' ? this.cursor : this.pitch ? (this.phase === 'flight' ? this.pitch.target : this.pitch.loc) : { x: 0, y: 0 };
    drawCatcher(g, 128, 180, fKit, toScreen(mittLoc));

    if (ballPos) drawBall(g, ballPos[0], ballPos[1], ballR);
    if (this.catchFlash > 0 && this.pitch) {
      const [x, y] = toScreen(this.pitch.loc);
      g.frame(x - 6, y - 6, 13, 13, C.white);
    }

    // aim cursor
    if (this.userBatting && this.diff.autoAim < 1 && (this.phase === 'windup' || this.phase === 'flight')) {
      const [cx, cy] = toScreen(this.cursor);
      const r = reachOf(batter, this.diff) * ZH * (1 - this.diff.autoAim * 0.5);
      g.frame(cx - r * 1.4, cy - r, r * 2.8, r * 2, C.yellow);
      g.rect(cx, cy, 1, 1, C.yellow);
    }
    if (!this.userBatting && this.phase === 'aim') {
      const [cx, cy] = toScreen(this.cursor);
      if (Math.floor(now / 200) % 2 === 0) g.frame(cx - 5, cy - 5, 11, 11, C.yellow);
      this.renderPitchMenu(g);
    }
  }

  private renderPitchMenu(g: Gfx) {
    const f = fielding(this.s);
    const fat = currentFatigue(this.s);
    g.box(198, 96, 56, 40);
    PITCH_TYPES.forEach((t, i) => {
      const mph = Math.round(88 + f.pitcher.pit.velo * 0.9 + PITCH_INFO[t].dv - fat * 3);
      const on = t === this.pitchType;
      g.text(`${on ? '>' : ' '}${t} ${mph}`, 202, 101 + i * 11, on ? C.yellow : C.light);
    });
  }

  private renderField(g: Gfx) {
    drawField(g);
    const s = this.s;
    const ev = this.event!;
    const play = ev.play!;
    const t = this.phase === 'field' ? this.t : 99;
    const hang = this.hang();
    const f = clamp(t / hang, 0, 1);
    const land = fieldPt(play.dist, play.spray);
    // The half doesn't flip until nextHalf(), so s.half is still the half this play happened in.
    const fieldSide = s.half === 'top' ? 'home' : 'away';
    const fKit = this.kit(fieldSide);
    const bKit = this.kit(fieldSide === 'home' ? 'away' : 'home');

    // fielders; the one making the play runs to the ball
    for (const [pos, [ft, spray]] of Object.entries(FIELDER_SPOT)) {
      let [x, y] = pos === 'C' ? [HOME[0], HOME[1] + 8] : fieldPt(ft, spray);
      if (pos === play.fielder) {
        const reach = play.type === 'OUT' ? f : clamp(t / (hang + 0.5), 0, 1) * 0.85;
        x += (land[0] - x) * reach;
        y += (land[1] - y) * reach;
      }
      drawDot(g, x, y, fKit.jersey, fKit.trim);
    }

    // runners (including the batter) move along the base paths
    for (const m of ev.moves) {
      const len = runLen(m.from, m.to);
      const u = clamp((t - 0.15) / (Math.max(1, len) * 0.42), 0, 1);
      if (m.to === -1 && u >= 1) continue; // put out: disappears
      const pos = alongBases(m.from, m.from + u * len);
      drawDot(g, pos[0], pos[1], bKit.jersey, bKit.trim);
    }
    // runners who didn't move stay put
    this.basesBefore.forEach((r, i) => {
      if (r && !ev.moves.some((m) => m.player === r)) {
        const [x, y] = basePt(i + 1);
        drawDot(g, x, y, bKit.jersey, bKit.trim);
      }
    });

    // the ball, with a shadow showing its height
    const arc = { ground: 0, line: 10, fly: 40, pop: 55 }[play.flight] * (play.type === 'HR' ? 1.3 : 1);
    const bx = HOME[0] + (land[0] - HOME[0]) * f;
    const by = HOME[1] + (land[1] - HOME[1]) * f;
    const h = Math.sin(Math.PI * f) * arc;
    if (f < 1 || play.type !== 'OUT') {
      g.rect(bx - 1, by, 3, 2, C.grassDark);
      drawBall(g, bx, by - h, 1.5 + h / 30);
    }
  }

  private renderBottom(g: Gfx) {
    const s = this.s;
    const b = currentBatter(s);
    const f = fielding(s);
    g.rect(0, 206, 256, 18, C.black);
    const bat = this.phase === 'result' || this.phase === 'field' ? null : b;
    if (bat) {
      g.text(`${bat.player.number ? '#' + bat.player.number + ' ' : ''}${bat.player.name}`.slice(0, 26), 3, 208, C.white);
      g.rtext(bat.player.batLine, 253, 208, C.light);
    } else {
      g.text(`${batting(s).gt.team.abbr} AT BAT`, 3, 208, C.light);
    }
    const hint =
      this.phase === 'aim' ? 'ARROWS AIM  B PITCH  A THROW' :
      this.userBatting && (this.phase === 'windup' || this.phase === 'flight')
        ? this.diff.autoAim < 1 ? 'ARROWS AIM   A SWING' : 'A = SWING!'
        : `P ${f.pitcher.name}  ${f.pitches}P`;
    g.text(hint.slice(0, 42), 3, 216, this.phase === 'aim' || hint.startsWith('A') || hint.startsWith('ARROWS') ? C.yellow : C.light);
  }

  private renderBanner(g: Gfx, b: Banner) {
    const bigScale = b.big.length > 17 ? 1 : 2;
    const w = Math.min(248, Math.max(b.big.length * 6 * bigScale, (b.small?.length ?? 0) * 6) + 20);
    const h = b.small ? 36 : 24;
    const x = Math.round((256 - w) / 2);
    const y = 42; // above the pitcher's head
    g.box(x, y, w, h);
    g.ctext(b.big, y + (bigScale === 2 ? 6 : 9), b.color, bigScale, false);
    if (b.small) g.ctext(b.small, y + 24, C.white, 1, false);
  }

  private renderScoreboard(g: Gfx) {
    const s = this.s;
    g.clear(C.navy);
    g.rect(0, 0, 256, 40, C.wall);
    if (this.phase === 'final') {
      const u = total(s[this.userSide]);
      const o = total(s[this.userSide === 'home' ? 'away' : 'home']);
      g.ctext('FINAL', 12, C.white, 2);
      drawLineScore(g, s, 60);
      g.ctext(u > o ? 'YOU WIN!' : 'YOU LOSE', 112, u > o ? C.yellow : C.orange, 3);
      if (this.t > 1 && Math.floor(this.t * 2) % 2 === 0) g.ctext('PRESS A FOR NEW GAME', 180, C.white);
    } else {
      const label = s.half === 'top' ? `MIDDLE OF THE ${ordinal(s.inning)}` : `END OF THE ${ordinal(s.inning)}`;
      g.ctext(label, 16, C.white);
      drawLineScore(g, s, 60);
      const nextBat = s.half === 'top' ? s.home : s.away;
      const userNext = (s.half === 'top') === (this.userSide === 'home');
      g.ctext(userNext ? 'YOUR TURN TO BAT' : 'YOUR TURN TO PITCH', 120, C.yellow);
      g.ctext(`${nextBat.gt.team.name.toUpperCase()} UP`, 134, C.light);
      g.ctext('PRESS A', 180, C.white);
    }
  }
}

/* ------------------------------------------------------------ base paths */

const runLen = (from: number, to: number) => (to === -1 ? 1 : to - from);

/** Point on the base path at fractional base u (0 = home, 1 = first … 4 = home). */
function alongBases(_from: number, u: number): [number, number] {
  const i = Math.min(3, Math.floor(u));
  const f = u - i;
  const a = basePt(i);
  const b = basePt(i + 1);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

function ordinal(n: number) {
  const s = ['TH', 'ST', 'ND', 'RD'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
