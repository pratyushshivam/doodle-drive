import { describe, expect, it } from "vitest";
import { COURSES } from "../src/engine/courses";
import { type Stroke, buildDoodle } from "../src/engine/doodle";
import { Sim } from "../src/engine/sim";
import { ODDITIES, STARTERS } from "../src/engine/starters";

function drive(courseIndex: number, strokes: Stroke[], limit = 60) {
  const sim = new Sim(COURSES[courseIndex], buildDoodle(strokes));
  while (sim.t < limit && !sim.finished && !sim.fell) sim.step(1);
  return sim;
}

describe("every course can be finished by holding Go", () => {
  const small = ODDITIES.find((o) => o.id === "small-car")!;
  for (const s of [...STARTERS, small]) {
    it(`${s.name} finishes all ten`, () => {
      const failed = COURSES.filter((_, i) => !drive(i, s.strokes).finished).map((c) => c.name);
      expect(failed).toEqual([]);
    });
  }
  it("square wheels are slow but get through most of them", () => {
    const times = COURSES.map((_, i) => drive(i, ODDITIES[0].strokes));
    expect(times.filter((t) => t.finished).length).toBeGreaterThanOrEqual(8);
    const buggy = drive(0, STARTERS[0].strokes).finishT;
    expect(times[0].finishT).toBeGreaterThan(buggy * 1.5);
  });
  it("three stars are within reach of a starter doodle, and one star is not automatic", () => {
    COURSES.forEach((c, i) => {
      const best = Math.min(...STARTERS.map((s) => drive(i, s.strokes).finishT));
      expect(best).toBeLessThanOrEqual(c.stars[0]);
      expect(c.stars[1]).toBeGreaterThan(c.stars[0]);
    });
  });
});

describe("bad ideas still do something", () => {
  it("a tower, one wheel and a brick never blow up", () => {
    for (const s of ODDITIES.filter((o) => o.id !== "small-car")) {
      const sim = drive(0, s.strokes, 12);
      const p = sim.lead!.getPosition();
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      expect(Math.abs(p.y)).toBeLessThan(30);
      console.log(s.name, "went", sim.distance().toFixed(1), "m");
    }
  });
});
