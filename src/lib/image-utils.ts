export function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("تعذّر قراءة الصورة"));
    };
    img.src = url;
  });
}

export function imageToCanvas(img: HTMLImageElement | ImageBitmap, maxSide = Infinity) {
  const w0 = "naturalWidth" in img ? img.naturalWidth : img.width;
  const h0 = "naturalHeight" in img ? img.naturalHeight : img.height;
  const scale = Math.min(1, maxSide / Math.max(w0, h0));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w0 * scale);
  canvas.height = Math.round(h0 * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

/** Downscaled JPEG sent to the AI: big enough to read lettering, small enough to upload fast. */
export function toAnalysisDataUrl(img: HTMLImageElement, maxSide = 1600) {
  const { canvas, ctx } = imageToCanvas(img, maxSide);
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.86);
}

export function rgbToHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

export function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function sampleColor(data: ImageData, x: number, y: number, radius = 1) {
  let r = 0, g = 0, b = 0, n = 0;
  const cx = Math.round(x), cy = Math.round(y);
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const px = Math.min(data.width - 1, Math.max(0, cx + dx));
      const py = Math.min(data.height - 1, Math.max(0, cy + dy));
      const i = (py * data.width + px) * 4;
      r += data.data[i]!; g += data.data[i + 1]!; b += data.data[i + 2]!; n++;
    }
  }
  return rgbToHex(r / n, g / n, b / n);
}

/** Most frequent colour in a region; in a bubble the paper colour dominates the lettering. */
export function dominantColor(data: ImageData, rect: { x: number; y: number; w: number; h: number }) {
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  const step = Math.max(1, Math.floor(Math.sqrt((rect.w * rect.h) / 4000)));
  const x0 = Math.max(0, Math.floor(rect.x)), y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(data.width, Math.ceil(rect.x + rect.w)), y1 = Math.min(data.height, Math.ceil(rect.y + rect.h));
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * data.width + x) * 4;
      const r = data.data[i]!, g = data.data[i + 1]!, b = data.data[i + 2]!;
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
      bucket.count++; bucket.r += r; bucket.g += g; bucket.b += b;
      buckets.set(key, bucket);
    }
  }
  let best: { count: number; r: number; g: number; b: number } | null = null;
  for (const bucket of buckets.values()) if (!best || bucket.count > best.count) best = bucket;
  if (!best) return "#ffffff";
  return rgbToHex(best.r / best.count, best.g / best.count, best.b / best.count);
}

export function luminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function contrastTextColor(bg: string) {
  return luminance(bg) > 0.5 ? "#111111" : "#ffffff";
}
