import { describe, expect, it } from "vitest";
import { buildDoodle, convexPieces } from "../src/engine/doodle";
import { area } from "../src/engine/geom";
import { ODDITIES, STARTERS } from "../src/engine/starters";

const kinds = (id: string) => {
  const s = [...STARTERS, ...ODDITIES].find((x) => x.id === id)!;
  return buildDoodle(s.strokes).parts.map((p) => p.kind);
};

describe("reading a doodle", () => {
  it("sees a body, two wheels and a window in the buggy", () => {
    expect(kinds("buggy")).toEqual(["body", "wheel", "wheel", "deco"]);
  });
  it("keeps a stick as a stick", () => {
    expect(kinds("tractor")).toEqual(["body", "wheel", "wheel", "stick"]);
  });
  it("lets squares be wheels when they hang off a body", () => {
    const d = buildDoodle(ODDITIES[0].strokes);
    expect(d.parts.map((p) => p.kind)).toEqual(["body", "wheel", "wheel"]);
    expect(d.parts[1].circle).toBeNull();
    expect(d.parts[1].pieces.length).toBeGreaterThan(0);
  });
  it("rolls round wheels as true circles", () => {
    const d = buildDoodle(STARTERS[0].strokes);
    expect(d.parts[1].circle).not.toBeNull();
  });
  it("turns a lone circle into a wheel and a lone box into a body", () => {
    expect(kinds("unicycle")).toEqual(["wheel"]);
    expect(kinds("brick")).toEqual(["body"]);
  });
  it("mounts every wheel on the body it overlaps", () => {
    for (const s of STARTERS) {
      const d = buildDoodle(s.strokes);
      for (const p of d.parts) if (p.kind === "wheel") expect(p.group).toBe(0);
    }
  });
  it("scales a tiny drawing up and a huge one down", () => {
    const times = (k: number) =>
      STARTERS[0].strokes.map((s) => ({ ...s, pts: s.pts.map((p) => ({ x: p.x * k, y: p.y * k })) }));
    const tiny = buildDoodle(times(0.1));
    expect(tiny.box.maxX - tiny.box.minX).toBeGreaterThan(2.5);
    const huge = buildDoodle(times(9));
    expect(huge.box.maxX - huge.box.minX).toBeLessThan(5.3);
  });
  it("ignores dots and survives rubbish", () => {
    expect(buildDoodle([{ pts: [{ x: 0, y: 0 }], color: 0 }]).parts).toEqual([]);
    expect(buildDoodle([]).parts).toEqual([]);
    const scribble = {
      color: 0,
      pts: Array.from({ length: 200 }, (_, i) => ({ x: Math.sin(i * 1.7) * 2, y: Math.cos(i * 2.3) * 2 })),
    };
    expect(() => buildDoodle([scribble])).not.toThrow();
  });
});

describe("cutting a hollow shape into convex pieces", () => {
  it("keeps the area of a banana", () => {
    const banana = buildDoodle(STARTERS[1].strokes).parts[0];
    const cut = banana.pieces.reduce((s, p) => s + area(p), 0);
    expect(banana.pieces.length).toBeGreaterThan(1);
    expect(cut / banana.area).toBeGreaterThan(0.9);
    expect(cut / banana.area).toBeLessThan(1.1);
    for (const p of banana.pieces) expect(p.length).toBeLessThanOrEqual(8);
  });
  it("leaves a square alone", () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    expect(convexPieces(sq).length).toBe(1);
  });
});
