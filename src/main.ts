// Doodle Drive. Draw, press Go, watch physics have opinions.

import "./style.css";
import { COURSES, type Course } from "./engine/courses";
import { type Doodle, buildDoodle } from "./engine/doodle";
import { STEP, Sim, starsFor } from "./engine/sim";
import { STARTERS } from "./engine/starters";
import { paintDoodleIn } from "./game/art";
import { Sound } from "./game/audio";
import { COLORS, INK, formatTime } from "./game/ink";
import { Pad } from "./game/pad";
import { WorldView } from "./game/render";
import { type CardInfo, canShareFiles, cardBlob, drawCard, shareCard } from "./game/share";
import { load, save } from "./game/store";

type State = "draw" | "drive" | "over";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const body = document.body;
const saved = load();
const sound = new Sound();
sound.muted = saved.muted;

const view = new WorldView($<HTMLCanvasElement>("world"));
const pad = new Pad($<HTMLCanvasElement>("pad"), sound);

let state: State = "draw";
let courseIndex = Math.max(0, Math.min(COURSES.length - 1, saved.course | 0));
let course: Course = COURSES[courseIndex];
let sim: Sim | null = null;
let doodle: Doodle = pad.doodle;
let input = 0;
let started = false;
let t0 = 0;
let acc = 0;
let stuckSince = 0;
let overTimer = 0;
let card: { blob: Blob; name: string; text: string } | null = null;

const STAR = '<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.2 6.6.8-4.9 4.6 1.3 6.6L12 17.4l-5.9 3.3 1.3-6.6L2.5 9.5l6.6-.8z"/></svg>';

// ---------- small helpers ----------

let toastTimer = 0;
function toast(msg: string) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("is-on");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove("is-on"), 2200);
}

function persist() {
  saved.course = courseIndex;
  saved.strokes = pad.strokes;
  saved.muted = sound.muted;
  save(saved);
}

function setState(s: State) {
  state = s;
  body.dataset.state = s;
  $("hud").setAttribute("aria-hidden", s === "draw" ? "true" : "false");
  pad.enabled = s === "draw";
}

function setCourse(i: number) {
  courseIndex = (i + COURSES.length) % COURSES.length;
  course = COURSES[courseIndex];
  view.setCourse(course);
  $("course-no").textContent = String(courseIndex + 1).padStart(2, "0");
  $("course-name").textContent = course.name;
  document.documentElement.style.setProperty("--sky", course.theme.sky);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", course.theme.sky);
  persist();
}

// ---------- drawing screen ----------

function refreshDraw() {
  doodle = pad.doodle;
  const has = doodle.parts.length > 0;
  body.classList.toggle("has-doodle", pad.strokes.length > 0);
  body.classList.toggle("needs-wheel", has && doodle.wheels === 0);
  $("go").classList.toggle("is-ready", has && doodle.wheels > 0);
  $<HTMLButtonElement>("undo").disabled = !pad.strokes.length;
  $<HTMLButtonElement>("clear").disabled = !pad.strokes.length;
  if (pad.strokes.length && !saved.drawn) saved.drawn = true;
  persist();
}

function buildSwatches() {
  const box = $("swatches");
  COLORS.forEach((c, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "swatch";
    b.style.background = c;
    b.setAttribute("aria-label", ["Red", "Yellow", "Blue", "Green", "Pink"][i]);
    b.setAttribute("aria-pressed", String(i === pad.color));
    b.addEventListener("click", () => {
      pad.color = i;
      sound.wake();
      sound.tick();
      box.querySelectorAll(".swatch").forEach((s, k) => s.setAttribute("aria-pressed", String(k === i)));
    });
    box.appendChild(b);
  });
}

function buildStarters() {
  const box = $("starters");
  for (const s of STARTERS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "starter";
    b.setAttribute("aria-label", `Use the ${s.name}`);
    b.title = s.name;
    const cv = document.createElement("canvas");
    cv.width = 228;
    cv.height = 156;
    const ctx = cv.getContext("2d")!;
    paintDoodleIn(ctx, buildDoodle(s.strokes), 10, 8, 208, 140);
    b.appendChild(cv);
    b.addEventListener("click", () => {
      sound.wake();
      sound.pop();
      pad.set(s.strokes);
    });
    box.appendChild(b);
  }
}

