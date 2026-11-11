// The drawing pad. One canvas, one finger. Strokes are kept in metres so a
// doodle survives a resize or a reload, and every finished stroke is read
// straight away so the player sees what it became.

import { type Doodle, type Stroke, buildDoodle, emptyDoodle, partAt } from "../engine/doodle";
import type { Pt } from "../engine/geom";
import { STARTERS } from "../engine/starters";
import { paintDoodle } from "./art";
import type { Sound } from "./audio";
import { INK, PAPER } from "./ink";

export class Pad {
  ctx: CanvasRenderingContext2D;
  strokes: Stroke[] = [];
  doodle: Doodle = emptyDoodle();
  color = 0;
  /** Show the animated example until the first stroke. */
  hint = false;
  enabled = true;
  onChange: () => void = () => {};
  private w = 0;
  private h = 0;
  private dpr = 1;
  private ppm = 60;
  private live: Pt[] | null = null;
  private livePx = 0;
  private downAt = 0;
  private born = new Map<number, number>();
  private time = 0;
  private lastMove = 0;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private sound: Sound,
  ) {
    this.ctx = canvas.getContext("2d")!;
    canvas.addEventListener("pointerdown", (e) => this.down(e));
    canvas.addEventListener("pointermove", (e) => this.move(e));
    canvas.addEventListener("pointerup", (e) => this.up(e));
    canvas.addEventListener("pointercancel", () => this.cancel());
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ppm = Math.min(this.w / 5.6, this.h / 4.5);
  }

  private get baseY() {
    return this.h * 0.86;
  }

  private toPad(e: PointerEvent): Pt {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left - this.w / 2) / this.ppm, y: (e.clientY - r.top - this.baseY) / this.ppm };
  }

  private down(e: PointerEvent) {
    if (!this.enabled || this.live || (e.pointerType === "mouse" && e.button !== 0)) return;
    this.sound.wake();
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* a synthetic pointer has nothing to capture */
    }
    this.live = [this.toPad(e)];
    this.livePx = 0;
    this.downAt = performance.now();
    this.hint = false;
    e.preventDefault();
  }

  private move(e: PointerEvent) {
    if (!this.live) return;
    const events = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
    for (const ev of events.length ? events : [e]) {
      const p = this.toPad(ev);
      const last = this.live[this.live.length - 1];
      const d = Math.hypot(p.x - last.x, p.y - last.y);
      if (d * this.ppm < 1.5) continue;
      this.livePx += d * this.ppm;
      this.live.push(p);
    }
    const now = performance.now();
    this.sound.pencil(Math.min(1, 0.3 + this.livePx / 600));
    this.lastMove = now;
  }

  private up(e: PointerEvent) {
    if (!this.live) return;
    const pts = this.live;
    this.live = null;
    this.sound.pencil(0);
    if (this.livePx < 10 && performance.now() - this.downAt < 500) {
      this.tap(this.toPad(e));
      return;
    }
    if (pts.length < 3) return;
    this.strokes.push({ pts, color: this.color });
    this.born.set(this.strokes.length - 1, this.time);
    this.rebuild();
    this.sound.pop();
  }

  private cancel() {
    this.live = null;
    this.sound.pencil(0);
  }

  /** A tap on a closed shape flips it between body and wheel. */
  private tap(p: Pt) {
    const d = this.doodle;
    const q = { x: (p.x - d.origin.x) * d.scale, y: (p.y - d.origin.y) * d.scale };
    const part = partAt(d, q);
    if (!part) return;
    const s = this.strokes[part.stroke];
    s.force = part.kind === "wheel" ? "body" : "wheel";
    this.born.set(part.stroke, this.time);
    this.rebuild();
    this.sound.tick();
  }

  set(strokes: Stroke[]) {
    this.strokes = strokes.map((s) => ({ ...s, pts: s.pts.slice() }));
    this.born.clear();
    this.strokes.forEach((_, i) => this.born.set(i, this.time + i * 0.06));
    this.hint = false;
    this.rebuild();
  }

  undo() {
    if (!this.strokes.length) return;
    this.strokes.pop();
    this.rebuild();
    this.sound.undo();
  }

  clear() {
    if (!this.strokes.length) return;
    this.strokes = [];
    this.born.clear();
    this.rebuild();
    this.sound.undo();
  }

  private rebuild() {
    this.doodle = buildDoodle(this.strokes);
    this.onChange();
  }

  draw(dt: number) {
    this.time += dt;
    const { ctx, w, h, dpr, ppm } = this;
    if (this.live && performance.now() - this.lastMove > 90) this.sound.pencil(0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // The ground the machine will stand on.
    ctx.strokeStyle = "rgba(23,21,15,0.28)";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.setLineDash([2, 12]);
    ctx.beginPath();
    ctx.moveTo(18, this.baseY + 6);
    ctx.lineTo(w - 18, this.baseY + 6);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.setTransform(dpr * ppm, 0, 0, dpr * ppm, (dpr * w) / 2, dpr * this.baseY);

    if (!this.strokes.length && !this.live && this.hint) this.drawHint();

    const d = this.doodle;
    if (d.parts.length) {
      ctx.save();
      ctx.translate(d.origin.x, d.origin.y);
      ctx.scale(1 / d.scale, 1 / d.scale);
      paintDoodle(ctx, d, {
        boil: Math.floor(this.time * 6),
        spin: this.time * 2.4,
        pop: (i) => {
          const age = this.time - (this.born.get(i) ?? -9);
          if (age < 0) return 0.001;
          if (age > 0.3) return 1;
          const t = age / 0.3;
          return 1 + 0.16 * Math.sin(t * Math.PI) * (1 - t);
        },
      });
      ctx.restore();
    }

    if (this.live && this.live.length > 1) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 5 / ppm;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(this.live[0].x, this.live[0].y);
      for (const p of this.live) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  }

  /** A ghost hand draws a body and two wheels, then starts again. */
  private drawHint() {
    const { ctx, ppm } = this;
    const strokes = STARTERS[0].strokes.slice(0, 3);
    const total = strokes.reduce((s, st) => s + st.pts.length, 0);
    const t = (this.time % 5) / 3.4;
    const upto = Math.min(1, t) * total;
    const fade = t > 1.25 ? Math.max(0, 1 - (t - 1.25) * 5) : 1;
    let seen = 0;
    let tip: Pt | null = null;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = 5 / ppm;
    ctx.strokeStyle = `rgba(23,21,15,${0.3 * fade})`;
    const k = 0.78;
    for (const st of strokes) {
      const n = Math.max(0, Math.min(st.pts.length, Math.floor(upto - seen)));
      seen += st.pts.length;
      if (n < 2) continue;
      ctx.beginPath();
      for (let i = 0; i < n; i++) ctx.lineTo(st.pts[i].x * k, st.pts[i].y * k - 0.5);
      ctx.stroke();
      if (n < st.pts.length) tip = { x: st.pts[n - 1].x * k, y: st.pts[n - 1].y * k - 0.5 };
    }
    if (tip) {
      ctx.fillStyle = PAPER;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3 / ppm;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 11 / ppm, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}
