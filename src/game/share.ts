// The share card: a picture of the player's doodle with the course and
// the result, made in the browser. Nothing is uploaded anywhere.

import type { Course } from "../engine/courses";
import type { Doodle } from "../engine/doodle";
import { paintDoodleIn } from "./art";
import { FONT, INK, PAPER, formatTime } from "./ink";

export interface CardInfo {
  doodle: Doodle;
  course: Course;
  index: number;
  total: number;
  /** Set when the course was finished. */
  time?: number;
  stars?: number;
  /** Set for a flop. */
  distance?: number;
  fell?: boolean;
}

export const CARD_W = 1080;
export const CARD_H = 1350;

export function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.46 : r;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
}

export function drawCard(info: CardInfo): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = CARD_W;
  cv.height = CARD_H;
  const ctx = cv.getContext("2d")!;
  const th = info.course.theme;
  const W = CARD_W;
  const H = CARD_H;

  // Sky, sun and a strip of ground behind the card.
  ctx.fillStyle = th.sky;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = th.sun;
  ctx.beginPath();
  ctx.arc(W - 150, 170, 150, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = th.ground;
  ctx.fillRect(0, H - 210, W, 210);
  ctx.strokeStyle = th.night ? "#0f0c2e" : INK;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(0, H - 210);
  ctx.lineTo(W, H - 210);
  ctx.stroke();

  // The paper card, a little crooked.
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-0.022);
  ctx.translate(-W / 2, -H / 2);
  const x = 80;
  const y = 90;
  const w = W - 160;
  const h = H - 190;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.roundRect(x + 16, y + 18, w, h, 44);
  ctx.fill();
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 44);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 8;
  ctx.stroke();

  ctx.fillStyle = INK;
  ctx.textBaseline = "alphabetic";
  ctx.font = `800 50px ${FONT}`;
  ctx.textAlign = "left";
  ctx.fillText("Doodle Drive", x + 54, y + 96);
  ctx.textAlign = "right";
  ctx.font = `600 34px ${FONT}`;
  ctx.fillStyle = "rgba(23,21,15,0.55)";
  ctx.fillText(`${String(info.index + 1).padStart(2, "0")} / ${String(info.total).padStart(2, "0")}`, x + w - 54, y + 94);

  // The doodle, standing on a dotted line.
  const boxY = y + 150;
  const boxH = 520;
  paintDoodleIn(ctx, info.doodle, x + 90, boxY, w - 180, boxH);
  ctx.strokeStyle = "rgba(23,21,15,0.3)";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.setLineDash([3, 22]);
  ctx.beginPath();
  ctx.moveTo(x + 70, boxY + boxH + 6);
  ctx.lineTo(x + w - 70, boxY + boxH + 6);
  ctx.stroke();
  ctx.setLineDash([]);

  // The result.
  const baseY = boxY + boxH + 190;
  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  const won = info.time !== undefined;
  const big = won ? formatTime(info.time!) : `${Math.round(info.distance ?? 0)}`;
  const unit = won ? "s" : "m";
  ctx.font = `800 190px ${FONT}`;
  ctx.fillText(big, x + 48, baseY);
  const bw = ctx.measureText(big).width;
  ctx.font = `800 80px ${FONT}`;
  ctx.fillText(unit, x + 60 + bw, baseY);

  if (won) {
    for (let i = 0; i < 3; i++) {
      const cx = x + w - 96 - (2 - i) * 104;
      starPath(ctx, cx, baseY - 70, 48);
      ctx.fillStyle = i < (info.stars ?? 0) ? "#ffc928" : PAPER;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 7;
      ctx.lineJoin = "round";
      ctx.stroke();
    }
  }

  ctx.fillStyle = INK;
  ctx.font = `800 62px ${FONT}`;
  const line = won ? info.course.name : info.fell ? "then it fell in a hole" : "then it got stuck";
  ctx.fillText(line, x + 54, baseY + 86);
  ctx.font = `500 34px ${FONT}`;
  ctx.fillStyle = "rgba(23,21,15,0.6)";
  ctx.fillText(won ? "I drew this and it finished." : `${info.course.name}. I drew this.`, x + 54, baseY + 142);
  ctx.textAlign = "right";
  ctx.fillText("Draw yours", x + w - 54, baseY + 142);
  ctx.restore();
  return cv;
}

export function cardBlob(cv: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((res) => cv.toBlob((b) => res(b), "image/png"));
}

/** True when the browser can hand a picture to other apps. */
export function canShareFiles(): boolean {
  try {
    const f = new File([new Blob(["x"], { type: "image/png" })], "x.png", { type: "image/png" });
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [f] });
  } catch {
    return false;
  }
}

/** Share through the system sheet when there is one, otherwise save the picture. */
export async function shareCard(blob: Blob, name: string, text: string): Promise<"shared" | "saved" | "cancelled"> {
  const file = new File([blob], name, { type: "image/png" });
  if (canShareFiles()) {
    try {
      await navigator.share({ files: [file], title: "Doodle Drive", text });
      return "shared";
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return "cancelled";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "saved";
}
