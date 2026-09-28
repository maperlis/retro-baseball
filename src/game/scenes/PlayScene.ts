import type { RetroGame, Scene } from '../RetroGame';
import type { Gfx } from '../render/gfx';
import { C } from '../render/palette';
import { teamColors } from '../data/teamColors';
import type { GameTeam } from '../data/lineup';
import type { Player } from '../data/types';
import type { DiffConfig } from '../sim/difficulty';
import {
  applyPitch, batting, cpuPitch, currentBatter, currentFatigue, fielding, maybeRelieve, newGame, nextHalf, total,
  type GameEvent, type GameState,
} from '../sim/game';
import { PITCH_INFO, PITCH_TYPES, choosePitch, fatigue, isStrike, makePitch } from '../sim/pitch';
import { cpuSwing, reachOf, resolveSwing, timingWindow, type SwingInput } from '../sim/swing';
import { clamp } from '../sim/rng';
import { resolvePlay } from '../sim/outcome';
import type { Bases, Loc, Pitch, PitchOutcome, PitchType } from '../sim/types';
import { drawBall, drawBatter, drawCatcher, drawDot, drawPitcher, kitFor, type Kit, type PitcherPose } from '../render/sprites';
import { FIELDER_SPOT, basePt, drawField, fieldPt, HOME } from '../render/field';
import { drawHUD, drawLineScore } from '../render/hud';
import { TitleScene } from './TitleScene';
import type { Who } from '../engine/input';

type Phase = 'intro' | 'sim' | 'aim' | 'windup' | 'flight' | 'hitAway' | 'field' | 'result' | 'switch' | 'final';

// Strike zone on screen (behind-the-plate view).
const ZX = 128;
const ZY = 150;
const ZW = 13;
const ZH = 16;
const toScreen = (l: Loc): [number, number] => [ZX + l.x * ZW, ZY - l.y * ZH];
const MOUND: [number, number] = [128, 86];
const CURSOR_SPEED = 2.6; // zone units per second

/** 0 = computer, 1 = player 1, 2 = player 2. */
export type Controller = 0 | 1 | 2;

export interface PlayOptions {
  away: GameTeam;
  home: GameTeam;
  /** Who controls each team: 0 = computer, 1 = player 1, 2 = player 2. */
  ctl: Record<'home' | 'away', Controller>;
  innings: number;
  diff: DiffConfig;
  /** Home Run Derby: this hitter swings until they make `outs` outs. */
  derby?: { hitter: Player; outs: number };
  /** Be a Player: you only bat when this player is up; everything else is simulated. */
  hero?: { player: Player; side: 'home' | 'away' };
  /** Called when the finished game is dismissed (defaults to the title screen). */
  onDone?: (s: GameState) => void;
}

const DERBY_KEY = 'retro-ball:derby-best';

