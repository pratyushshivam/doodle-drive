// The physics. A course and a doodle go in; a planck.js world comes out,
// stepped at a fixed rate. No DOM here, so the same code runs in the browser
// and in the tests that check every course can be finished.

import { type Body, Box, Chain, Circle, Polygon, RevoluteJoint, Vec2, WheelJoint, World } from "planck";
import { type Course, type Prop, groundAt } from "./courses";
import type { Doodle, Part } from "./doodle";
import type { Pt } from "./geom";

export const STEP = 1 / 60;

const GROUND = 1;
const BODY = 2;
const WHEEL = 4;
const PROP = 8;

/** Top speed the wheels aim for, in metres per second. */
const TOP_SPEED = 9.5;
/** Stiffness of the sprung axles, in hertz. */
const SPRING_HZ = 6;
/** Motor strength, as a share of the machine's weight times the wheel radius. */
const TORQUE = 0.8;

export interface SimPart {
  part: Part;
  body: Body;
  /** The drawn outline in the body's own frame. */
  local: Pt[];
  joint: WheelJoint | null;
  /** True while a wheel touches the ground or a toy. */
  grounded: boolean;
  torque: number;
  speed: number;
}

export interface SimProp {
  kind: "plank" | "crate" | "seesaw";
  body: Body;
  w: number;
  h: number;
  /** Seesaw pivot, for drawing the stand. */
  pivot?: Pt;
}

export interface Hit {
  x: number;
  y: number;
  power: number;
  wheel: boolean;
}

export class Sim {
  world: World;
  parts: SimPart[] = [];
  props: SimProp[] = [];
  hits: Hit[] = [];
  lead: Body | null = null;
  t = 0;
  startX = 0;
  maxX = 0;
  /** Time of the last real gain in distance. The interface uses it to notice a stuck machine. */
  lastGain = 0;
  finished = false;
  finishT = 0;
  fell = false;
  mass = 0;

  constructor(
    readonly course: Course,
    readonly doodle: Doodle,
  ) {
    this.world = new World({ gravity: Vec2(0, course.gravity) });
    this.buildGround();
    for (const p of course.props) this.buildProp(p);
    this.buildDoodle();
    this.world.on("post-solve", (contact, impulse) => {
      const p = impulse.normalImpulses[0] ?? 0;
      if (p < 1.2) return;
      const fa = contact.getFixtureA();
      const fb = contact.getFixtureB();
      const ca = fa.getFilterCategoryBits();
      const cb = fb.getFilterCategoryBits();
      if (!((ca | cb) & (BODY | WHEEL))) return;
      const wm = contact.getWorldManifold(null);
      if (!wm || !wm.pointCount) return;
      this.hits.push({ x: wm.points[0].x, y: wm.points[0].y, power: p, wheel: !!((ca | cb) & WHEEL) });
    });
  }

  private buildGround() {
    const g = this.world.createBody();
    for (const piece of this.course.ground) {
      g.createFixture({
        shape: new Chain(piece.map((p) => Vec2(p.x, p.y))),
        friction: this.course.friction,
        filterCategoryBits: GROUND,
      });
    }
    this.ground = g;
  }
  private ground!: Body;

