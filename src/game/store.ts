// Progress lives in localStorage and nowhere else. Private windows and
// blocked storage make every call here throw, so each one is wrapped.

import type { Stroke } from "../engine/doodle";

export interface Best {
  time: number;
  stars: number;
}

export interface Saved {
  best: Record<string, Best>;
  muted: boolean;
  /** The player has drawn at least once, so the example can stay away. */
  drawn: boolean;
  /** The player has held Go at least once. */
  driven: boolean;
  course: number;
  strokes: Stroke[];
}

const KEY = "doodle-drive:v1";

const fresh = (): Saved => ({ best: {}, muted: false, drawn: false, driven: false, course: 0, strokes: [] });

export function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const s = JSON.parse(raw) as Partial<Saved>;
    return {
      ...fresh(),
      ...s,
      best: s.best && typeof s.best === "object" ? s.best : {},
      strokes: Array.isArray(s.strokes) ? s.strokes.filter((k) => Array.isArray(k?.pts)) : [],
    };
  } catch {
    return fresh();
  }
}

export function save(s: Saved) {
  try {
    // Round the strokes so a big doodle stays a small string.
    const strokes = s.strokes.slice(0, 40).map((k) => ({
      ...k,
      pts: k.pts.map((p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 })),
    }));
    localStorage.setItem(KEY, JSON.stringify({ ...s, strokes }));
  } catch {
    /* storage is off: the game still works, it just forgets */
  }
}