// ---------- driving ----------

function startDrive() {
  sound.wake();
  doodle = pad.doodle;
  if (!doodle.parts.length) {
    const sheet = $("sheet");
    sheet.classList.remove("is-nope");
    void sheet.offsetWidth;
    sheet.classList.add("is-nope");
    toast("Draw something first");
    sound.undo();
    return;
  }
  launch();
  sound.go();
}

function launch() {
  clearTimeout(overTimer);
  $("result").hidden = true;
  body.classList.remove("is-stuck");
  sim = new Sim(course, doodle);
  view.reset();
  input = 0;
  started = false;
  t0 = 0;
  acc = 0;
  stuckSince = 0;
  card = null;
  setPedals();
  $("time").textContent = "0.00";
  setState("drive");
}

function toDraw() {
  clearTimeout(overTimer);
  $("result").hidden = true;
  body.classList.remove("is-stuck");
  sim = null;
  input = 0;
  sound.motorOff();
  setState("draw");
  requestAnimationFrame(() => pad.resize());
}

function setInput(v: number) {
  if (state !== "drive") v = 0;
  if (v === input) return;
  input = v;
  if (v !== 0 && !started && sim) {
    started = true;
    t0 = sim.t;
    stuckSince = sim.t;
    if (!saved.driven) {
      saved.driven = true;
      body.classList.add("driven");
      persist();
    }
  }
  setPedals();
}

function setPedals() {
  $("pedal-go").classList.toggle("is-down", input > 0);
  $("pedal-back").classList.toggle("is-down", input < 0);
}

function clock(): number {
  if (!sim || !started) return 0;
  return (sim.finished ? sim.finishT : sim.t) - t0;
}

function tick(dt: number) {
  if (!sim) return;
  acc = Math.min(acc + dt, STEP * 4);
  while (acc >= STEP) {
    acc -= STEP;
    const wasDone = sim.finished || sim.fell;
    sim.step(input);
    let worst = 0;
    for (const h of sim.hits) {
      const rel = h.power / Math.max(1, sim.mass);
      if (rel > 0.35) {
        worst = Math.max(worst, rel);
        if (rel > 0.6) view.puff(h.x, h.y, Math.min(6, Math.round(rel * 3)), 1.5 + rel);
      }
    }
    if (worst > 0.45) {
      view.impact(sim.lead, worst * 4);
      for (const p of sim.parts) if (p.part.kind === "wheel") view.impact(p.body, worst * 2);
      sound.thud(worst * 4);
    }
    view.wheelDust(sim, input);
    if (!wasDone && sim.finished) finish();
    if (!wasDone && sim.fell) flop(true);
  }
  if (state !== "drive") return;
  $("time").textContent = formatTime(clock());
  $<HTMLElement>("dot").style.left = `${(sim.progress() * 100).toFixed(1)}%`;
  // Nothing gained for a while: offer a way out, without taking the wheel away.
  const idle = sim.t - Math.max(sim.lastGain, stuckSince);
  body.classList.toggle("is-stuck", started && idle > 4.5);
}

function finish() {
  if (!sim) return;
  const time = sim.finishT - t0;
  const stars = starsFor(course, time);
  const old = saved.best[course.id];
  const best = !old || time < old.time;
  if (best) saved.best[course.id] = { time, stars: Math.max(stars, old?.stars ?? 0) };
  persist();
  input = 0;
  setPedals();
  $("time").textContent = formatTime(time);
  $<HTMLElement>("dot").style.left = "100%";
  setState("over");
  view.party();
  sound.win();
  const info: CardInfo = { doodle, course, index: courseIndex, total: COURSES.length, time, stars };
  overTimer = window.setTimeout(() => {
    showResult({
      win: true,
      title: ["Made it!", "Nailed it!", "What a machine!", "It works!"][Math.floor(Math.random() * 4)],
      num: formatTime(time),
      unit: "s",
      stars,
      note: best && old ? `<b>New best</b> You beat ${formatTime(old.time)} s.` : best ? "<b>First finish</b> on this course." : `Your best is ${formatTime(old!.time)} s.`,
      info,
    });
  }, 900);
}

