// The courses. Each one is a short recipe of hills, steps, gaps and toys,
// laid out left to right. Pure data plus a small builder.

import type { Pt } from "./geom";

export interface Theme {
  sky: string;
  far: string;
  ground: string;
  sun: string;
  /** Night courses draw stars and light ink. */
  night?: boolean;
}

export type Prop =
  | { type: "seesaw"; x: number; y: number; w: number }
  | { type: "bridge"; x: number; y: number; w: number; y2: number }
  | { type: "crate"; x: number; y: number; s: number };

export interface Course {
  id: string;
  name: string;
  /** One short line shown on the course card. */
  blurb: string;
  theme: Theme;
  gravity: number;
  friction: number;
  /** Ground outlines. Each is an open polyline whose ends drop into the deep. */
  ground: Pt[][];
  props: Prop[];
  finishX: number;
  killY: number;
  /** Seconds for three stars and for two. Finishing at all earns one. */
  stars: [number, number];
}

const DEEP = 40;

class Builder {
  x = -9;
  y = 0;
  pieces: Pt[][] = [];
  cur: Pt[] = [];
  props: Prop[] = [];
  maxY = 0;

  constructor() {
    // A wall behind the start so nothing rolls off the back.
    this.cur.push({ x: this.x, y: -14 }, { x: this.x, y: 0 });
    this.flat(9);
  }

  private add(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.maxY = Math.max(this.maxY, y);
    this.cur.push({ x, y });
  }

  flat(len: number) {
    this.add(this.x + len, this.y);
    return this;
  }

  /** A straight kicker. */
  ramp(len: number, rise: number) {
    this.add(this.x + len, this.y - rise);
    return this;
  }

  /** An eased change of height. Positive rise goes up. */
  slope(len: number, rise: number) {
    const x0 = this.x;
    const y0 = this.y;
    const n = Math.max(4, Math.round(len / 0.6));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      this.add(x0 + len * t, y0 - rise * t * t * (3 - 2 * t));
    }
    return this;
  }

  /** Up and back down. A negative height makes a dip. */
  hill(len: number, h: number) {
    const x0 = this.x;
    const y0 = this.y;
    const n = Math.max(6, Math.round(len / 0.5));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      this.add(x0 + len * t, y0 - (h * (1 - Math.cos(2 * Math.PI * t))) / 2);
    }
    return this;
  }

  bumps(n: number, w: number, h: number) {
    for (let i = 0; i < n; i++) this.hill(w, h);
    return this;
  }

  /** Positive h climbs, negative h descends. */
  steps(n: number, w: number, h: number) {
    for (let i = 0; i < n; i++) {
      this.add(this.x, this.y - h);
      this.add(this.x + w, this.y);
    }
    return this;
  }

  /** A hole. `drop` lowers the far side. */
  gap(w: number, drop = 0) {
    this.cur.push({ x: this.x, y: this.y + DEEP });
    this.pieces.push(this.cur);
    this.x += w;
    this.y += drop;
    this.maxY = Math.max(this.maxY, this.y);
    this.cur = [
      { x: this.x, y: this.y + DEEP },
      { x: this.x, y: this.y },
    ];
    return this;
  }

  seesaw(w: number) {
    this.props.push({ type: "seesaw", x: this.x + w / 2, y: this.y, w });
    return this.gap(w);
  }

  bridge(w: number, drop = 0) {
    // The lips are bevelled so a sagging bridge never ends in a wall.
    this.ramp(0.9, -0.3);
    this.props.push({ type: "bridge", x: this.x, y: this.y, w, y2: this.y + drop });
    this.gap(w, drop);
    return this.ramp(0.9, 0.3);
  }

  crates(cols: number, rows = 2, s = 0.5) {
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows - (c % 2); r++) {
        this.props.push({ type: "crate", x: this.x + 0.6 + c * (s + 0.06), y: this.y - s / 2 - r * s, s });
      }
    }
    return this.flat(cols * (s + 0.06) + 1.2);
  }

  done(): { ground: Pt[][]; props: Prop[]; finishX: number; killY: number } {
    this.flat(3);
    const finishX = this.x;
    this.flat(30);
    this.cur.push({ x: this.x, y: this.y - 14 });
    this.pieces.push(this.cur);
    return { ground: this.pieces, props: this.props, finishX, killY: this.maxY + 7 };
  }
}

type Recipe = (b: Builder) => Builder;

function course(
  id: string,
  name: string,
  blurb: string,
  theme: Theme,
  stars: [number, number],
  recipe: Recipe,
  gravity = 10,
  friction = 0.9,
): Course {
  return { id, name, blurb, theme, gravity, friction, stars, ...recipe(new Builder()).done() };
}

