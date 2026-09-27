export type Btn = 'up' | 'down' | 'left' | 'right' | 'a' | 'b' | 'start';

const KEYS: Record<string, Btn> = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  KeyZ: 'a', Space: 'a', KeyJ: 'a',
  KeyX: 'b', KeyK: 'b',
  Enter: 'start', Escape: 'start', KeyP: 'start',
};

/**
 * Keyboard and on-screen buttons feed the same state. Presses are latched
 * until a game tick consumes them, and stamped with performance.now() so
 * swing timing is exact regardless of frame rate.
 */
export class Input {
  private held = new Set<Btn>();
  private latched = new Set<Btn>();
  private stamp = new Map<Btn, number>();
  onAnyPress: (() => void) | null = null;
  onMute: (() => void) | null = null;

  press(b: Btn, at = performance.now()) {
    if (!this.held.has(b)) {
      this.latched.add(b);
      this.stamp.set(b, at);
    }
    this.held.add(b);
    this.onAnyPress?.();
  }

  release(b: Btn) {
    this.held.delete(b);
  }

  down(b: Btn) {
    return this.held.has(b);
  }

  /** True once per press. */
  pressed(b: Btn) {
    return this.latched.has(b);
  }

  pressedAt(b: Btn) {
    return this.stamp.get(b) ?? 0;
  }

  endTick() {
    this.latched.clear();
  }

  attachKeyboard(target: Window) {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'KeyM') {
        if (!e.repeat) this.onMute?.();
        return;
      }
      const b = KEYS[e.code];
      if (!b) return;
      e.preventDefault();
      if (!e.repeat) this.press(b, e.timeStamp || performance.now());
    };
    const up = (e: KeyboardEvent) => {
      const b = KEYS[e.code];
      if (b) this.release(b);
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
