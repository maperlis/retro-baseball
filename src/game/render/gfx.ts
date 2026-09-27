import { drawText, textWidth } from './font';
import { C } from './palette';

export const W = 256;
export const H = 224;

/** Thin wrapper over a 256×224 canvas that only ever draws whole pixels. */
export class Gfx {
  constructor(public ctx: CanvasRenderingContext2D) {
    ctx.imageSmoothingEnabled = false;
  }

  clear(color: string = C.black) {
    this.rect(0, 0, W, H, color);
  }

  rect(x: number, y: number, w: number, h: number, color: string) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  frame(x: number, y: number, w: number, h: number, color: string, t = 1) {
    this.rect(x, y, w, t, color);
    this.rect(x, y + h - t, w, t, color);
    this.rect(x, y, t, h, color);
    this.rect(x + w - t, y, t, h, color);
  }

  /** A menu/dialog box: black fill, white double border. */
  box(x: number, y: number, w: number, h: number, fill: string = C.black) {
    this.rect(x, y, w, h, fill);
    this.frame(x + 1, y + 1, w - 2, h - 2, C.white);
  }

  text(s: string, x: number, y: number, color: string = C.white, scale = 1) {
    drawText(this.ctx, s, x, y, color, scale);
  }

  /** Text with a 1px drop shadow, for legibility over busy backgrounds. */
  stext(s: string, x: number, y: number, color: string = C.white, scale = 1) {
    drawText(this.ctx, s, x + scale, y + scale, C.black, scale);
    drawText(this.ctx, s, x, y, color, scale);
  }

  ctext(s: string, y: number, color: string = C.white, scale = 1, shadow = true) {
    const x = Math.round((W - textWidth(s, scale)) / 2);
    if (shadow) this.stext(s, x, y, color, scale);
    else this.text(s, x, y, color, scale);
  }

  rtext(s: string, right: number, y: number, color: string = C.white, scale = 1) {
    this.text(s, right - textWidth(s, scale), y, color, scale);
  }

  /** Filled polygon via scanlines, so edges stay hard (no anti-aliasing). */
  poly(pts: [number, number][], color: string) {
    this.ctx.fillStyle = color;
    const ys = pts.map((p) => p[1]);
    const y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const y1 = Math.min(H - 1, Math.ceil(Math.max(...ys)));
    for (let y = y0; y <= y1; y++) {
      const cy = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= cy && by > cy) || (by <= cy && ay > cy)) xs.push(ax + ((cy - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const a = Math.round(xs[i]);
        const b = Math.round(xs[i + 1]);
        if (b > a) this.ctx.fillRect(a, y, b - a, 1);
      }
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, color: string) {
    this.ctx.fillStyle = color;
    for (let y = -ry; y <= ry; y++) {
      const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry || 1))));
      this.ctx.fillRect(Math.round(cx - half), Math.round(cy + y), half * 2 + 1, 1);
    }
  }

  circle(cx: number, cy: number, r: number, color: string) {
    this.ellipse(cx, cy, r, r, color);
  }

  /** Bresenham line with a square brush. */
  line(x0: number, y0: number, x1: number, y1: number, color: string, w = 1) {
    this.ctx.fillStyle = color;
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.ctx.fillRect(x0 - Math.floor(w / 2), y0 - Math.floor(w / 2), w, w);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
}
