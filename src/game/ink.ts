// The look: paper, ink and five loud colours. Everything that draws a
// doodle part (the pad, the world, the share card, the thumbnails) goes
// through drawPart so a machine looks the same wherever it appears.

import type { Kind } from "../engine/doodle";
import { type Pt, smoothRing } from "../engine/geom";

export const INK = "#17150f";
export const PAPER = "#fbf6ea";
export const COLORS = ["#ff4b33", "#ffc928", "#3b82ff", "#17b884", "#ff7ac0"];
export const FONT = '"Bricolage Grotesque Variable", "Helvetica Neue", Arial, sans-serif';

/** Small deterministic random source, so wobble is the same every frame it should be. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

export interface PartPaths {
  /** Two slightly different tracings. Swapping between them makes the line boil. */
  frames: Path2D[];
}

export function partPaths(outline: Pt[], closed: boolean, seed: number, wobble = 0.014): PartPaths {
  const frames: Path2D[] = [];
  for (let f = 0; f < 2; f++) {
    const r = rng(seed * 31 + f * 977 + 5);
    const pts = outline.map((p) => ({ x: p.x + (r() - 0.5) * wobble * 2, y: p.y + (r() - 0.5) * wobble * 2 }));
    const path = new Path2D();
    if (closed) {
      const s = smoothRing(pts, 2);
      path.moveTo(s[0].x, s[0].y);
      for (let i = 1; i < s.length; i++) path.lineTo(s[i].x, s[i].y);
      path.closePath();
    } else {
      path.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);
    }
    frames.push(path);
  }
  return { frames };
}

export interface PartLook {
  kind: Kind;
  color: number;
  closed: boolean;
  radius: number;
  /** Centre of a wheel in the same frame as the path. */
  cx: number;
  cy: number;
  /** Extra spin, for the idle wheels on the drawing pad. */
  spin?: number;
}

/**
 * Draw one part. The context must already be scaled so one unit is one metre.
 * `pass` 0 lays the white sticker edge, pass 1 the part itself, so edges of
 * neighbouring parts never cover each other's colour.
 */
export function drawPart(ctx: CanvasRenderingContext2D, look: PartLook, path: Path2D, pass: 0 | 1) {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (pass === 0) {
    ctx.strokeStyle = PAPER;
    // A window has no sticker edge of its own.
    if (look.kind === "deco") return;
    ctx.lineWidth = look.kind === "stick" ? 0.34 : 0.24;
    ctx.stroke(path);
    return;
  }
  if (look.kind === "stick") {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.2;
    ctx.stroke(path);
    ctx.strokeStyle = COLORS[look.color % COLORS.length];
    ctx.lineWidth = 0.075;
    ctx.stroke(path);
    return;
  }
  if (look.kind === "wheel") {
    ctx.fillStyle = INK;
    ctx.fill(path);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.07;
    ctx.stroke(path);
    const r = look.radius;
    ctx.save();
    ctx.translate(look.cx, look.cy);
    if (look.spin) ctx.rotate(look.spin);
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, 0);
    ctx.lineTo(r * 0.5, 0);
    ctx.moveTo(0, -r * 0.5);
    ctx.lineTo(0, r * 0.5);
    ctx.stroke();
    ctx.fillStyle = COLORS[look.color % COLORS.length];
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.fillStyle = look.kind === "deco" ? PAPER : COLORS[look.color % COLORS.length];
  ctx.fill(path);
  if (look.kind === "body") {
    // A printed highlight, slightly off register.
    ctx.save();
    ctx.clip(path);
    ctx.translate(-0.11, -0.11);
    ctx.strokeStyle = "rgba(255,255,255,0.42)";
    ctx.lineWidth = 0.13;
    ctx.stroke(path);
    ctx.restore();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = look.kind === "deco" ? 0.06 : 0.085;
  ctx.stroke(path);
}

/** Mix two hex colours. t = 0 gives a, t = 1 gives b. */
export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (sh: number) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

export function formatTime(t: number): string {
  return t.toFixed(t < 100 ? 2 : 1);
}
