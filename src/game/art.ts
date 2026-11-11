// Paint a whole doodle at rest: on the drawing pad, on the share card and
// in the little starter thumbnails.

import type { Doodle } from "../engine/doodle";
import { type PartLook, type PartPaths, drawPart, partPaths } from "./ink";

interface Ready {
  paths: PartPaths;
  look: PartLook;
  order: number;
  stroke: number;
}

const cache = new WeakMap<Doodle, Ready[]>();

function ready(d: Doodle): Ready[] {
  let r = cache.get(d);
  if (!r) {
    r = d.parts
      .map((p) => ({
        paths: partPaths(p.outline, p.closed, p.stroke + 1),
        look: {
          kind: p.kind,
          color: p.color,
          closed: p.closed,
          radius: p.circle ? p.circle.r : p.radius,
          cx: p.center.x,
          cy: p.center.y,
        },
        order: p.kind === "wheel" ? 2 : p.kind === "deco" ? 1 : 0,
        stroke: p.stroke,
      }))
      .sort((a, b) => a.order - b.order);
    cache.set(d, r);
  }
  return r;
}

export interface PaintOptions {
  boil?: number;
  /** Wheel rotation, to show which shapes will turn. */
  spin?: number;
  /** Scale for a stroke that has just landed, 1 when settled. */
  pop?: (stroke: number) => number;
}

/** The context must be in the doodle's own metres: origin at its feet, y down. */
export function paintDoodle(ctx: CanvasRenderingContext2D, d: Doodle, o: PaintOptions = {}) {
  const parts = ready(d);
  for (const pass of [0, 1] as const) {
    for (const p of parts) {
      const k = o.pop ? o.pop(p.stroke) : 1;
      ctx.save();
      if (k !== 1) {
        ctx.translate(p.look.cx, p.look.cy);
        ctx.scale(k, k);
        ctx.translate(-p.look.cx, -p.look.cy);
      }
      p.look.spin = p.look.kind === "wheel" ? o.spin : undefined;
      drawPart(ctx, p.look, p.paths.frames[(o.boil ?? 0) % 2], pass);
      ctx.restore();
    }
  }
}

/** Fit a doodle into a box of pixels and paint it, feet on the bottom edge. */
export function paintDoodleIn(
  ctx: CanvasRenderingContext2D,
  d: Doodle,
  x: number,
  y: number,
  w: number,
  h: number,
  o: PaintOptions = {},
) {
  if (!d.parts.length) return;
  const bw = d.box.maxX - d.box.minX + 0.5;
  const bh = d.box.maxY - d.box.minY + 0.5;
  const s = Math.min(w / bw, h / bh);
  ctx.save();
  ctx.translate(x + w / 2 - ((d.box.minX + d.box.maxX) / 2) * s, y + h - 0.25 * s - d.box.maxY * s);
  ctx.scale(s, s);
  paintDoodle(ctx, d, o);
  ctx.restore();
}