function flop(fell: boolean) {
  if (!sim) return;
  const distance = sim.distance();
  input = 0;
  setPedals();
  setState("over");
  if (fell) sound.splash();
  else sound.flop();
  const info: CardInfo = { doodle, course, index: courseIndex, total: COURSES.length, distance, fell };
  overTimer = window.setTimeout(
    () => {
      showResult({
        win: false,
        title: fell ? "Whoops!" : "Stuck!",
        num: String(Math.round(distance)),
        unit: "m",
        stars: 0,
        note: fell ? "It went down the hole. Try a longer machine, or more speed." : "It will not budge. Bigger wheels often help.",
        info,
      });
    },
    fell ? 700 : 200,
  );
}

interface Result {
  win: boolean;
  title: string;
  num: string;
  unit: string;
  stars: number;
  note: string;
  info: CardInfo;
}

function showResult(r: Result) {
  const el = $("result");
  el.classList.toggle("is-win", r.win);
  el.classList.toggle("is-flop", !r.win);
  $("result-course").textContent = `${String(courseIndex + 1).padStart(2, "0")}  ${course.name}`;
  $("result-title").textContent = r.title;
  $("result-num").textContent = r.num;
  $("result-unit").textContent = r.unit;
  $("result-note").innerHTML = r.note;
  $("stars").innerHTML = [0, 1, 2].map((i) => STAR.replace("<svg", `<svg style="--i:${i}" class="${i < r.stars ? "on" : ""}"`)).join("");
  const next = $("next");
  next.hidden = !r.win;
  next.querySelector("span")!.textContent = courseIndex === COURSES.length - 1 ? "Back to course 1" : "Next course";
  $("share-label").textContent = canShareFiles() ? (r.win ? "Share" : "Share the flop") : "Save picture";
  el.hidden = false;
  if (r.win) for (let i = 0; i < r.stars; i++) window.setTimeout(() => sound.star(i), 500 + i * 280);
  ($(r.win ? "next" : "result-redraw") as HTMLButtonElement).focus({ preventScroll: true });
  void makeCard(r.info);
}

async function makeCard(info: CardInfo) {
  card = null;
  const img = $<HTMLImageElement>("card");
  img.removeAttribute("src");
  try {
    await document.fonts.load(`800 50px "Bricolage Grotesque Variable"`);
  } catch {
    /* draw with the fallback face */
  }
  const cv = drawCard(info);
  const blob = await cardBlob(cv);
  if (!blob) return;
  const won = info.time !== undefined;
  card = {
    blob,
    name: `doodle-drive-${info.course.id}.png`,
    text: won
      ? `My doodle finished ${info.course.name} in ${formatTime(info.time!)} s on Doodle Drive.`
      : `My doodle made it ${Math.round(info.distance ?? 0)} m on ${info.course.name} in Doodle Drive.`,
  };
  img.src = URL.createObjectURL(blob);
}

async function share(infoIfNone?: CardInfo) {
  if (!card && infoIfNone) await makeCard(infoIfNone);
  if (!card) return;
  const how = await shareCard(card.blob, card.name, card.text);
  if (how === "saved") toast("Picture saved");
}

// ---------- course picker ----------

