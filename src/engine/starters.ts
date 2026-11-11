// Three ready-made doodles for anyone shy about drawing, and a few odd
// ones the tests use. Written as strokes, exactly as a finger would make them.

import type { Stroke } from "./doodle";
import type { Pt } from "./geom";

type XY = [number, number];

function trace(pts: XY[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const n = Math.max(2, Math.round(Math.hypot(bx - ax, by - ay) / 0.1));
    for (let k = 0; k < n; k++) out.push({ x: ax + ((bx - ax) * k) / n, y: ay + ((by - ay) * k) / n });
  }
  const [lx, ly] = pts[pts.length - 1];
  out.push({ x: lx, y: ly });
  return out;
}

const ring = (pts: XY[], color: number): Stroke => ({ pts: trace([...pts, pts[0]]), color });
const line = (pts: XY[], color: number): Stroke => ({ pts: trace(pts), color });

function circle(cx: number, cy: number, r: number, color: number, wobble = 0.04): Stroke {
  const pts: Pt[] = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2.04 - 1.2;
    const rr = r * (1 + wobble * Math.sin(a * 3 + cx));
    pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  return { pts, color };
}

export interface Starter {
  id: string;
  name: string;
  strokes: Stroke[];
}

export const STARTERS: Starter[] = [
  {
    id: "buggy",
    name: "Buggy",
    strokes: [
      ring(
        [
          [-2.1, -0.55],
          [-2.15, -1.25],
          [-1.1, -1.4],
          [-0.55, -2.15],
          [0.85, -2.2],
          [1.35, -1.45],
          [2.15, -1.2],
          [2.2, -0.5],
        ],
        0,
      ),
      circle(-1.25, -0.45, 0.58, 0),
      circle(1.3, -0.45, 0.58, 0),
      ring(
        [
          [-0.35, -1.95],
          [0.6, -1.98],
          [0.95, -1.5],
          [-0.6, -1.48],
        ],
        2,
      ),
    ],
  },
  {
    id: "banana",
    name: "Banana",
    strokes: [
      ring(
        [
          [-2.3, -1.9],
          [-1.9, -1.0],
          [-0.9, -0.45],
          [0.5, -0.4],
          [1.6, -0.9],
          [2.3, -1.9],
          [2.0, -2.0],
          [1.3, -1.35],
          [0.3, -1.05],
          [-0.8, -1.1],
          [-1.6, -1.55],
          [-2.05, -2.1],
        ],
        1,
      ),
      circle(-1.0, -0.35, 0.5, 1),
      circle(1.0, -0.4, 0.62, 1),
    ],
  },
  {
    id: "tractor",
    name: "Tractor",
    strokes: [
      ring(
        [
          [-1.6, -1.1],
          [-1.6, -3.0],
          [-0.1, -3.0],
          [0.0, -2.0],
          [2.5, -1.9],
          [2.6, -0.9],
        ],
        3,
      ),
      circle(-1.25, -0.95, 0.98, 3),
      circle(2.0, -0.6, 0.55, 3),
      line(
        [
          [1.3, -1.95],
          [1.35, -3.0],
        ],
        4,
      ),
    ],
  },
];

/** Not offered in the interface. The tests drive these to make sure bad ideas still move. */
export const ODDITIES: Starter[] = [
  {
    id: "square-wheels",
    name: "Square wheels",
    strokes: [
      ring(
        [
          [-1.8, -0.9],
          [-1.8, -1.9],
          [1.8, -1.9],
          [1.8, -0.9],
        ],
        0,
      ),
      ring(
        [
          [-1.7, -0.1],
          [-1.7, -1.1],
          [-0.7, -1.1],
          [-0.7, -0.1],
        ],
        0,
      ),
      ring(
        [
          [0.7, -0.1],
          [0.7, -1.1],
          [1.7, -1.1],
          [1.7, -0.1],
        ],
        0,
      ),
    ],
  },
  {
    id: "tower",
    name: "Tower",
    strokes: [
      ring(
        [
          [-0.9, -0.6],
          [-0.7, -4.6],
          [0.6, -4.7],
          [0.9, -0.6],
        ],
        2,
      ),
      circle(-0.8, -0.45, 0.45, 2),
      circle(0.8, -0.45, 0.45, 2),
    ],
  },
  {
    id: "unicycle",
    name: "One wheel",
    strokes: [circle(0, -1, 1, 1)],
  },
  {
    id: "brick",
    name: "No wheels",
    strokes: [
      ring(
        [
          [-1.5, 0],
          [-1.5, -1.2],
          [1.5, -1.2],
          [1.5, 0],
        ],
        0,
      ),
    ],
  },
];