/** The batting-practice pitcher for the derby: slow, and always around the plate. */
function coach(): Player {
  return {
    id: -99, name: 'COACH', fullName: 'Coach', number: '', pos: 'P', bats: 'R', throws: 'R',
    isPitcher: true, isHitter: false,
    bat: { contact: 1, power: 1, eye: 1, speed: 1 }, pit: { velo: 1, stuff: 1, control: 10, stamina: 10 },
    batLine: '', pitLine: 'BATTING PRACTICE', pa: 0, gs: 0, ip: 0,
  };
}

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

  private cursor: Loc = { x: 0, y: 0 }; // batter's aim
  private target: Loc = { x: 0, y: 0 }; // pitcher's target
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

  private ctl: Record<'home' | 'away', Controller>;
  private diff: DiffConfig;
  private derby: PlayOptions['derby'];
  private hero: PlayOptions['hero'];
  private derbyHR = 0;
  private derbyOuts = 0;
  private derbyLong = 0;
  private derbyRecord: { hrs: number; name: string } | null = null;
  private derbyNewRecord = false;
  private simNotes: string[] = [];
  private heroLine = { ab: 0, h: 0, hr: 0, rbi: 0, bb: 0 };

  constructor(private game: RetroGame, private opts: PlayOptions) {
    this.ctl = opts.ctl;
    this.diff = opts.diff;
    this.derby = opts.derby;
    this.hero = opts.hero;
    if (this.derby) {
      // The hitter bats every time; the home side is the coach on the mound.
      const hitter = this.derby.hitter;
      const bats: GameTeam = { ...opts.away, lineup: Array.from({ length: 9 }, () => ({ player: hitter, pos: 'DH' })) };
      const pitches: GameTeam = { ...opts.home, starter: coach(), bullpen: [] };
      this.s = newGame(bats, pitches, 99);
      try {
        this.derbyRecord = JSON.parse(localStorage.getItem(DERBY_KEY) ?? 'null');
      } catch {
        /* no saved record */
      }
    } else {
      this.s = newGame(opts.away, opts.home, opts.innings);
    }
    this.startPA();
  }

  private get batSide(): 'home' | 'away' {
    return this.s.half === 'top' ? 'away' : 'home';
  }

  private get pitchSide(): 'home' | 'away' {
    return this.s.half === 'top' ? 'home' : 'away';
  }

  /** The player number at the plate (0 = computer). */
  private get batterCtl() {
    return this.ctl[this.batSide];
  }

  private get pitcherCtl() {
    return this.ctl[this.pitchSide];
  }

  private get humanBats() {
    return this.batterCtl !== 0 || this.heroUp();
  }

  /** Be a Player: is it your player's turn at the plate? */
  private heroUp(): boolean {
    return !!this.hero && this.batSide === this.hero.side && currentBatter(this.s).player.id === this.hero.player.id;
  }

  private get humanPitches() {
    return this.pitcherCtl !== 0;
  }

  private get twoPlayer() {
    return this.ctl.home !== 0 && this.ctl.away !== 0;
  }

  /** Whose buttons to read. In one-player mode anyone's keys work. */
  private who(c: Controller): Who {
    return this.twoPlayer && c !== 0 ? c : undefined;
  }

  private get windupLen() {
    return this.humanBats ? 0.9 : 0.45;
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
    if (this.hero && !this.heroUp()) {
      this.simNotes = this.simulateUntilHero();
      if (this.s.final) this.finish();
      else this.setPhase('sim');
      return;
    }
    this.introPA();
  }

  /** Be a Player: play everything out instantly until your player is up. */
  private simulateUntilHero(): string[] {
    const notes: string[] = [];
    for (let guard = 0; guard < 4000 && !this.s.final; guard++) {
      if (this.s.halfOver) {
        nextHalf(this.s);
        continue;
      }
      if (this.heroUp()) break;
      if (this.s.balls === 0 && this.s.strikes === 0) maybeRelieve(this.s);
      const abbr = batting(this.s).gt.team.abbr;
      const who = currentBatter(this.s).player.name;
      const { outcome } = cpuPitch(this.s, this.rnd, this.diff);
      const ev = applyPitch(this.s, outcome, this.rnd);
      if (ev.runs > 0 || ev.play?.type === 'HR') {
        notes.push(`${abbr} ${who}: ${ev.play ? ev.play.label : ev.text}${ev.runs ? ` +${ev.runs}` : ''}`);
      }
    }
    return notes.slice(-6);
  }

  private introPA() {
    if (this.derby) {
      this.banner = { big: 'HOME RUN DERBY', small: `${this.derby.outs} OUTS - SWING AWAY!`, color: C.yellow };
      this.setPhase('intro');
      return;
    }
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
    this.target = { x: 0, y: 0 };
    this.setPhase('intro');
  }

  private nextPitch() {
    this.pitch = null;
    this.swingAt = null;
    this.cpuSwingIn = null;
    this.outcome = null;
    this.banner = null;
    this.setPhase(this.humanPitches ? 'aim' : 'windup');
  }

  private throwPitch(now: number) {
    const f = fielding(this.s);
    const b = currentBatter(this.s).player;
    if (this.derby) {
      const target = { x: (this.rnd() - 0.5) * 0.9, y: (this.rnd() - 0.5) * 0.9 };
      const p = makePitch(f.pitcher, 0, 'FB', target, this.rnd, this.diff);
      this.pitch = { ...p, speed: 72, travelMs: p.travelMs * 1.25 };
    } else if (this.humanPitches) {
      this.pitch = makePitch(f.pitcher, f.pitches, this.pitchType, { ...this.target }, this.rnd, this.diff, this.diff.pitchScatter);
    } else {
      const { type, target } = choosePitch(this.s.balls, this.s.strikes, this.rnd, this.diff);
      this.pitch = makePitch(f.pitcher, f.pitches, type, target, this.rnd, this.diff);
    }
    if (!this.humanBats) {
      this.cpuSwingIn = cpuSwing(b, f.pitcher, this.pitch, this.s.balls, this.s.strikes, fatigue(f.pitcher, f.pitches), this.rnd, this.diff);
    }
    this.releaseAt = now;
    this.game.chip.pitch();
    this.setPhase('flight');
  }

  private resolve() {
    if (this.derby) return this.resolveDerby();
    const pitch = this.pitch!;
    const batter = currentBatter(this.s).player;
    const heroAB = this.heroUp();
    let outcome: PitchOutcome;
    if (this.humanBats) {
      outcome = this.humanSwing();
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
    if (heroAB) this.recordHero(this.event);

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

  /** Your swing's result: the swing input for a human batter, shared by game and derby. */
  private humanSwing(): PitchOutcome {
    const pitch = this.pitch!;
    const batter = currentBatter(this.s).player;
    if (this.swingAt == null) return { kind: isStrike(pitch.loc) ? 'called' : 'ball' };
    const W = timingWindow(batter, this.diff);
    const t = (this.swingAt - this.releaseAt - pitch.travelMs) / W;
    const aim = {
      x: this.cursor.x + (pitch.loc.x - this.cursor.x) * this.diff.autoAim,
      y: this.cursor.y + (pitch.loc.y - this.cursor.y) * this.diff.autoAim,
    };
    const r = resolveSwing({ dx: pitch.loc.x - aim.x, dy: pitch.loc.y - aim.y, t }, batter, this.rnd, this.diff);
    return r.kind === 'miss' ? { kind: 'swinging' } : r.kind === 'foul' ? { kind: 'foul' } : r;
  }

  /** Derby: any swing that isn't a home run is an out. Takes are free. */
  private resolveDerby() {
    const chip = this.game.chip;
    const outcome = this.humanSwing();
    this.outcome = outcome;
    this.basesBefore = [null, null, null];
    this.contactAt = toScreen(this.pitch!.loc);
    if (this.swingAt == null) {
      this.event = null;
      this.catchFlash = 0.15;
      chip.mitt();
      this.banner = { big: 'TAKE', small: 'WAIT FOR YOUR PITCH', color: C.white };
      this.setPhase('result');
      return;
    }
    if (outcome.kind !== 'inPlay') {
      this.derbyOuts++;
      this.event = null;
      chip.out();
      this.banner = { big: outcome.kind === 'foul' ? 'FOUL - OUT' : 'MISS - OUT', small: this.derbyOutsLeft(), color: C.orange };
      this.setPhase('result');
      return;
    }
    const play = resolvePlay(outcome.ball, this.derby!.hitter, [null, null, null], 0, this.rnd);
    if (play.type === 'HR') {
      this.derbyHR++;
      this.derbyLong = Math.max(this.derbyLong, Math.round(play.dist));
    } else {
      this.derbyOuts++;
    }
    this.event = { kind: 'play', text: play.label, play, moves: play.moves, runs: 0 };
    chip.crack();
    this.setPhase('hitAway');
  }

  private derbyOutsLeft() {
    const left = this.derby!.outs - this.derbyOuts;
    return left > 0 ? `${left} OUT${left === 1 ? '' : 'S'} LEFT` : 'LAST OUT';
  }

  private recordHero(ev: GameEvent) {
    const h = this.heroLine;
    if (ev.kind === 'walk') h.bb++;
    else if (ev.kind === 'strikeout') h.ab++;
    else if (ev.kind === 'play' && ev.play) {
      if (ev.play.label !== 'SAC FLY') h.ab++;
      if (['1B', '2B', '3B', 'HR'].includes(ev.play.type)) h.h++;
      if (ev.play.type === 'HR') h.hr++;
    }
    h.rbi += ev.runs;
  }

  private afterResult() {
    const s = this.s;
    if (this.derby) {
      if (this.derbyOuts >= this.derby.outs) this.finish();
      else this.nextPitch();
      return;
    }
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
    if (this.derby) {
      const best = this.derbyRecord?.hrs ?? -1;
      if (this.derbyHR > 0 && this.derbyHR > best) {
        this.derbyNewRecord = this.derbyHR > 0;
        this.derbyRecord = { hrs: this.derbyHR, name: this.derby.hitter.name };
        try {
          localStorage.setItem(DERBY_KEY, JSON.stringify(this.derbyRecord));
        } catch {
          /* record just won't persist */
        }
      }
      if (this.derbyHR > 0) this.game.chip.charge();
      else this.game.chip.lose();
      this.setPhase('final');
      return;
    }
    if (this.userWon()) this.game.chip.charge();
    else this.game.chip.lose();
    this.setPhase('final');
  }

  /** Did a human win? (Always true in two-player mode.) */
  private userWon(): boolean {
    const homeWon = total(this.s.home) > total(this.s.away);
    if (this.hero) return homeWon === (this.hero.side === 'home');
    return (homeWon ? this.ctl.home : this.ctl.away) !== 0;
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
    const bw = this.who(this.batterCtl);
    const pw = this.who(this.pitcherCtl);

    if (input.pressed('start') && this.phase !== 'final') {
      this.game.paused = true;
      return;
    }

    const steer = (c: Loc, w: Who, lim: number) => {
      const dx = (input.down('right', w) ? 1 : 0) - (input.down('left', w) ? 1 : 0);
      const dy = (input.down('up', w) ? 1 : 0) - (input.down('down', w) ? 1 : 0);
      c.x = clamp(c.x + dx * CURSOR_SPEED * dt, -lim, lim);
      c.y = clamp(c.y + dy * CURSOR_SPEED * dt, -lim, lim);
    };
    // Batter's aim (Pro/All-Star) while the pitch is coming; pitcher's target before the throw.
    if (this.humanBats && this.diff.autoAim < 1 && (this.phase === 'windup' || this.phase === 'flight')) {
      steer(this.cursor, bw, 1.4);
    }
    if (this.humanPitches && this.phase === 'aim') steer(this.target, pw, 1.7);

    switch (this.phase) {
      case 'intro':
        if (this.t > 1.3 || (skip && this.t > 0.2)) this.nextPitch();
        break;

      case 'sim':
        if (skip && this.t > 0.3) this.introPA();
        break;

      case 'aim': {
        if (input.pressed('b', pw)) {
          this.pitchType = PITCH_TYPES[(PITCH_TYPES.indexOf(this.pitchType) + 1) % PITCH_TYPES.length];
          chip.blip();
        }
        if (input.pressed('a', pw)) this.setPhase('windup');
        break;
      }

      case 'windup': {
        if (this.t >= this.windupLen) this.throwPitch(now);
        break;
      }

      case 'flight': {
        const pitch = this.pitch!;
        const elapsed = now - this.releaseAt;
        const batter = currentBatter(this.s).player;
        if (this.humanBats) {
          if (this.swingAt == null && input.pressed('a', bw)) {
            this.swingAt = input.pressedAt('a', bw);
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
          this.banner = this.derby
            ? ev.play?.type === 'HR'
              ? { big: 'HOME RUN!', small: `${Math.round(ev.play.dist)} FEET - ${this.derbyHR} TOTAL`, color: C.yellow }
              : { big: 'OUT', small: this.derbyOutsLeft(), color: C.orange }
            : this.playBanner(ev);
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
        if (this.t > 1 && (skip || input.pressed('start'))) {
          if (this.opts.onDone) this.opts.onDone(this.s);
          else this.game.go(new TitleScene(this.game));
        }
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
    if (this.phase === 'switch' || this.phase === 'final' || this.phase === 'sim') {
      this.renderScoreboard(g);
      return;
    }
    if (showField) this.renderField(g);
    else this.renderPlate(g, now);
    if (this.derby) this.renderDerbyHUD(g);
    else drawHUD(g, this.s);
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
      const f = this.t / this.windupLen;
      pose = f < 0.4 ? 'set' : f < 0.85 ? 'kick' : 'release';
    } else if (this.phase === 'flight' && now - this.releaseAt < 250) pose = 'release';
    drawPitcher(g, MOUND[0], MOUND[1], pitcher.throws, fKit, pose);

    // strike zone
    const zoneColor = this.humanPitches ? 'rgba(252,252,252,0.6)' : 'rgba(252,252,252,0.35)';
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
    if (this.humanBats && this.swingAt != null) swing = (now - this.swingAt) / 200;
    if (!this.humanBats && this.cpuSwingIn && this.pitch && this.phase !== 'windup' && this.phase !== 'aim') {
      // The computer's timing error is in unassisted windows, so animate with those.
      const tW = 90 + batter.bat.contact * 5;
      const start = this.releaseAt + this.pitch.travelMs + this.cpuSwingIn.t * tW - 70;
      if (now >= start) swing = (now - start) / 200;
    }
    if (this.phase === 'hitAway' || this.phase === 'result') swing = swing < 0 ? -1 : 1;
    const bx = batter.bats === 'L' ? ZX + 18 : ZX - 18 - 28;
    drawBatter(g, bx, 122, batter.bats, bKit, swing);

    // catcher with mitt at the target
    const mittLoc = this.humanPitches && this.phase === 'aim' ? this.target : this.pitch ? (this.phase === 'flight' ? this.pitch.target : this.pitch.loc) : { x: 0, y: 0 };
    drawCatcher(g, 128, 180, fKit, toScreen(mittLoc));

    if (ballPos) {
      // Timing cue (Rookie/Pro): the ball glows while a swing now would be on time.
      if (this.phase === 'flight' && this.pitch && this.humanBats && this.diff.cue && this.swingAt == null) {
        const t = (now - this.releaseAt - this.pitch.travelMs) / timingWindow(batter, this.diff);
        if (t > -0.6 && t < 0.45) g.circle(ballPos[0], ballPos[1], ballR + 3, C.yellow);
      }
      drawBall(g, ballPos[0], ballPos[1], ballR);
    }
    if (this.catchFlash > 0 && this.pitch) {
      const [x, y] = toScreen(this.pitch.loc);
      g.frame(x - 6, y - 6, 13, 13, C.white);
    }

    // aim cursor
    if (this.humanBats && this.diff.autoAim < 1 && (this.phase === 'windup' || this.phase === 'flight')) {
      const [cx, cy] = toScreen(this.cursor);
      const r = reachOf(batter, this.diff) * ZH * (1 - this.diff.autoAim * 0.5);
      g.frame(cx - r * 1.4, cy - r, r * 2.8, r * 2, C.yellow);
      g.rect(cx, cy, 1, 1, C.yellow);
    }
    if (this.humanPitches && this.phase === 'aim') {
      const [cx, cy] = toScreen(this.target);
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
    const tag = (c: Controller) => (this.twoPlayer ? `P${c} ` : '');
    const batting_ = this.humanBats && (this.phase === 'windup' || this.phase === 'flight');
    const hint =
      this.phase === 'aim' ? `${tag(this.pitcherCtl)}ARROWS AIM  B PITCH  A THROW` :
      batting_ ? `${tag(this.batterCtl)}${this.diff.autoAim < 1 ? 'ARROWS AIM   A SWING' : 'A = SWING!'}`
        : `P ${f.pitcher.name}  ${f.pitches}P`;
    g.text(hint.slice(0, 42), 3, 216, this.phase === 'aim' || batting_ ? C.yellow : C.light);
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

  private renderDerbyHUD(g: Gfx) {
    g.box(2, 2, 92, 31);
    g.text(`HR   ${this.derbyHR}`, 8, 6, C.yellow);
    g.text(`OUTS ${this.derbyOuts}/${this.derby!.outs}`, 8, 15, C.white);
    g.text(`LONG ${this.derbyLong || '-'}`, 8, 24, C.light);
    if (this.derbyRecord) {
      g.box(176, 2, 78, 22);
      g.text('RECORD', 181, 6, C.light);
      g.text(`${this.derbyRecord.hrs} HR`, 181, 15, C.yellow);
    }
  }

  private heroSummary(): string {
    const h = this.heroLine;
    const bits = [`${h.h}-${h.ab}`];
    if (h.hr) bits.push(`${h.hr} HR`);
    if (h.rbi) bits.push(`${h.rbi} RBI`);
    if (h.bb) bits.push(`${h.bb} BB`);
    return `${this.hero!.player.name}  ${bits.join('  ')}`;
  }

  private renderScoreboard(g: Gfx) {
    const s = this.s;
    g.clear(C.navy);
    g.rect(0, 0, 256, 40, C.wall);
    if (this.derby && this.phase === 'final') {
      g.ctext('DERBY OVER', 12, C.white, 2);
      g.ctext(this.derby.hitter.name, 56, C.white);
      g.ctext(`${this.derbyHR} HOME RUN${this.derbyHR === 1 ? '' : 'S'}`, 74, C.yellow, 2);
      if (this.derbyLong) g.ctext(`LONGEST: ${this.derbyLong} FEET`, 100, C.light);
      if (this.derbyNewRecord) g.ctext('NEW RECORD!', 124, C.yellow, 2);
      else if (this.derbyRecord) g.ctext(`RECORD: ${this.derbyRecord.hrs} BY ${this.derbyRecord.name}`, 128, C.light);
      if (this.t > 1 && Math.floor(this.t * 2) % 2 === 0) g.ctext('PRESS A', 180, C.white);
      return;
    }
    if (this.phase === 'sim') {
      g.ctext(`${s.half === 'top' ? 'TOP' : 'BOTTOM'} OF THE ${ordinal(s.inning)}`, 16, C.white);
      drawLineScore(g, s, 48);
      g.ctext(this.simNotes.length ? 'MEANWHILE...' : 'QUIET INNINGS...', 92, C.light);
      this.simNotes.forEach((n, i) => g.ctext(n.slice(0, 42), 104 + i * 10, C.white, 1, false));
      if (this.heroLine.ab || this.heroLine.bb) g.ctext(`YOU: ${this.heroSummary()}`.slice(0, 42), 172, C.yellow);
      if (this.t > 0.3 && Math.floor(this.t * 2) % 2 === 0) g.ctext(`YOU'RE UP! PRESS A`, 190, C.yellow);
      return;
    }
    if (this.phase === 'final') {
      const winner = total(s.home) > total(s.away) ? this.ctl.home : this.ctl.away;
      g.ctext('FINAL', 12, C.white, 2);
      drawLineScore(g, s, 60);
      if (this.twoPlayer) g.ctext(`P${winner} WINS!`, 112, C.yellow, 3);
      else g.ctext(this.userWon() ? 'YOU WIN!' : 'YOU LOSE', 112, this.userWon() ? C.yellow : C.orange, 3);
      if (this.hero) g.ctext(this.heroSummary().slice(0, 42), 150, C.white);
      if (this.t > 1 && Math.floor(this.t * 2) % 2 === 0) g.ctext('PRESS A FOR NEW GAME', 180, C.white);
    } else {
      const label = s.half === 'top' ? `MIDDLE OF THE ${ordinal(s.inning)}` : `END OF THE ${ordinal(s.inning)}`;
      g.ctext(label, 16, C.white);
      drawLineScore(g, s, 60);
      const nextBat = s.half === 'top' ? s.home : s.away;
      // Next half: the side that just pitched comes up to bat.
      const nextBatCtl = this.ctl[this.pitchSide];
      const nextPitchCtl = this.ctl[this.batSide];
      if (!this.hero) {
        g.ctext(
          this.twoPlayer ? `P${nextBatCtl} BATS - P${nextPitchCtl} PITCHES` : nextBatCtl ? 'YOUR TURN TO BAT' : 'YOUR TURN TO PITCH',
          120, C.yellow,
        );
      }
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
