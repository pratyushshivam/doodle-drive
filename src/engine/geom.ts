// Small 2D geometry kit for turning finger strokes into shapes.
// Everything here is pure: no DOM, no physics library.

export interface Pt {
  x: number;
  y: number;
}

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

export function pathLength(pts: Pt[], closed = false): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  if (closed && pts.length > 1) l += dist(pts[pts.length - 1], pts[0]);
  return l;
}

/** Signed area. Positive when the points run clockwise on a y-down screen. */
export function signedArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j].x + pts[i].x) * (pts[i].y - pts[j].y);
  }
  return a / 2;
}

export const area = (pts: Pt[]) => Math.abs(signedArea(pts));

export function centroid(pts: Pt[]): Pt {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const f = pts[j].x * pts[i].y - pts[i].x * pts[j].y;
    a += f;
    cx += (pts[j].x + pts[i].x) * f;
    cy += (pts[j].y + pts[i].y) * f;
  }
  if (Math.abs(a) < 1e-9) return mean(pts);
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

export function mean(pts: Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  const n = Math.max(1, pts.length);
  return { x: x / n, y: y / n };
}

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function bbox(pts: Pt[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** Walk the stroke and drop a point every `step`, so fast and slow hands look the same. */
export function resample(pts: Pt[], step: number): Pt[] {
  if (pts.length < 2) return pts.slice();
  const out: Pt[] = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const d = dist(a, b);
    if (d === 0) continue;
    let t = step - carry;
    while (t <= d) {
      out.push({ x: a.x + ((b.x - a.x) * t) / d, y: a.y + ((b.y - a.y) * t) / d });
      t += step;
    }
    carry = d - (t - step);
  }
  const last = pts[pts.length - 1];
  if (dist(out[out.length - 1], last) > step * 0.25) out.push(last);
  return out;
}

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Ramer-Douglas-Peucker on an open polyline. */
export function simplify(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let worst = 0;
    let at = -1;
    for (let i = s + 1; i < e; i++) {
      const d = segDist(pts[i], pts[s], pts[e]);
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (at >= 0 && worst > eps) {
      keep[at] = 1;
      stack.push([s, at], [at, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Simplify a closed ring, anchoring at the two points furthest apart. */
export function simplifyRing(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 5) return pts.slice();
  let far = 0;
  let fd = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[0], pts[i]);
    if (d > fd) {
      fd = d;
      far = i;
    }
  }
  const a = simplify(pts.slice(0, far + 1), eps);
  const b = simplify([...pts.slice(far), pts[0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/**
 * Chaikin corner cutting on a closed ring, for drawing only. Corners sharper
 * than `keep` radians are left alone, so a square stays a square while a
 * wobbly circle becomes smooth.
 */
export function smoothRing(pts: Pt[], rounds = 1, keep = 0.85): Pt[] {
  let p = pts;
  let sharp = pts.map((b, i) => {
    const a = pts[(i + pts.length - 1) % pts.length];
    const c = pts[(i + 1) % pts.length];
    const t = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x);
    return Math.abs(Math.atan2(Math.sin(t), Math.cos(t))) > keep;
  });
  for (let r = 0; r < rounds; r++) {
    const out: Pt[] = [];
    const flags: boolean[] = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      const j = (i + 1) % p.length;
      const b = p[j];
      if (sharp[i]) {
        out.push(a);
        flags.push(true);
      } else {
        out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
        flags.push(false);
      }
      if (!sharp[j]) {
        out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
        flags.push(false);
      }
    }
    p = out;
    sharp = flags;
  }
  return p;
}

export function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
  if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
  return { x: a.x + t * rx, y: a.y + t * ry };
}

/**
 * If a stroke crosses itself, return the loop between the first crossing,
 * with the tails cut off. People overshoot when they close a circle.
 */
export function firstLoop(pts: Pt[]): Pt[] | null {
  for (let i = 0; i < pts.length - 3; i++) {
    for (let j = pts.length - 2; j > i + 1; j--) {
      const x = segmentsCross(pts[i], pts[i + 1], pts[j], pts[j + 1]);
      if (x) return [x, ...pts.slice(i + 1, j + 1)];
    }
  }
  return null;
}

export function ringIsSimple(pts: Pt[]): boolean {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return false;
    }
  }
  return true;
}

export function pointInRing(p: Pt, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function distToPath(p: Pt, path: Pt[], closed: boolean): number {
  let best = Infinity;
  const n = path.length;
  const end = closed ? n : n - 1;
  for (let i = 0; i < end; i++) {
    const d = segDist(p, path[i], path[(i + 1) % n]);
    if (d < best) best = d;
  }
  return best;
}

/** Smallest distance between two outlines. Zero when they cross. */
export function pathGap(a: Pt[], aClosed: boolean, b: Pt[], bClosed: boolean): number {
  const an = aClosed ? a.length : a.length - 1;
  const bn = bClosed ? b.length : b.length - 1;
  for (let i = 0; i < an; i++) {
    for (let j = 0; j < bn; j++) {
      if (segmentsCross(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return 0;
    }
  }
  let best = Infinity;
  for (const p of a) best = Math.min(best, distToPath(p, b, bClosed));
  for (const p of b) best = Math.min(best, distToPath(p, a, aClosed));
  return best;
}

/** Andrew's monotone chain. */
export function hull(pts: Pt[]): Pt[] {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** 1 for a perfect circle, 0.785 for a square, lower for long or spiky shapes. */
export function roundness(ring: Pt[]): number {
  const p = pathLength(ring, true);
  if (p === 0) return 0;
  return (4 * Math.PI * area(ring)) / (p * p);
}

/** Long side over short side of the tightest rotated box, sampled every 10 degrees. */
export function elongation(ring: Pt[]): number {
  let best = Infinity;
  let ratio = 1;
  for (let deg = 0; deg < 90; deg += 10) {
    const c = Math.cos((deg * Math.PI) / 180);
    const s = Math.sin((deg * Math.PI) / 180);
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const p of ring) {
      const u = p.x * c + p.y * s;
      const v = -p.x * s + p.y * c;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const w = maxU - minU;
    const h = maxV - minV;
    if (w * h < best) {
      best = w * h;
      ratio = Math.max(w, h) / Math.max(1e-6, Math.min(w, h));
    }
  }
  return ratio;
}

export function meanRadius(ring: Pt[], c: Pt): number {
  let r = 0;
  for (const p of ring) r += dist(p, c);
  return r / Math.max(1, ring.length);
}

/** Remove points that sit closer than `min` to the one before. */
export function dedupe(pts: Pt[], min: number, closed: boolean): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    if (!out.length || dist(out[out.length - 1], p) >= min) out.push(p);
  }
  while (closed && out.length > 3 && dist(out[0], out[out.length - 1]) < min) out.pop();
  return out;
}