export const COURSES: Course[] = [
  course(
    "sunday-lane",
    "Sunday Lane",
    "A gentle roll to warm up.",
    { sky: "#ffd447", far: "#ffb72e", ground: "#1fb673", sun: "#ff5436" },
    [8, 12],
    (b) => b.hill(10, 0.8).flat(4).hill(12, 1.3).flat(3).hill(10, -1.0).flat(4).hill(8, 1.0),
  ),
  course(
    "hiccup-hills",
    "Hiccup Hills",
    "Up, down, up, down, up.",
    { sky: "#a8e0ff", far: "#74c6f7", ground: "#ff8a3c", sun: "#fff6cf" },
    [11.5, 17],
    (b) =>
      b.bumps(3, 6.5, 0.8).slope(12, 2.4).flat(3).slope(10, -3).hill(12, 1.4).flat(3).bumps(4, 3.5, 0.6),
  ),
  course(
    "the-staircase",
    "The Staircase",
    "Small wheels will regret this.",
    { sky: "#ffc7d6", far: "#ff9fba", ground: "#7a5cff", sun: "#fffbe8" },
    [10, 15],
    (b) =>
      b
        .steps(6, 1.7, 0.22)
        .flat(4)
        .steps(5, 1.5, -0.4)
        .flat(3)
        .hill(8, 1.1)
        .steps(4, 1.5, 0.24)
        .flat(3)
        .slope(10, -1.3),
  ),
  course(
    "mind-the-gap",
    "Mind the Gap",
    "Speed is your friend.",
    { sky: "#bdf3da", far: "#86e0b8", ground: "#ff5a4d", sun: "#ffd447" },
    [8, 12],
    (b) =>
      b
        .slope(14, -3.4)
        .ramp(3, 0.25)
        .gap(2.2, 1.1)
        .flat(7)
        .hill(8, 1.1)
        .slope(12, -3.2)
        .ramp(3, 0.25)
        .gap(2.2, 1.1)
        .flat(4),
  ),
  course(
    "teeter-totter",
    "Teeter Totter",
    "The plank tips when you do.",
    { sky: "#ffeaa8", far: "#ffd56e", ground: "#2a9df4", sun: "#ff5436" },
    [7.5, 12],
    (b) => b.hill(8, 0.9).flat(3).seesaw(6).flat(5).slope(8, 1.4).flat(3).seesaw(7).flat(3).slope(8, -1.4),
  ),
  course(
    "washboard",
    "Washboard",
    "Hold on to your wheels.",
    { sky: "#ffb991", far: "#ff9968", ground: "#22b8a0", sun: "#fff6cf" },
    [11.5, 18],
    (b) =>
      b.bumps(10, 1.6, 0.28).flat(3).crates(4).flat(2).bumps(6, 2.6, 0.4).flat(2).crates(5).bumps(8, 1.3, 0.22),
  ),
  course(
    "wobbly-bridge",
    "Wobbly Bridge",
    "Do not look down.",
    { sky: "#cfc9ff", far: "#aba1ff", ground: "#ff7a3c", sun: "#fffbe8" },
    [9, 14],
    (b) => b.hill(8, 1.1).flat(2).bridge(9).flat(4).slope(8, 1.5).flat(2).bridge(13).flat(3).slope(8, -1.5),
  ),
  course(
    "ice-rink",
    "Ice Rink",
    "Everything is slippery.",
    { sky: "#e3f6ff", far: "#bfe8fb", ground: "#8fd8ff", sun: "#ffd447" },
    [12.5, 19],
    (b) =>
      b.slope(10, -1.4).hill(12, 0.7).flat(5).hill(14, -1.5).flat(4).bumps(4, 5, 0.4).flat(4).slope(14, 0.9),
    10,
    0.03,
  ),
  course(
    "moon-bounce",
    "Moon Bounce",
    "Low gravity. Long, slow jumps.",
    { sky: "#2b2470", far: "#3d3596", ground: "#d9d4f5", sun: "#5ad1ff", night: true },
    [15, 23],
    (b) =>
      b
        .hill(10, 1.4)
        .flat(3)
        .gap(2.8, 1.0)
        .flat(6)
        .bumps(3, 6, 0.8)
        .flat(3)
        .slope(8, -1.2)
        .gap(3.4, 1.3)
        .flat(5)
        .bumps(3, 5, 0.6),
    2.4,
  ),
  course(
    "the-big-one",
    "The Big One",
    "A bit of everything.",
    { sky: "#ff7a59", far: "#ffa07d", ground: "#2447ff", sun: "#ffe14d" },
    [16.5, 26],
    (b) =>
      b
        .bumps(3, 6.5, 0.8)
        .steps(4, 1.6, 0.22)
        .flat(3)
        .seesaw(6)
        .flat(3)
        .slope(12, -3)
        .ramp(3, 0.25)
        .gap(2.3, 1.1)
        .flat(5)
        .crates(4)
        .flat(3)
        .bridge(10)
        .flat(3)
        .hill(13, 1.7)
        .bumps(6, 1.6, 0.28),
  ),
];

/** Height of the ground at x, or null over a hole. */
export function groundAt(c: Course, x: number): number | null {
  for (const piece of c.ground) {
    for (let i = 1; i < piece.length; i++) {
      const a = piece[i - 1];
      const b = piece[i];
      if (b.x > a.x && x >= a.x && x <= b.x) {
        return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
      }
    }
  }
  return null;
}
