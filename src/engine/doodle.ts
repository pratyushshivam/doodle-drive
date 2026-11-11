// Doodle to machine.
//
// A doodle is a list of finger strokes. This file decides what each stroke
// is (a body, a wheel, a stick or a decoration), cleans it up, cuts hollow
// outlines into convex pieces a physics engine can use, and works out which
// wheel hangs off which body. Pure: no DOM, no physics library.

import { makeCCW, quickDecomp, removeCollinearPoints } from "poly-decomp-es";
import {
  type Box,
  type Pt,
  area,
  bbox,
  centroid,
  dedupe,
  dist,
  elongation,
  firstLoop,
  hull,
  mean,
  meanRadius,
  pathGap,
  pathLength,
  pointInRing,
  resample,
  ringIsSimple,
  roundness,
  simplify,
  simplifyRing,
} from "./geom";

export type Kind = "body" | "wheel" | "stick" | "deco";

export interface Stroke {
  pts: Pt[];
  /** Index into the colour palette. */
  color: number;
  /** Set when the player taps a shape to flip it between body and wheel. */
  force?: "body" | "wheel";
}

export interface Part {
  stroke: number;
  kind: Kind;
  color: number;
  /** A closed ring, or an open polyline for a stick. Metres, y down. */
  outline: Pt[];
  closed: boolean;
  /** Convex pieces for the physics engine. Empty for a round wheel or a decoration. */
  pieces: Pt[][];
  /** Set when a wheel is round enough to roll as a true circle. */
  circle: { c: Pt; r: number } | null;
  center: Pt;
  radius: number;
  area: number;
  /** Rigid group for bodies and sticks. For a wheel or decoration: the group it rides on, or -1. */
  group: number;
}

export interface Doodle {
  parts: Part[];
  groups: number;
  box: Box;
  wheels: number;
  /** How much the drawing was scaled to reach a drivable size. */
  scale: number;
  /** Where the machine's origin sat in the drawing: drawn = point / scale + origin. */
  origin: Pt;
}

/** A finished machine is never smaller or larger than this, in metres. */
export const MIN_SIZE = 2.6;
export const MAX_SIZE = 5.2;
/** Half the thickness of a stick. */
export const STICK = 0.085;
/** Shapes closer than this count as touching. */
const TOUCH = 0.14;
const MAX_VERTS = 8;

interface Raw {
  stroke: number;
  color: number;
  force?: "body" | "wheel";
  closed: boolean;
  outline: Pt[];
  hull: Pt[];
  area: number;
  round: number;
  long: number;
  center: Pt;
}

function readStroke(pts: Pt[]): { closed: boolean; outline: Pt[] } | null {
  const even = resample(pts, 0.07);
  const len = pathLength(even);
  if (even.length < 3 || len < 0.3) return null;
  const gap = dist(even[0], even[even.length - 1]);
  let ring: Pt[] | null = null;
  if (gap < Math.max(0.22 * len, 0.25) && len > 0.7) {
    ring = even;
  } else {
    const loop = firstLoop(simplify(even, 0.03));
    if (loop && pathLength(loop, true) > 0.55 * len) ring = loop;
  }
  if (ring) {
    let r = dedupe(simplifyRing(ring, 0.045), 0.09, true);
    if (r.length >= 3 && area(r) > 0.04) {
      if (!ringIsSimple(r)) r = hull(r);
      return { closed: true, outline: r };
    }
  }
  const line = dedupe(simplify(even, 0.06), 0.1, false);
  if (line.length < 2) return null;
  return { closed: false, outline: line.slice(0, 14) };
}

function splitConvex(poly: Pt[]): Pt[][] {
  if (poly.length <= MAX_VERTS) return [poly];
  const out: Pt[][] = [];
  for (let i = 1; i < poly.length - 1; i += MAX_VERTS - 2) {
    out.push([poly[0], ...poly.slice(i, Math.min(poly.length, i + MAX_VERTS - 1))]);
  }
  return out;
}

const usable = (p: Pt[]) => p.length >= 3 && area(p) > 0.004;

