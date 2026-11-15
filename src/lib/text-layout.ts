import { fontCss } from "./fonts";
import type { TextBox } from "./types";

let measureCtx: CanvasRenderingContext2D | null = null;
function measurer() {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d")!;
  return measureCtx;
}

export function fontString(family: string, bold: boolean, px: number) {
  return `${bold ? 700 : 400} ${px}px ${fontCss(family)}`;
}

export function boxPadding(wPx: number, hPx: number) {
  return Math.max(2, Math.min(wPx, hPx) * 0.07);
}

/** Greedy word wrap shared by the on-screen editor and the exported image, so both break lines identically. */
export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = words[0]!;
    for (const word of words.slice(1)) {
      const candidate = `${line} ${word}`;
      if (ctx.measureText(candidate).width <= maxWidth) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

export type BoxLayout = {
  x: number;
  y: number;
  w: number;
  h: number;
  pad: number;
  fontPx: number;
  lineHeightPx: number;
  lines: string[];
};

/** Layout in source-image pixels. */
export function layoutBox(box: TextBox, imgW: number, imgH: number, ctx = measurer()): BoxLayout {
  const x = box.x * imgW, y = box.y * imgH, w = box.w * imgW, h = box.h * imgH;
  const pad = boxPadding(w, h);
  ctx.font = fontString(box.fontFamily, box.bold, box.fontSize);
  const lines = wrapLines(ctx, box.text, Math.max(1, w - pad * 2));
  return { x, y, w, h, pad, fontPx: box.fontSize, lineHeightPx: box.fontSize * box.lineHeight, lines };
}

/** Largest font size whose wrapped text fits inside the box. */
export function fitFontSize(
  text: string,
  family: string,
  bold: boolean,
  wPx: number,
  hPx: number,
  lineHeight: number,
) {
  const ctx = measurer();
  const pad = boxPadding(wPx, hPx);
  const maxW = Math.max(1, wPx - pad * 2), maxH = Math.max(1, hPx - pad * 2);
  let lo = 6, hi = Math.max(8, Math.min(220, hPx));
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    ctx.font = fontString(family, bold, mid);
    const lines = wrapLines(ctx, text, maxW);
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const fits = lines.length * mid * lineHeight <= maxH && widest <= maxW;
    if (fits) lo = mid;
    else hi = mid;
  }
  return Math.max(6, Math.floor(lo));
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

export function shapeRadius(wPx: number, hPx: number) {
  return Math.min(wPx, hPx) * 0.18;
}

/** Draws one line bent along a circular arc. The line is rendered whole first (so Arabic letters stay joined), then laid down in thin slices. */
function drawArcLine(
  ctx: CanvasRenderingContext2D,
  box: TextBox,
  line: string,
  lineCx: number,
  lineY: number,
  boxCx: number,
  radius: number,
  sign: number,
  lineHeightPx: number,
) {
  const lw = ctx.measureText(line).width;
  if (!lw) return;
  const t = ctx.getTransform();
  const res = Math.min(4, Math.max(1, Math.hypot(t.a, t.b)));
  const sw = box.strokeWidth * 2;
  const padX = Math.ceil(sw + 4);
  const cw = Math.ceil(lw + padX * 2);
  const chh = Math.ceil(Math.max(lineHeightPx, box.fontSize * 1.6) + sw * 2 + 8);
  const off = document.createElement("canvas");
  off.width = Math.ceil(cw * res);
  off.height = Math.ceil(chh * res);
  const o = off.getContext("2d")!;
  o.scale(res, res);
  o.font = ctx.font;
  o.direction = "rtl";
  o.textBaseline = "middle";
  o.textAlign = "center";
  if (box.strokeWidth > 0) {
    o.lineJoin = "round";
    o.lineWidth = sw;
    o.strokeStyle = box.strokeColor;
    o.strokeText(line, cw / 2, chh / 2);
  }
  o.fillStyle = box.color;
  o.fillText(line, cw / 2, chh / 2);

  const step = 2;
  const left = lineCx - cw / 2;
  for (let sx = 0; sx < cw; sx += step) {
    const sliceW = Math.min(step, cw - sx);
    const phi = (left + sx + sliceW / 2 - boxCx) / radius;
    const px = boxCx + radius * Math.sin(phi);
    const py = lineY + sign * radius * (1 - Math.cos(phi));
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(sign * phi);
    ctx.drawImage(off, sx * res, 0, sliceW * res, off.height, -sliceW / 2, -chh / 2, sliceW + 0.5, chh);
    ctx.restore();
  }
}

/** Draws the box's lines (straight or curved) in source-image pixel coordinates, without the cover fill or rotation. */
export function drawBoxText(ctx: CanvasRenderingContext2D, box: TextBox, layout: BoxLayout) {
  const { x, y, w, h } = layout;
  ctx.save();
  ctx.font = fontString(box.fontFamily, box.bold, layout.fontPx);
  ctx.direction = "rtl";
  ctx.textBaseline = "middle";
  const total = layout.lines.length * layout.lineHeightPx;
  let lineY = y + (h - total) / 2 + layout.lineHeightPx / 2;
  const curve = Math.max(-100, Math.min(100, box.curve ?? 0));

  if (!curve) {
    ctx.textAlign = box.align;
    const anchorX = box.align === "right" ? x + w - layout.pad : box.align === "left" ? x + layout.pad : x + w / 2;
    for (const line of layout.lines) {
      if (box.strokeWidth > 0) {
        ctx.lineJoin = "round";
        ctx.lineWidth = box.strokeWidth * 2;
        ctx.strokeStyle = box.strokeColor;
        ctx.strokeText(line, anchorX, lineY);
      }
      ctx.fillStyle = box.color;
      ctx.fillText(line, anchorX, lineY);
      lineY += layout.lineHeightPx;
    }
  } else {
    const theta = (Math.abs(curve) / 100) * Math.PI;
    const sign = Math.sign(curve);
    const radius = Math.max(1, w - layout.pad * 2) / theta;
    const sag = radius * (1 - Math.cos(theta / 2));
    // Keep the bent block visually centred: the arc's ends drop (or rise) by `sag`.
    lineY -= (sign * sag) / 2;
    const boxCx = x + w / 2;
    for (const line of layout.lines) {
      const lw = ctx.measureText(line).width;
      const lineCx =
        box.align === "right" ? x + w - layout.pad - lw / 2 : box.align === "left" ? x + layout.pad + lw / 2 : boxCx;
      drawArcLine(ctx, box, line, lineCx, lineY, boxCx, radius, sign, layout.lineHeightPx);
      lineY += layout.lineHeightPx;
    }
  }
  ctx.restore();
}

export function drawBox(ctx: CanvasRenderingContext2D, box: TextBox, imgW: number, imgH: number) {
  const layout = layoutBox(box, imgW, imgH, ctx);
  const { x, y, w, h } = layout;
  ctx.save();
  const rot = ((box.rotation ?? 0) * Math.PI) / 180;
  if (rot) {
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(rot);
    ctx.translate(-(x + w / 2), -(y + h / 2));
  }
  if (box.fill) {
    ctx.fillStyle = box.bg;
    if (box.shape === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    } else roundRectPath(ctx, x, y, w, h, shapeRadius(w, h));
    ctx.fill();
  }
  drawBoxText(ctx, box, layout);
  ctx.restore();
}

export async function ensureFonts(families: string[]) {
  const unique = [...new Set(families)];
  await Promise.all(
    unique.flatMap((f) => [
      document.fonts.load(fontString(f, true, 32), "عربي"),
      document.fonts.load(fontString(f, false, 32), "عربي"),
    ]),
  ).catch(() => undefined);
}