function drawCourseThumb(cv: HTMLCanvasElement, c: Course) {
  const ctx = cv.getContext("2d")!;
  const W = cv.width;
  const H = cv.height;
  ctx.fillStyle = c.theme.sky;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = c.theme.sun;
  ctx.beginPath();
  ctx.arc(W * 0.82, H * 0.3, H * 0.2, 0, Math.PI * 2);
  ctx.fill();
  let minY = Infinity;
  let maxY = -Infinity;
  for (const piece of c.ground) {
    for (const p of piece) {
      if (p.x < -2 || p.x > c.finishX + 4 || p.y > 20 || p.y < -13) continue;
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  }
  const sx = W / (c.finishX + 8);
  const sy = Math.min(sx * 2.4, (H * 0.5) / Math.max(1, maxY - minY));
  const X = (x: number) => (x + 3) * sx;
  const Y = (y: number) => H * 0.42 + (y - minY) * sy;
  ctx.lineJoin = "round";
  for (const piece of c.ground) {
    ctx.beginPath();
    ctx.moveTo(X(piece[0].x), H + 10);
    for (const p of piece) ctx.lineTo(X(p.x), Math.min(H + 10, Y(Math.max(p.y, minY - 4))));
    ctx.lineTo(X(piece[piece.length - 1].x), H + 10);
    ctx.closePath();
    ctx.fillStyle = c.theme.ground;
    ctx.fill();
    ctx.strokeStyle = c.theme.night ? "#0f0c2e" : INK;
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  for (const p of c.props) {
    if (p.type === "crate") continue;
    ctx.beginPath();
    if (p.type === "seesaw") {
      ctx.moveTo(X(p.x - p.w / 2 - 0.9), Y(p.y) + 3);
      ctx.lineTo(X(p.x + p.w / 2 + 0.9), Y(p.y) - 10);
    } else {
      ctx.moveTo(X(p.x), Y(p.y));
      ctx.quadraticCurveTo(X(p.x + p.w / 2), Y(p.y) + 12, X(p.x + p.w), Y(p.y2));
    }
    ctx.stroke();
  }
}

function openCourses() {
  sound.wake();
  sound.tick();
  const grid = $("course-grid");
  grid.innerHTML = "";
  COURSES.forEach((c, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "course";
    b.style.setProperty("--i", String(i));
    if (i === courseIndex) b.setAttribute("aria-current", "true");
    const cv = document.createElement("canvas");
    cv.width = 500;
    cv.height = 200;
    drawCourseThumb(cv, c);
    const best = saved.best[c.id];
    const stars = [0, 1, 2].map((k) => STAR.replace("<svg", `<svg class="${best && k < best.stars ? "on" : ""}"`)).join("");
    const info = document.createElement("div");
    info.className = "course-body";
    info.innerHTML = `<strong></strong><em></em><span class="mini-stars"><div>${stars}</div><span>${best ? formatTime(best.time) + " s" : ""}</span></span>`;
    info.querySelector("strong")!.textContent = c.name;
    info.querySelector("em")!.textContent = c.blurb;
    const no = document.createElement("span");
    no.className = "no";
    no.textContent = String(i + 1).padStart(2, "0");
    b.append(cv, no, info);
    b.addEventListener("click", () => {
      sound.pop();
      setCourse(i);
      closeCourses();
    });
    grid.appendChild(b);
  });
  $("courses").hidden = false;
  $("courses-close").focus({ preventScroll: true });
}

function closeCourses() {
  $("courses").hidden = true;
}

// ---------- wiring ----------

function wire() {
  pad.onChange = refreshDraw;
  $("go").addEventListener("click", startDrive);
  $("undo").addEventListener("click", () => pad.undo());
  $("clear").addEventListener("click", () => pad.clear());
  $("course").addEventListener("click", openCourses);
  $("courses-close").addEventListener("click", closeCourses);
  $("mute").addEventListener("click", () => {
    sound.wake();
    sound.setMuted(!sound.muted);
    $("mute").setAttribute("aria-pressed", String(sound.muted));
    persist();
    if (!sound.muted) sound.tick();
  });
  $("redraw").addEventListener("click", toDraw);
  $("retry").addEventListener("click", () => {
    sound.tick();
    launch();
  });
  $("stuck-redraw").addEventListener("click", toDraw);
  $("stuck-share").addEventListener("click", () => {
    if (!sim) return;
    void share({ doodle, course, index: courseIndex, total: COURSES.length, distance: sim.distance(), fell: false });
  });
  $("next").addEventListener("click", () => {
    setCourse(courseIndex + 1);
    view.follow(0, 0, 0.64, 0, true);
    launch();
    sound.go();
  });
  $("again").addEventListener("click", () => {
    launch();
    sound.go();
  });
  $("result-redraw").addEventListener("click", toDraw);
  $("share").addEventListener("click", () => void share());
  $("card").addEventListener("click", () => void share());

  // Hold anywhere to go. The left quarter of the screen is reverse.
  const zone = $("zone");
  const held = new Map<number, number>();
  const sync = () => {
    let v = 0;
    for (const dir of held.values()) v = dir;
    setInput(v || keyInput());
  };
  zone.addEventListener("pointerdown", (e) => {
    sound.wake();
    try {
      zone.setPointerCapture(e.pointerId);
    } catch {
      /* nothing to capture */
    }
    held.set(e.pointerId, e.clientX < window.innerWidth * 0.26 ? -1 : 1);
    sync();
    e.preventDefault();
  });
  const release = (e: PointerEvent) => {
    held.delete(e.pointerId);
    sync();
  };
  zone.addEventListener("pointerup", release);
  zone.addEventListener("pointercancel", release);
  zone.addEventListener("contextmenu", (e) => e.preventDefault());

  const keys = new Set<string>();
  const keyInput = () =>
    keys.has("ArrowRight") || keys.has("KeyD") || keys.has("Space") || keys.has("ArrowUp")
      ? 1
      : keys.has("ArrowLeft") || keys.has("KeyA")
        ? -1
        : 0;
  window.addEventListener("keydown", (e) => {
    if (e.repeat) {
      if (state === "drive") e.preventDefault();
      return;
    }
    const tag = (e.target as HTMLElement).tagName;
    if (!$("courses").hidden) {
      if (e.code === "Escape") closeCourses();
      return;
    }
    if (state === "draw") {
      if (e.code === "Enter" && tag !== "BUTTON") startDrive();
      else if (e.code === "KeyZ" || e.code === "Backspace") pad.undo();
      return;
    }
    if (e.code === "KeyR") {
      launch();
      return;
    }
    if (e.code === "Escape" || e.code === "KeyE") {
      toDraw();
      return;
    }
    if (state === "drive") {
      sound.wake();
      keys.add(e.code);
      if (keyInput()) e.preventDefault();
      sync();
    }
  });
  window.addEventListener("keyup", (e) => {
    keys.delete(e.code);
    sync();
  });
  window.addEventListener("blur", () => {
    keys.clear();
    held.clear();
    sync();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) sound.motorOff();
  });

  const onResize = () => {
    view.resize();
    pad.resize();
  };
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", () => setTimeout(onResize, 250));
  // Stop the page from scrolling or zooming under a drawing finger.
  document.addEventListener("touchmove", (e) => {
    if (!(e.target as HTMLElement).closest(".courses, .result-card")) e.preventDefault();
  }, { passive: false });
  document.addEventListener("gesturestart", (e) => e.preventDefault());
}

// ---------- the loop ----------

let last = 0;
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0);
  last = now;
  if (sim) tick(dt);
  if (sim && sim.lead) {
    const p = sim.lead.getPosition();
    const v = sim.lead.getLinearVelocity();
    const ahead = Math.max(-3, Math.min(5, v.x * 0.45)) + (view.w / view.ppm) * 0.12;
    view.follow(Math.min(p.x + ahead, course.finishX + 3), Math.min(p.y, course.killY - 4), 0.64, dt);
    sound.motor(state === "drive" && input !== 0, Math.hypot(v.x, v.y));
  } else {
    view.follow((view.w / view.ppm) * 0.18, 0, 0.86, dt);
  }
  view.draw(sim, dt);
  if (state === "draw") pad.draw(dt);
  requestAnimationFrame(frame);
}

function boot() {
  document.querySelectorAll<HTMLElement>(".brand i").forEach((el, i) => el.style.setProperty("--i", String(i)));
  $("mute").setAttribute("aria-pressed", String(sound.muted));
  if (saved.driven) body.classList.add("driven");
  buildSwatches();
  buildStarters();
  wire();
  view.resize();
  setCourse(courseIndex);
  view.follow((view.w / view.ppm) * 0.18, 0, 0.86, 0, true);
  pad.resize();
  pad.hint = !saved.drawn;
  if (saved.strokes.length) pad.set(saved.strokes);
  else refreshDraw();
  setState("draw");
  requestAnimationFrame((t) => {
    last = t;
    frame(t);
  });
}

boot();

// A handle for automated play-throughs. Harmless, and it keeps the tests honest
// about using the real page.
declare global {
  interface Window {
    __doodle: { state: () => State; sim: () => Sim | null; course: () => number; setCourse: (i: number) => void };
  }
}
window.__doodle = { state: () => state, sim: () => sim, course: () => courseIndex, setCourse };