/** Cut any simple outline into convex pieces of at most eight corners. */
export function convexPieces(ring: Pt[]): Pt[][] {
  let pieces: Pt[][] = [];
  try {
    const poly = ring.map((p) => [p.x, p.y] as [number, number]);
    makeCCW(poly);
    removeCollinearPoints(poly, 0.02);
    if (poly.length >= 3) {
      pieces = quickDecomp(poly)
        .map((q) => q.map(([x, y]) => ({ x, y })))
        .flatMap(splitConvex)
        .filter(usable);
    }
  } catch {
    pieces = [];
  }
  const got = pieces.reduce((s, p) => s + area(p), 0);
  // If the cut lost a real share of the shape, fall back to its hull.
  if (!pieces.length || got < 0.7 * area(ring)) {
    pieces = splitConvex(hull(ring)).filter(usable);
  }
  return pieces;
}

function stickPieces(line: Pt[]): Pt[][] {
  const out: Pt[][] = [];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const d = dist(a, b);
    if (d < 0.05) continue;
    const nx = (-(b.y - a.y) / d) * STICK;
    const ny = ((b.x - a.x) / d) * STICK;
    // Overlap the joints a little so a bent stick has no gaps.
    const ex = ((b.x - a.x) / d) * STICK * 0.6;
    const ey = ((b.y - a.y) / d) * STICK * 0.6;
    out.push([
      { x: a.x - ex + nx, y: a.y - ey + ny },
      { x: b.x + ex + nx, y: b.y + ey + ny },
      { x: b.x + ex - nx, y: b.y + ey - ny },
      { x: a.x - ex - nx, y: a.y - ey - ny },
    ]);
  }
  return out;
}

function touching(a: Raw, b: Raw): boolean {
  if (pathGap(a.outline, a.closed, b.outline, b.closed) < TOUCH) return true;
  if (b.closed && pointInRing(a.outline[0], b.outline)) return true;
  if (a.closed && pointInRing(b.outline[0], a.outline)) return true;
  return false;
}

function inside(a: Raw, b: Raw): boolean {
  return b.closed && a.outline.every((p) => pointInRing(p, b.outline));
}

export function emptyDoodle(): Doodle {
  return { parts: [], groups: 0, box: { minX: 0, minY: 0, maxX: 0, maxY: 0 }, wheels: 0, scale: 1, origin: { x: 0, y: 0 } };
}

/**
 * Turn strokes into a machine. The result is centred on x = 0 with its
 * lowest point at y = 0, in metres, y pointing down.
 */
