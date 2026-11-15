/**
 * Magic Eraser fill: replaces masked pixels with a smooth continuation of the pixels around them.
 * Runs in the browser with no AI; solved coarse-to-fine so large areas fill quickly.
 */
type Pixels = { data: Uint8ClampedArray; width: number; height: number };

function dilate(mask: Uint8Array, w: number, h: number, r: number) {
  if (r <= 0) return mask;
  const out = new Uint8Array(mask);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < w) out[yy * w + xx] = 1;
        }
      }
    }
  }
  return out;
}

function solve(w: number, h: number, ch: Float32Array[], known: Uint8Array) {
  const unknown: number[] = [];
  for (let i = 0; i < w * h; i++) if (!known[i]) unknown.push(i);
  if (!unknown.length) return;

  const coarse = w > 16 && h > 16;
  if (coarse) {
    const cw = Math.ceil(w / 2), chh = Math.ceil(h / 2);
    const cch = ch.map(() => new Float32Array(cw * chh));
    const cknown = new Uint8Array(cw * chh);
    const count = new Uint16Array(cw * chh);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!known[i]) continue;
        const ci = (y >> 1) * cw + (x >> 1);
        for (let c = 0; c < ch.length; c++) cch[c]![ci]! += ch[c]![i]!;
        count[ci]!++;
      }
    }
    for (let ci = 0; ci < cw * chh; ci++) {
      if (!count[ci]) continue;
      cknown[ci] = 1;
      for (let c = 0; c < ch.length; c++) cch[c]![ci]! /= count[ci]!;
    }
    solve(cw, chh, cch, cknown);
    for (const i of unknown) {
      const x = i % w, y = (i / w) | 0;
      const ci = (y >> 1) * cw + (x >> 1);
      for (let c = 0; c < ch.length; c++) ch[c]![i] = cch[c]![ci]!;
    }
  } else {
    for (let c = 0; c < ch.length; c++) {
      let sum = 0, n = 0;
      for (let i = 0; i < w * h; i++) if (known[i]) { sum += ch[c]![i]!; n++; }
      const mean = n ? sum / n : 255;
      for (const i of unknown) ch[c]![i] = mean;
    }
  }

  // Gauss-Seidel smoothing: every erased pixel becomes the average of its neighbours.
  const iterations = coarse ? 40 : 200;
  for (let it = 0; it < iterations; it++) {
    for (const i of unknown) {
      const x = i % w, y = (i / w) | 0;
      for (let c = 0; c < ch.length; c++) {
        const a = ch[c]!;
        let sum = 0, n = 0;
        if (x > 0) { sum += a[i - 1]!; n++; }
        if (x < w - 1) { sum += a[i + 1]!; n++; }
        if (y > 0) { sum += a[i - w]!; n++; }
        if (y < h - 1) { sum += a[i + w]!; n++; }
        a[i] = sum / n;
      }
    }
  }
}

/** Fills every pixel where mask is 1 (mask is width*height). Mutates `img`; returns false when the mask is empty. */
export function inpaint(img: Pixels, mask: Uint8Array, grow = 2): boolean {
  const W = img.width, H = img.height;
  const m = dilate(mask, W, H, grow);
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!m[y * W + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return false;
  const margin = 6;
  x0 = Math.max(0, x0 - margin); y0 = Math.max(0, y0 - margin);
  x1 = Math.min(W - 1, x1 + margin); y1 = Math.min(H - 1, y1 + margin);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const ch = [0, 1, 2, 3].map(() => new Float32Array(w * h));
  const known = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gi = (y + y0) * W + (x + x0), li = y * w + x;
      for (let c = 0; c < 4; c++) ch[c]![li] = img.data[gi * 4 + c]!;
      known[li] = m[gi] ? 0 : 1;
    }
  }
  solve(w, h, ch, known);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const li = y * w + x;
      if (known[li]) continue;
      const gi = (y + y0) * W + (x + x0);
      for (let c = 0; c < 4; c++) img.data[gi * 4 + c] = Math.round(ch[c]![li]!);
    }
  }
  return true;
}
