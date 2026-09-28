import { useEffect, useRef, useState } from 'react';
import { RetroGame } from './RetroGame';
import { Input, type Btn } from './engine/input';
import './game.css';

/** On-screen button that feeds the same Input as the keyboard. */
function Pad({ input, btn, label, glyph, className }: { input: Input; btn: Btn; label: string; glyph: string; className: string }) {
  return (
    <button
      type="button"
      className={`rb__btn ${className}`}
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        input.press(btn, e.timeStamp || performance.now());
      }}
      onPointerUp={() => input.release(btn)}
      onPointerCancel={() => input.release(btn)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {glyph}
    </button>
  );
}

export default function GameApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [input] = useState(() => new Input());
  const gameRef = useRef<RetroGame | null>(null);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const game = new RetroGame(canvasRef.current!, input);
    gameRef.current = game;
    setMuted(game.chip.muted);
    const sync = () => setMuted(game.chip.muted);
    window.addEventListener('keyup', sync);
    return () => {
      window.removeEventListener('keyup', sync);
      game.destroy();
    };
  }, [input]);

  const toggleMute = () => {
    const g = gameRef.current;
    if (!g) return;
    g.chip.unlock();
    g.chip.toggleMute();
    setMuted(g.chip.muted);
  };

  return (
    <div className="rb">
      <div className="rb__screen">
        <canvas ref={canvasRef} className="rb__canvas" aria-label="Retro Baseball game screen" />
      </div>

      <div className="rb__controls">
        <div className="rb__dpad">
          <Pad input={input} btn="up" label="Up" glyph="▲" className="rb__d rb__d--up" />
          <Pad input={input} btn="left" label="Left" glyph="◀" className="rb__d rb__d--left" />
          <Pad input={input} btn="right" label="Right" glyph="▶" className="rb__d rb__d--right" />
          <Pad input={input} btn="down" label="Down" glyph="▼" className="rb__d rb__d--down" />
        </div>
        <div className="rb__mid">
          <Pad input={input} btn="start" label="Start / pause" glyph="START" className="rb__pill" />
          <button type="button" className="rb__btn rb__pill" onClick={toggleMute}>
            {muted ? 'SOUND' : 'MUTE'}
          </button>
        </div>
        <div className="rb__ab">
          <Pad input={input} btn="b" label="B button" glyph="B" className="rb__round rb__round--b" />
          <Pad input={input} btn="a" label="A button" glyph="A" className="rb__round rb__round--a" />
        </div>
      </div>

      <p className="rb__keys">
        1 player: arrows move · <kbd>Z</kbd>/<kbd>Space</kbd> = A (swing, throw) · <kbd>X</kbd> = B (pitch type)
        <br />
        2 players: P1 <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> + <kbd>F</kbd>/<kbd>G</kbd> · P2 arrows +{' '}
        <kbd>K</kbd>/<kbd>L</kbd> · <kbd>Enter</kbd> pause · <kbd>M</kbd> sound
      </p>
    </div>
  );
}