export function buildDoodle(strokes: Stroke[], normalise = true): Doodle {
  // 1. Scale the whole drawing to a drivable size and stand it on the origin.
  const all = strokes.flatMap((s) => s.pts);
  if (all.length < 2) return emptyDoodle();
  const b0 = bbox(all);
  const size = Math.max(b0.maxX - b0.minX, b0.maxY - b0.minY, 1e-6);
  let scale = 1;
  if (normalise) {
    if (size < MIN_SIZE) scale = MIN_SIZE / size;
    if (size > MAX_SIZE) scale = MAX_SIZE / size;
  }
  const ox = (b0.minX + b0.maxX) / 2;
  const oy = b0.maxY;
  const place = (p: Pt) => ({ x: (p.x - ox) * scale, y: (p.y - oy) * scale });

  // 2. Read each stroke: closed ring or open stick.
  const raws: Raw[] = [];
  strokes.forEach((s, i) => {
    const got = readStroke(s.pts.map(place));
    if (!got) return;
    const h = got.closed ? hull(got.outline) : got.outline;
    raws.push({
      stroke: i,
      color: s.color,
      force: s.force,
      closed: got.closed,
      outline: got.outline,
      hull: h,
      area: got.closed ? area(got.outline) : 0,
      round: got.closed ? roundness(h) : 0,
      long: got.closed ? elongation(h) : 99,
      center: got.closed ? centroid(got.outline) : mean(got.outline),
    });
  });
  if (!raws.length) return emptyDoodle();

  // 3. Decide what each one is.
  const biggest = Math.max(...raws.map((r) => r.area));
  const compact = (r: Raw) => r.closed && r.round >= 0.6 && r.long <= 1.75;
  // Anything closed and clearly smaller than the biggest shape might be a
  // wheel or a window. The biggest shape is always a body.
  const candidate = raws.map((r) => r.closed && r.area <= 0.75 * biggest && r.area < biggest);
  const kinds: Kind[] = raws.map((r) => (r.closed ? "body" : "stick"));
  raws.forEach((r, i) => {
    if (!candidate[i]) return;
    const solids = raws.filter((_, j) => j !== i && !candidate[j]);
    const host = solids.find((s) => inside(r, s));
    // Drawn wholly inside a body: a round one is a wheel, anything else is a window.
    if (host) kinds[i] = r.round >= 0.8 && r.long <= 1.4 ? "wheel" : "deco";
    else if (compact(r) && solids.some((s) => touching(r, s))) kinds[i] = "wheel";
  });
  // A lone round shape is a wheel on its own. It rolls.
  if (raws.length === 1 && raws[0].closed && raws[0].round >= 0.8) kinds[0] = "wheel";
  raws.forEach((r, i) => {
    if (!r.closed || !r.force) return;
    kinds[i] = r.force;
  });

  // 4. Bodies and sticks that touch are welded into one rigid group.
  const parent = raws.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const solid = (i: number) => kinds[i] === "body" || kinds[i] === "stick";
  for (let i = 0; i < raws.length; i++) {
    for (let j = i + 1; j < raws.length; j++) {
      if (solid(i) && solid(j) && touching(raws[i], raws[j])) parent[find(i)] = find(j);
    }
  }
  const groupOf = new Map<number, number>();
  raws.forEach((_, i) => {
    if (solid(i) && !groupOf.has(find(i))) groupOf.set(find(i), groupOf.size);
  });

  // 5. Build the parts.
  const parts: Part[] = raws.map((r, i) => {
    const kind = kinds[i];
    let pieces: Pt[][] = [];
    let circle: Part["circle"] = null;
    let group = -1;
    let center = r.center;
    if (kind === "body") {
      pieces = convexPieces(r.outline);
      group = groupOf.get(find(i))!;
    } else if (kind === "stick") {
      pieces = stickPieces(r.outline);
      group = groupOf.get(find(i))!;
    } else {
      // Wheels and decorations ride on the nearest solid they touch.
      let best = Infinity;
      raws.forEach((s, j) => {
        if (!solid(j) || !touching(r, s)) return;
        const d = dist(r.center, s.center) - (inside(r, s) ? 100 : 0);
        if (d < best) {
          best = d;
          group = groupOf.get(find(j))!;
        }
      });
      if (kind === "wheel") {
        center = centroid(r.hull);
        if (r.round >= 0.86) circle = { c: center, r: meanRadius(resampleRing(r.hull), center) };
        else pieces = splitConvex(dedupe(simplifyRing(r.hull, 0.03), 0.06, true)).filter(usable);
        if (!circle && !pieces.length) circle = { c: center, r: Math.max(0.15, Math.sqrt(r.area / Math.PI)) };
      }
    }
    return {
      stroke: r.stroke,
      kind,
      color: r.color,
      outline: r.outline,
      closed: r.closed,
      pieces,
      circle,
      center,
      radius: r.closed ? meanRadius(r.hull, center) : STICK,
      area: r.closed ? r.area : pathLength(r.outline) * STICK * 2,
      group,
    };
  });

  // A body whose cut failed completely cannot exist. Drop it rather than crash.
  const ok = parts.filter((p) => p.kind === "deco" || p.circle || p.pieces.length);
  return {
    parts: ok,
    groups: groupOf.size,
    box: bbox(ok.flatMap((p) => p.outline)),
    wheels: ok.filter((p) => p.kind === "wheel").length,
    scale,
    origin: { x: ox, y: oy },
  };
}

function resampleRing(ring: Pt[]): Pt[] {
  return resample([...ring, ring[0]], 0.08);
}

/** Which part is under this point, top-most first. Used for tap to flip. */
export function partAt(doodle: Doodle, p: Pt): Part | null {
  for (let i = doodle.parts.length - 1; i >= 0; i--) {
    const part = doodle.parts[i];
    if (part.closed && pointInRing(p, part.outline)) return part;
  }
  return null;
}

