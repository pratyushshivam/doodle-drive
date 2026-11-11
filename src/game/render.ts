// The world on screen: sky, hills, ground, toys, the machine, dust and confetti.

import type { Body } from "planck";
import { type Course, groundAt } from "../engine/courses";
import type { Sim, SimPart } from "../engine/sim";
import { COLORS, FONT, INK, PAPER, type PartLook, type PartPaths, drawPart, mix, partPaths, rng } from "./ink";

interface Scene {
  fills: Path2D[];
  lines: Path2D[][];
  tufts: Path2D;
  specks: Path2D;
  hills: { amp: number[]; freq: number[]; phase: number[] }[];
  clouds: { x: number; y: number; s: number; v: number }[];
  stars: { x: number; y: number; r: number }[];
  finishY: number;
  /** Trees, bushes and rocks standing along the course. */
  scenery: { x: number; y: number; kind: number; s: number; tilt: number }[];
  /** A signpost every 20 metres. */
  signs: { x: number; y: number; n: number }[];
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
}

interface Confetto {
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  va: number;
  c: string;
  w: number;
}

interface PartDraw {
  paths: PartPaths;
  look: PartLook;
}

export class WorldView {
  ctx: CanvasRenderingContext2D;
  w = 0;
  h = 0;
  dpr = 1;
  ppm = 50;
  cam = { x: 0, y: 0 };
  /** Where on screen the camera's y sits, as a share of the height. */
  anchor = 0.84;
  shake = 0;
  course!: Course;
  private scene!: Scene;
  private particles: Particle[] = [];
  private confetti: Confetto[] = [];
  private cache = new WeakMap<SimPart, PartDraw>();
  private squash = new Map<Body, { s: number; v: number }>();
  private time = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d", { alpha: false })!;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ppm = Math.max(24, Math.min(84, Math.sqrt(this.w * this.h) / 17));
  }

  setCourse(c: Course) {
    this.course = c;
    const r = rng(c.id.length * 7919 + c.finishX * 13);
    const fills: Path2D[] = [];
    const lines: Path2D[][] = [];
    const tufts = new Path2D();
    const specks = new Path2D();
    c.ground.forEach((piece, pi) => {
      const pts = piece.slice();
      // The course sits between two cliffs.
      if (pi === 0) pts.unshift({ x: pts[0].x - 80, y: pts[0].y });
      if (pi === c.ground.length - 1) pts.push({ x: pts[pts.length - 1].x + 80, y: pts[pts.length - 1].y });
      const fill = new Path2D();
      fill.moveTo(pts[0].x, pts[0].y);
      for (const p of pts) fill.lineTo(p.x, p.y);
      fill.lineTo(pts[pts.length - 1].x, 90);
      fill.lineTo(pts[0].x, 90);
      fill.closePath();
      fills.push(fill);
      const two: Path2D[] = [];
      for (let f = 0; f < 2; f++) {
        const line = new Path2D();
        pts.forEach((p, i) => {
          const jx = (r() - 0.5) * 0.03;
          const jy = (r() - 0.5) * 0.03;
          if (i === 0) line.moveTo(p.x + jx, p.y + jy);
          else line.lineTo(p.x + jx, p.y + jy);
        });
        two.push(line);
      }
      lines.push(two);
    });
    // Little marks on and under the surface.
    for (let x = -12; x < c.finishX + 14; x += 0.9 + r() * 1.6) {
      const y = groundAt(c, x);
      if (y === null) continue;
      if (r() < 0.6) {
        const hgt = 0.14 + r() * 0.14;
        tufts.moveTo(x - 0.09, y - hgt * 0.8);
        tufts.lineTo(x, y - 0.02);
        tufts.lineTo(x + 0.1, y - hgt);
      }
      for (let k = 0; k < 2; k++) {
        const sx = x + r() * 1.2;
        const sy = (groundAt(c, sx) ?? y) + 0.7 + r() * 5;
        const len = 0.12 + r() * 0.2;
        specks.moveTo(sx, sy);
        specks.lineTo(sx + len, sy + (r() - 0.5) * 0.06);
      }
    }
    const hills = [0, 1].map(() => ({
      amp: [0.5 + r() * 0.5, 0.2 + r() * 0.3, 0.1 + r() * 0.1],
      freq: [0.004 + r() * 0.004, 0.011 + r() * 0.008, 0.03 + r() * 0.02],
      phase: [r() * 6, r() * 6, r() * 6],
    }));
    const clouds = Array.from({ length: 7 }, () => ({ x: r(), y: 0.06 + r() * 0.3, s: 0.6 + r() * 0.9, v: 0.004 + r() * 0.006 }));
    const stars = Array.from({ length: 70 }, () => ({ x: r(), y: r() * 0.75, r: 0.6 + r() * 1.8 }));
    const scenery: Scene["scenery"] = [];
    for (let x = -7; x < c.finishX + 26; x += 3.5 + r() * 6) {
      const y = groundAt(c, x);
      const y2 = groundAt(c, x + 0.5);
      const y0 = groundAt(c, x - 0.5);
      if (y === null || y2 === null || y0 === null) continue;
      if (Math.abs(y2 - y0) > 0.5 || Math.abs(x - c.finishX) < 2.5 || Math.abs(x) < 1.5) continue;
      scenery.push({ x, y, kind: Math.floor(r() * 3), s: 0.75 + r() * 0.7, tilt: (r() - 0.5) * 0.16 });
    }
    const signs: Scene["signs"] = [];
    for (let n = 20; n < c.finishX - 6; n += 20) {
      const y = groundAt(c, n);
      if (y !== null && groundAt(c, n - 0.6) !== null && groundAt(c, n + 0.6) !== null) signs.push({ x: n, y, n });
    }
    this.scene = { fills, lines, tufts, specks, hills, clouds, stars, finishY: groundAt(c, c.finishX) ?? 0, scenery, signs };
    this.particles = [];
    this.confetti = [];
  }

  /** A puff where something landed or a wheel dug in. */
  puff(x: number, y: number, n: number, speed: number) {
    for (let i = 0; i < n && this.particles.length < 160; i++) {
      const a = -Math.PI * Math.random();
      const v = speed * (0.3 + Math.random());
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v * 0.6,
        life: 0,
        max: 0.35 + Math.random() * 0.4,
        r: 0.07 + Math.random() * 0.12,
      });
    }
  }

  impact(body: Body | null, power: number) {
    this.shake = Math.min(0.28, this.shake + power * 0.012);
    if (!body) return;
    const sq = this.squash.get(body) ?? { s: 0, v: 0 };
    sq.v += Math.min(2.4, power * 0.22);
    this.squash.set(body, sq);
  }

  party() {
    for (let i = 0; i < 110; i++) {
      this.confetti.push({
        x: this.w * (0.2 + Math.random() * 0.6),
        y: this.h * 0.35,
        vx: (Math.random() - 0.5) * 900,
        vy: -300 - Math.random() * 700,
        a: Math.random() * 6,
        va: (Math.random() - 0.5) * 14,
        c: [...COLORS, PAPER, INK][i % 7],
        w: 7 + Math.random() * 9,
      });
    }
  }

  /** Move the camera towards a point. `snap` jumps there. */
  follow(x: number, y: number, anchor: number, dt: number, snap = false) {
    const k = snap ? 1 : 1 - Math.exp(-dt * 4.2);
    this.cam.x += (x - this.cam.x) * k;
    this.cam.y += (y - this.cam.y) * (snap ? 1 : 1 - Math.exp(-dt * 2.6));
    this.anchor += (anchor - this.anchor) * (snap ? 1 : 1 - Math.exp(-dt * 5));
  }

  draw(sim: Sim | null, dt: number) {
    this.time += dt;
    const { ctx, w, h, dpr, ppm } = this;
    const c = this.course;
    const th = c.theme;
    const sc = this.scene;
    const boil = Math.floor(this.time * 7) % 2;
    this.shake *= Math.exp(-dt * 9);
    const sx = (Math.random() - 0.5) * this.shake * ppm;
    const sy = (Math.random() - 0.5) * this.shake * ppm;
    const ox = w / 2 - this.cam.x * ppm + sx;
    const oy = h * this.anchor - this.cam.y * ppm + sy;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = th.sky;
    ctx.fillRect(0, 0, w, h);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const line = th.night ? "#0f0c2e" : INK;

    if (th.night) {
      ctx.fillStyle = PAPER;
      for (const s of sc.stars) {
        const px = (((s.x * w * 1.6 - this.cam.x * 2) % (w * 1.6)) + w * 1.6) % (w * 1.6);
        ctx.beginPath();
        ctx.arc(px, s.y * h, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Sun, printed slightly off register.
    const sunR = Math.min(w, h) * 0.13;
    const sunX = w * 0.76 - this.cam.x * 0.6;
    const sunY = h * 0.2 - this.cam.y * 0.3;
    ctx.fillStyle = th.sun;
    ctx.beginPath();
    ctx.arc(sunX + 5, sunY + 5, sunR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = line;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    ctx.stroke();
    if (!th.night) {
      // Rays that turn slowly, drawn like pen ticks.
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + this.time * 0.12;
        const r1 = sunR * (1.16 + (i % 2) * 0.05);
        const r2 = sunR * (1.3 + (i % 2) * 0.14);
        ctx.moveTo(sunX + Math.cos(a) * r1, sunY + Math.sin(a) * r1);
        ctx.lineTo(sunX + Math.cos(a) * r2, sunY + Math.sin(a) * r2);
      }
      ctx.stroke();
    }

    // Two rows of far hills.
    sc.hills.forEach((hl, i) => {
      const par = 0.1 + i * 0.16;
      const base = h * (0.5 + i * 0.1) - this.cam.y * ppm * par * 0.5 + (this.anchor - 0.64) * h * 0.5;
      ctx.fillStyle = i === 0 ? mix(th.sky, th.far, 0.55) : th.far;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let px = 0; px <= w + 16; px += 16) {
        const x = px + this.cam.x * ppm * par;
        let y = 0;
        for (let k = 0; k < 3; k++) y += hl.amp[k] * Math.sin(x * hl.freq[k] + hl.phase[k]);
        ctx.lineTo(px, base - y * h * 0.11);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    });

    // Clouds.
    for (const cl of sc.clouds) {
      const span = w + 400;
      const px = ((((cl.x + this.time * cl.v) * span - this.cam.x * 9) % span) + span) % span - 200;
      const py = cl.y * h;
      const s = cl.s * Math.min(1.2, w / 700);
      const blob = (dx: number, dy: number) => {
        ctx.beginPath();
        ctx.ellipse(px + dx, py + dy, 62 * s, 22 * s, 0, 0, Math.PI * 2);
        ctx.ellipse(px + dx - 24 * s, py + dy - 14 * s, 30 * s, 22 * s, 0, 0, Math.PI * 2);
        ctx.ellipse(px + dx + 20 * s, py + dy - 20 * s, 36 * s, 28 * s, 0, 0, Math.PI * 2);
      };
      if (th.night) {
        ctx.fillStyle = "rgba(255,255,255,0.14)";
        blob(0, 0);
        ctx.fill();
      } else {
        // Shadow off register, then an ink edge around the whole cloud, then the white.
        ctx.fillStyle = mix(th.sky, th.far, 0.9);
        blob(5, 6);
        ctx.fill();
        ctx.strokeStyle = line;
        ctx.lineWidth = 5.5;
        blob(0, 0);
        ctx.stroke();
        ctx.fillStyle = "#fffdf6";
        ctx.fill();
      }
    }

    // The world, in metres.
    ctx.setTransform(dpr * ppm, 0, 0, dpr * ppm, dpr * ox, dpr * oy);
    const left = (0 - ox) / ppm - 2;
    const right = (w - ox) / ppm + 2;

    // Seesaw stands sit behind the ground line.
    if (sim) {
      for (const p of sim.props) {
        if (p.kind !== "seesaw" || !p.pivot) continue;
        ctx.fillStyle = PAPER;
        ctx.strokeStyle = line;
        ctx.lineWidth = 0.08;
        ctx.beginPath();
        ctx.moveTo(p.pivot.x, p.pivot.y - 0.05);
        ctx.lineTo(p.pivot.x - 0.7, p.pivot.y + 9);
        ctx.lineTo(p.pivot.x + 0.7, p.pivot.y + 9);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    this.drawScenery(line, left, right);

    sc.fills.forEach((fill, i) => {
      ctx.fillStyle = th.ground;
      ctx.fill(fill);
      ctx.save();
      ctx.clip(fill);
      ctx.strokeStyle = "rgba(23,21,15,0.08)";
      ctx.lineWidth = 3.6;
      ctx.stroke(sc.lines[i][0]);
      ctx.strokeStyle = th.ground;
      ctx.lineWidth = 2.3;
      ctx.stroke(sc.lines[i][0]);
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 0.9;
      ctx.stroke(sc.lines[i][0]);
      ctx.strokeStyle = "rgba(23,21,15,0.2)";
      ctx.lineWidth = 0.045;
      ctx.stroke(sc.specks);
      ctx.restore();
      ctx.strokeStyle = line;
      ctx.lineWidth = 0.11;
      ctx.stroke(sc.lines[i][boil]);
    });
    ctx.strokeStyle = line;
    ctx.lineWidth = 0.05;
    ctx.stroke(sc.tufts);

    this.drawFlag(line);

    if (sim) {
      for (const p of sim.props) {
        const pos = p.body.getPosition();
        if (pos.x < left - 8 || pos.x > right + 8) continue;
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(p.body.getAngle());
        ctx.fillStyle = p.kind === "crate" ? PAPER : "#f4b860";
        ctx.strokeStyle = line;
        ctx.lineWidth = 0.07;
        ctx.beginPath();
        ctx.rect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.fill();
        ctx.stroke();
        if (p.kind === "crate") {
          ctx.lineWidth = 0.045;
          ctx.beginPath();
          ctx.moveTo(-p.w / 2, -p.h / 2);
          ctx.lineTo(p.w / 2, p.h / 2);
          ctx.moveTo(p.w / 2, -p.h / 2);
          ctx.lineTo(-p.w / 2, p.h / 2);
          ctx.stroke();
        }
        ctx.restore();
      }
      this.drawDoodle(sim, dt, boil);
    }

    // Dust.
    const g = c.gravity;
    this.particles = this.particles.filter((p) => (p.life += dt) < p.max);
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += g * 0.12 * dt;
      p.vx *= 1 - dt * 2;
      const k = 1 - p.life / p.max;
      ctx.fillStyle = PAPER;
      ctx.strokeStyle = line;
      ctx.lineWidth = 0.04;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.5 + k), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Confetti, in screen pixels.
    if (this.confetti.length) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.confetti = this.confetti.filter((f) => f.y < h + 40);
      for (const f of this.confetti) {
        f.vy += 1500 * dt;
        f.vx *= 1 - dt * 1.2;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.a += f.va * dt;
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(f.a);
        ctx.fillStyle = f.c;
        ctx.fillRect(-f.w / 2, -f.w / 4, f.w, f.w / 2);
        ctx.restore();
      }
    }
  }

  /** Trees, bushes, rocks and distance signs. They stand behind the ground line. */
  private drawScenery(line: string, left: number, right: number) {
    const { ctx } = this;
    const th = this.course.theme;
    const bare = !!th.night || this.course.friction < 0.2;
    const leaf = th.night ? "#b9b2ea" : mix(th.ground, "#17150f", 0.1);
    const light = "rgba(255,255,255,0.35)";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const it of this.scene.scenery) {
      if (it.x < left - 3 || it.x > right + 3) continue;
      const sway = Math.sin(this.time * 1.3 + it.x) * 0.025;
      ctx.save();
      ctx.translate(it.x, it.y + 0.12);
      ctx.scale(it.s, it.s);
      ctx.rotate(it.tilt + sway);
      ctx.strokeStyle = line;
      ctx.fillStyle = leaf;
      if (bare && it.kind !== 1) {
        // A rock.
        ctx.lineWidth = 0.08;
        ctx.beginPath();
        ctx.moveTo(-0.6, 0);
        ctx.lineTo(-0.42, -0.5);
        ctx.lineTo(0.1, -0.72);
        ctx.lineTo(0.55, -0.38);
        ctx.lineTo(0.68, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (it.kind === 0) {
        // A lollipop tree.
        ctx.lineWidth = 0.13;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -1.9);
        ctx.stroke();
        ctx.lineWidth = 0.08;
        ctx.beginPath();
        ctx.arc(0, -2.3, 0.85, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = light;
        ctx.lineWidth = 0.14;
        ctx.beginPath();
        ctx.arc(0, -2.3, 0.55, Math.PI * 1.05, Math.PI * 1.55);
        ctx.stroke();
      } else if (it.kind === 1) {
        // A pine.
        ctx.lineWidth = 0.13;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -0.7);
        ctx.stroke();
        ctx.lineWidth = 0.08;
        ctx.beginPath();
        ctx.moveTo(-0.75, -0.6);
        ctx.lineTo(0, -2.9);
        ctx.lineTo(0.75, -0.6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = light;
        ctx.lineWidth = 0.12;
        ctx.beginPath();
        ctx.moveTo(-0.32, -1.0);
        ctx.lineTo(0, -2.1);
        ctx.stroke();
      } else {
        // A bush: three humps under one outline.
        const humps = () => {
          ctx.beginPath();
          ctx.arc(-0.42, -0.3, 0.42, 0, Math.PI * 2);
          ctx.moveTo(0.66, -0.5);
          ctx.arc(0.1, -0.5, 0.56, 0, Math.PI * 2);
          ctx.moveTo(0.98, -0.28);
          ctx.arc(0.58, -0.28, 0.4, 0, Math.PI * 2);
        };
        ctx.lineWidth = 0.16;
        humps();
        ctx.stroke();
        ctx.fill();
      }
      ctx.restore();
    }
    for (const sg of this.scene.signs) {
      if (sg.x < left - 3 || sg.x > right + 3) continue;
      ctx.save();
      ctx.translate(sg.x, sg.y + 0.1);
      ctx.rotate(-0.04);
      ctx.strokeStyle = line;
      ctx.lineWidth = 0.1;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -1.5);
      ctx.stroke();
      ctx.fillStyle = PAPER;
      ctx.lineWidth = 0.07;
      ctx.beginPath();
      ctx.roundRect(-0.62, -2.05, 1.24, 0.72, 0.12);
      ctx.fill();
      ctx.stroke();
      ctx.scale(0.01, 0.01);
      ctx.fillStyle = INK;
      ctx.font = `800 44px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${sg.n} m`, 0, -167);
      ctx.restore();
    }
  }

  private drawFlag(line: string) {
    const { ctx } = this;
    const x = this.course.finishX;
    const y = this.scene.finishY;
    const top = y - 3.4;
    ctx.strokeStyle = line;
    ctx.lineWidth = 0.12;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, top);
    ctx.stroke();
    const cols = 6;
    const rows = 4;
    const cw = 0.34;
    const ch = 0.3;
    const wave = (i: number) => Math.sin(this.time * 5 - i * 0.9) * 0.07 * i * 0.5;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        ctx.fillStyle = (i + j) % 2 ? PAPER : INK;
        ctx.beginPath();
        ctx.moveTo(x + i * cw, top + j * ch + wave(i));
        ctx.lineTo(x + (i + 1) * cw, top + j * ch + wave(i + 1));
        ctx.lineTo(x + (i + 1) * cw, top + (j + 1) * ch + wave(i + 1));
        ctx.lineTo(x + i * cw, top + (j + 1) * ch + wave(i));
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    for (let i = 0; i <= cols; i++) ctx.lineTo(x + i * cw, top + wave(i));
    for (let i = cols; i >= 0; i--) ctx.lineTo(x + i * cw, top + rows * ch + wave(i));
    ctx.closePath();
    ctx.stroke();
  }

  private drawDoodle(sim: Sim, dt: number, boil: number) {
    const { ctx } = this;
    for (const sq of this.squash.values()) {
      // A quick damped spring: hit, squash, recover.
      sq.v += (-sq.s * 260 - sq.v * 16) * dt;
      sq.s += sq.v * dt;
    }
    const order = (p: SimPart) => (p.part.kind === "wheel" ? 2 : p.part.kind === "deco" ? 1 : 0);
    const parts = sim.parts.slice().sort((a, b) => order(a) - order(b));
    for (const pass of [0, 1] as const) {
      for (const sp of parts) {
        let d = this.cache.get(sp);
        if (!d) {
          const wheel = sp.part.kind === "wheel";
          d = {
            paths: partPaths(sp.local, sp.part.closed, sp.part.stroke + 1),
            look: {
              kind: sp.part.kind,
              color: sp.part.color,
              closed: sp.part.closed,
              radius: sp.part.circle ? sp.part.circle.r : sp.part.radius,
              cx: wheel ? 0 : 0,
              cy: 0,
            },
          };
          this.cache.set(sp, d);
        }
        const pos = sp.body.getPosition();
        const s = Math.max(-0.16, Math.min(0.16, this.squash.get(sp.body)?.s ?? 0));
        ctx.save();
        ctx.translate(pos.x, pos.y);
        if (s) ctx.scale(1 + s * 0.7, 1 - s);
        ctx.rotate(sp.body.getAngle());
        drawPart(ctx, d.look, d.paths.frames[boil], pass);
        ctx.restore();
      }
    }
  }

  /** Dust from wheels that are pushing against the ground. */
  wheelDust(sim: Sim, input: number) {
    if (!input) return;
    for (const sp of sim.parts) {
      if (sp.part.kind !== "wheel" || !sp.grounded) continue;
      const r = sp.part.circle ? sp.part.circle.r : sp.part.radius;
      const slip = Math.abs(sp.body.getAngularVelocity()) * r;
      if (slip > 2 && Math.random() < Math.min(0.5, slip * 0.035)) {
        const p = sp.body.getPosition();
        this.puff(p.x - input * r * 0.6, p.y + r * 0.9, 1, 1.6);
        const last = this.particles[this.particles.length - 1];
        if (last) last.vx = -input * (1 + Math.random() * 2);
      }
    }
  }

  reset() {
    this.particles = [];
    this.confetti = [];
    this.squash.clear();
    this.shake = 0;
  }
}