  private buildProp(p: Prop) {
    const filter = { filterCategoryBits: PROP, filterMaskBits: GROUND | BODY | WHEEL | PROP };
    if (p.type === "crate") {
      const b = this.world.createBody({ type: "dynamic", position: Vec2(p.x, p.y) });
      b.createFixture({ shape: new Box(p.s / 2, p.s / 2), density: 0.12, friction: 0.4, restitution: 0.1, ...filter });
      this.props.push({ kind: "crate", body: b, w: p.s, h: p.s });
      return;
    }
    if (p.type === "seesaw") {
      const lift = 0.55;
      const half = p.w / 2 + 0.9;
      const th = 0.16;
      const pivot = Vec2(p.x, p.y - lift);
      const b = this.world.createBody({ type: "dynamic", position: pivot, angularDamping: 1.2 });
      b.createFixture({ shape: new Box(half, th / 2), density: 0.5, friction: 1, ...filter });
      const tilt = Math.asin((lift - th / 2) / half);
      this.world.createJoint(
        new RevoluteJoint({ enableLimit: true, lowerAngle: -tilt - 0.03, upperAngle: tilt + 0.03 }, this.ground, b, pivot),
      );
      // Start with the near end down so the machine can drive on.
      b.setAngle(-tilt);
      this.props.push({ kind: "seesaw", body: b, w: half * 2, h: th, pivot: { x: p.x, y: p.y - lift } });
      return;
    }
    // A plank bridge hung between the two lips. Under it runs an unseen
    // net, so a heavy machine makes the bridge sag but never tears through.
    const net: Vec2[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      net.push(Vec2(p.x + p.w * t, p.y + (p.y2 - p.y) * t + 0.14 + 0.5 * 4 * t * (1 - t)));
    }
    this.ground.createFixture({ shape: new Chain(net), friction: 0.9, filterCategoryBits: GROUND, filterMaskBits: PROP });
    const n = Math.max(3, Math.round(p.w / 0.95));
    const dx = p.w / n;
    const dy = (p.y2 - p.y) / n;
    const len = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);
    const th = 0.14;
    let prev = this.ground;
    for (let i = 0; i < n; i++) {
      const b = this.world.createBody({
        type: "dynamic",
        position: Vec2(p.x + dx * (i + 0.5), p.y + dy * (i + 0.5) + th / 2),
        angle: ang,
        angularDamping: 0.6,
        linearDamping: 0.15,
      });
      b.createFixture({ shape: new Box(len / 2, th / 2), density: 1.1, friction: 1, ...filter });
      this.world.createJoint(new RevoluteJoint({}, prev, b, Vec2(p.x + dx * i, p.y + dy * i + th / 2)));
      this.props.push({ kind: "plank", body: b, w: len, h: th });
      prev = b;
    }
    this.world.createJoint(new RevoluteJoint({}, prev, this.ground, Vec2(p.x + p.w, p.y2 + th / 2)));
  }

  private buildDoodle() {
    const d = this.doodle;
    if (!d.parts.length) return;
    const gy = groundAt(this.course, 0) ?? 0;
    const off = { x: 0, y: gy - 0.35 };
    const g = this.course.gravity;

    // One rigid body per group of welded bodies and sticks.
    const groupBody: Body[] = [];
    const groupArea: number[] = [];
    for (let gi = 0; gi < d.groups; gi++) {
      const members = d.parts.filter((p) => p.group === gi && (p.kind === "body" || p.kind === "stick"));
      let cx = 0;
      let cy = 0;
      let a = 0;
      for (const m of members) {
        cx += m.center.x * m.area;
        cy += m.center.y * m.area;
        a += m.area;
      }
      const origin = { x: cx / a + off.x, y: cy / a + off.y };
      const body = this.world.createBody({ type: "dynamic", position: Vec2(origin.x, origin.y), angularDamping: 0.05 });
      for (const m of members) {
        for (const piece of m.pieces) {
          body.createFixture({
            shape: new Polygon(piece.map((p) => Vec2(p.x + off.x - origin.x, p.y + off.y - origin.y))),
            density: m.kind === "stick" ? 1.6 : 1,
            friction: 0.2,
            restitution: 0.12,
            filterCategoryBits: BODY,
            filterMaskBits: GROUND | BODY | PROP,
          });
        }
        this.parts.push({ part: m, body, local: toLocal(m.outline, off, origin), joint: null, grounded: false, torque: 0, speed: 0 });
      }
      groupBody.push(body);
      groupArea.push(a);
    }

    // Decorations are painted on the body they sit in.
    for (const p of d.parts) {
      if (p.kind !== "deco" || p.group < 0) continue;
      const body = groupBody[p.group];
      const o = body.getPosition();
      this.parts.push({ part: p, body, local: toLocal(p.outline, off, o), joint: null, grounded: false, torque: 0, speed: 0 });
    }

    // Wheels: their own bodies, pinned to the group they overlap, with a motor.
    const wheels = d.parts.filter((p) => p.kind === "wheel");
    const wheelParts: SimPart[] = [];
    for (const w of wheels) {
      const origin = { x: w.center.x + off.x, y: w.center.y + off.y };
      const body = this.world.createBody({ type: "dynamic", position: Vec2(origin.x, origin.y), angularDamping: 0.1 });
      const fx = {
        density: 2.2,
        friction: 1.6,
        restitution: 0.08,
        filterCategoryBits: WHEEL,
        filterMaskBits: GROUND | PROP,
      };
      if (w.circle) body.createFixture({ shape: new Circle(w.circle.r), ...fx });
      else {
        for (const piece of w.pieces) {
          body.createFixture({ shape: new Polygon(piece.map((p) => Vec2(p.x - w.center.x, p.y - w.center.y))), ...fx });
        }
      }
      let joint: WheelJoint | null = null;
      if (w.group >= 0) {
        // A sprung axle: the wheel can travel a little up and down, which
        // soaks up kerbs and gives the machine its wobble.
        joint = this.world.createJoint(
          new WheelJoint(
            { enableMotor: false, maxMotorTorque: 0, frequencyHz: SPRING_HZ, dampingRatio: 0.75 },
            groupBody[w.group],
            body,
            Vec2(origin.x, origin.y),
            Vec2(0, 1),
          ),
        );
      }
      const sp: SimPart = { part: w, body, local: toLocal(w.outline, off, origin), joint, grounded: false, torque: 0, speed: 0 };
      wheelParts.push(sp);
      this.parts.push(sp);
    }

    let mass = 0;
    const seen = new Set<Body>();
    for (const p of this.parts) {
      if (seen.has(p.body)) continue;
      seen.add(p.body);
      mass += p.body.getMass();
    }
    this.mass = mass;
    const gScale = Math.pow(g / 10, 0.75);
    for (const w of wheelParts) {
      const r = Math.max(0.18, w.part.circle ? w.part.circle.r : w.part.radius);
      w.torque = (TORQUE * mass * 10 * r * gScale) / Math.pow(Math.max(1, wheelParts.length), 0.75);
      w.speed = Math.min(30, Math.max(5, TOP_SPEED / r));
    }

    // The camera and the finish line follow the heaviest group.
    let best = -1;
    groupArea.forEach((a, i) => {
      if (best < 0 || a > groupArea[best]) best = i;
    });
    if (best >= 0) this.lead = groupBody[best];
    else if (wheelParts.length) {
      this.lead = wheelParts.reduce((a, b) => (b.part.area > a.part.area ? b : a)).body;
    } else if (this.parts.length) this.lead = this.parts[0].body;
    this.startX = this.lead ? this.lead.getPosition().x : 0;
    this.maxX = this.startX;
  }

  /** Advance one fixed step. `input` is 1 for go, -1 for reverse, 0 for coast. */
  step(input: number) {
    this.hits.length = 0;
    const drive = this.finished ? 0 : input;
    // In the air the motors ease off, or every jump ends in a backflip.
    const airborne = !this.parts.some((p) => p.grounded);
    // Also in the air: bodies resist tumbling, so most jumps land wheels down.
    for (const p of this.parts) {
      if (p.part.kind !== "wheel") p.body.setAngularDamping(airborne ? 2.4 : 1.2);
    }
    for (const p of this.parts) {
      if (p.part.kind !== "wheel") continue;
      if (p.joint) {
        // A little traction control: the further the body rears up, the less
        // the motor pushes. A tall tower still topples. A car on a bump does not.
        const host = p.joint.getBodyA();
        const a = Math.atan2(Math.sin(host.getAngle()), Math.cos(host.getAngle()));
        // Measured against the hill it is on, so climbing is not mistaken for rearing.
        const hx = host.getPosition().x;
        const g1 = groundAt(this.course, hx - 1.2);
        const g2 = groundAt(this.course, hx + 1.2);
        const hill = g1 !== null && g2 !== null ? Math.atan2(g2 - g1, 2.4) : 0;
        const rear = Math.max(0, Math.min(1, (-(a - hill) * drive - 0.16) / 0.4));
        const ease = (1 - rear) * (airborne ? 0.2 : 1);
        p.joint.enableMotor(drive !== 0 || this.finished);
        p.joint.setMotorSpeed(drive * p.speed);
        p.joint.setMaxMotorTorque(this.finished ? p.torque * 1.2 : p.torque * ease);
      } else if (drive !== 0) {
        // A wheel with no body to push against is spun directly.
        if (Math.abs(p.body.getAngularVelocity()) < p.speed) p.body.applyTorque(drive * p.torque * 0.5, true);
      }
      let grounded = false;
      for (let ce = p.body.getContactList(); ce; ce = ce.next ?? null) {
        if (ce.contact.isTouching()) {
          grounded = true;
          break;
        }
      }
      p.grounded = grounded;
    }
    this.world.step(STEP, 8, 3);
    this.t += STEP;
    // A wedged shape can be squeezed out at silly speeds. Keep everything sane.
    for (const p of this.parts) {
      const v = p.body.getLinearVelocity();
      const sp = Math.hypot(v.x, v.y);
      if (sp > 26) p.body.setLinearVelocity(Vec2((v.x * 26) / sp, (v.y * 26) / sp));
      const w = p.body.getAngularVelocity();
      if (Math.abs(w) > 45) p.body.setAngularVelocity(Math.sign(w) * 45);
    }
    const lead = this.lead;
    if (!lead) return;
    const pos = lead.getPosition();
    if (pos.x > this.maxX + 0.25) {
      this.maxX = pos.x;
      this.lastGain = this.t;
    }
    if (!this.finished && !this.fell) {
      if (pos.x >= this.course.finishX) {
        this.finished = true;
        this.finishT = this.t;
      } else if (pos.y > this.course.killY) {
        this.fell = true;
      }
    }
  }

  /** 0 at the start line, 1 at the flag. */
  progress(): number {
    if (!this.lead) return 0;
    const x = this.lead.getPosition().x;
    return Math.max(0, Math.min(1, (x - this.startX) / (this.course.finishX - this.startX)));
  }

  distance(): number {
    return Math.max(0, this.maxX - this.startX);
  }
}

function toLocal(outline: Pt[], off: Pt, origin: Pt): Pt[] {
  return outline.map((p) => ({ x: p.x + off.x - origin.x, y: p.y + off.y - origin.y }));
}

export function starsFor(course: Course, time: number): number {
  return time <= course.stars[0] ? 3 : time <= course.stars[1] ? 2 : 1;
}
