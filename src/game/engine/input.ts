export type Btn = 'up' | 'down' | 'left' | 'right' | 'a' | 'b' | 'start';

/**
 * Who a press came from. On-screen touch buttons act for whoever's turn it is
 * (two people share one phone). The shared keyboard keys only count when a
 * scene isn't asking for a specific player, so in two-player mode each person
 * must use their own keys.
 */
export type Source = 'p1' | 'p2' | 'kb' | 'touch';

/** Which player's controls a scene wants to read. Omit to accept anyone. */
export type Who = 1 | 2 | undefined;

const KEYS: Record<string, [Btn, Source]> = {
  // Player 1: left side of the keyboard
  KeyW: ['up', 'p1'], KeyS: ['down', 'p1'], KeyA: ['left', 'p1'], KeyD: ['right', 'p1'],
  KeyF: ['a', 'p1'], KeyG: ['b', 'p1'],
  // Player 2: arrows and the right hand
  ArrowUp: ['up', 'p2'], ArrowDown: ['down', 'p2'], ArrowLeft: ['left', 'p2'], ArrowRight: ['right', 'p2'],
  KeyK: ['a', 'p2'], KeyL: ['b', 'p2'],
  // Shared: the one-player keys, and pause
  KeyZ: ['a', 'kb'], Space: ['a', 'kb'], KeyJ: ['a', 'kb'], KeyX: ['b', 'kb'],
  Enter: ['start', 'kb'], Escape: ['start', 'kb'], KeyP: ['start', 'kb'],
};

const accepts = (who: Who, src: Source) => who === undefined || src === 'touch' || src === `p${who}`;

/**
 * Keyboard and on-screen buttons feed the same state. Presses are latched
 * until a game tick consumes them, and stamped with performance.now() so
 * swing timing is exact regardless of frame rate.
 *
 * In one-player mode every key simply works. In two-player mode the play
 * screen asks for a specific player, and only that player's keys (plus touch)
 * count.
 */
export class Input {
  private held = new Map<Source, Set<Btn>>();
  private latched = new Map<Source, Set<Btn>>();
  private stamp = new Map<string, number>();
  onAnyPress: (() => void) | null = null;
  onMute: (() => void) | null = null;

  private set(map: Map<Source, Set<Btn>>, src: Source) {
    let s = map.get(src);
    if (!s) map.set(src, (s = new Set()));
    return s;
  }

  press(b: Btn, at = performance.now(), src: Source = 'touch') {
    const held = this.set(this.held, src);
    if (!held.has(b)) {
      this.set(this.latched, src).add(b);
      this.stamp.set(`${src}:${b}`, at);
    }
    held.add(b);
    this.onAnyPress?.();
  }

  release(b: Btn, src: Source = 'touch') {
    this.held.get(src)?.delete(b);
  }

  private any(map: Map<Source, Set<Btn>>, b: Btn, who: Who) {
    for (const [src, set] of map) if (accepts(who, src) && set.has(b)) return true;
    return false;
  }

  down(b: Btn, who?: Who) {
    return this.any(this.held, b, who);
  }

  /** True once per press. */
  pressed(b: Btn, who?: Who) {
    return this.any(this.latched, b, who);
  }

  /** When the (earliest) qualifying press this tick happened. */
  pressedAt(b: Btn, who?: Who) {
    let t = Infinity;
    for (const [src, set] of this.latched) {
      if (accepts(who, src) && set.has(b)) t = Math.min(t, this.stamp.get(`${src}:${b}`) ?? Infinity);
    }
    return Number.isFinite(t) ? t : performance.now();
  }

  endTick() {
    for (const s of this.latched.values()) s.clear();
  }

  attachKeyboard(target: Window) {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'KeyM') {
        if (!e.repeat) this.onMute?.();
        return;
      }
      const k = KEYS[e.code];
      if (!k) return;
      e.preventDefault();
      if (!e.repeat) this.press(k[0], e.timeStamp || performance.now(), k[1]);
    };
    const up = (e: KeyboardEvent) => {
      const k = KEYS[e.code];
      if (k) this.release(k[0], k[1]);
    };
    const blur = () => this.held.clear();
    target.addEventListener('keydown', down);
    target.addEventListener('keyup', up);
    target.addEventListener('blur', blur);
    return () => {
      target.removeEventListener('keydown', down);
      target.removeEventListener('keyup', up);
      target.removeEventListener('blur', blur);
    };
  }
}
