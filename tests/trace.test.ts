import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { COURSES } from "../src/engine/courses";
import { buildDoodle } from "../src/engine/doodle";
import { Sim } from "../src/engine/sim";
import { ODDITIES, STARTERS } from "../src/engine/starters";

// A tuning aid, skipped unless asked for:
// DD=course:doodle npx vitest run tests/trace.test.ts   (writes debug.out.txt)
const want = process.env.DD;
it.skipIf(!want)("trace", () => {
  const out: string[] = [];
  const [c, d] = want!.split(":");
  const course = COURSES.find((x) => x.id.includes(c))!;
  const s = [...STARTERS, ...ODDITIES].find((x) => x.id.includes(d))!;
  const doodle = buildDoodle(s.strokes);
  out.push(
    doodle.parts
      .map((p) => `${p.kind} g${p.group} a${p.area.toFixed(2)} r${p.radius.toFixed(2)} ${p.circle ? "circle" : p.pieces.length + "pc"}`)
      .join(" | "),
  );
  const sim = new Sim(course, doodle);
  const wheels = sim.parts.filter((p) => p.part.kind === "wheel").map((p) => `T${p.torque.toFixed(0)} w${p.speed.toFixed(1)}`);
  out.push(`mass ${sim.mass.toFixed(1)} finish ${course.finishX} ${wheels.join(" ")}`);
  let n = 0;
  while (sim.t < 40 && !sim.finished && !sim.fell) {
    sim.step(1);
    if (n++ % 30 === 0) {
      const b = sim.lead!;
      const p = b.getPosition();
      const v = b.getLinearVelocity();
      out.push(
        `t${sim.t.toFixed(1)} x${p.x.toFixed(1)} y${p.y.toFixed(1)} vx${v.x.toFixed(1)} vy${v.y.toFixed(1)} a${((b.getAngle() * 180) / Math.PI).toFixed(0)}`,
      );
    }
  }
  out.push(sim.finished ? `FINISHED ${sim.finishT.toFixed(1)}` : sim.fell ? "FELL" : "STUCK");
  writeFileSync("debug.out.txt", out.join("\n"));
});

it.skipIf(!process.env.TIMES)("times", () => {
  const rows = COURSES.map((c, i) => {
    const t = [...STARTERS, ODDITIES[0]].map((s) => {
      const sim = new Sim(COURSES[i], buildDoodle(s.strokes));
      while (sim.t < 60 && !sim.finished && !sim.fell) sim.step(1);
      return sim.finished ? sim.finishT.toFixed(1) : "--";
    });
    return `${c.name.padEnd(16)} ${t.join("  ")}  stars ${c.stars.join("/")}`;
  });
  writeFileSync("debug.out.txt", rows.join(String.fromCharCode(10)));
});
