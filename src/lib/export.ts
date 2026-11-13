import JSZip from "jszip";

import { registerCustomFonts } from "./custom-fonts";
import { getPageImage } from "./db";
import { imageToCanvas, loadImage } from "./image-utils";
import { drawBox, ensureFonts } from "./text-layout";
import type { Page } from "./types";

export type ExportFormat = "png" | "jpeg";

export async function renderPage(page: Page, format: ExportFormat): Promise<Blob> {
  const blob = await getPageImage(page.id);
  if (!blob) throw new Error("الصورة غير موجودة");
  const img = await loadImage(blob);
  await registerCustomFonts();
  await ensureFonts(page.boxes.map((b) => b.fontFamily));
  const { canvas, ctx } = imageToCanvas(img);
  URL.revokeObjectURL(img.src);
  for (const box of page.boxes) drawBox(ctx, box, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("تعذّر إنشاء الصورة"))),
      format === "png" ? "image/png" : "image/jpeg",
      0.95,
    ),
  );
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function pageFileName(index: number, format: ExportFormat) {
  return `${String(index + 1).padStart(3, "0")}.${format === "png" ? "png" : "jpg"}`;
}

export async function exportChapterZip(
  title: string,
  pages: Page[],
  format: ExportFormat,
  onProgress?: (done: number) => void,
) {
  const zip = new JSZip();
  for (let i = 0; i < pages.length; i++) {
    zip.file(pageFileName(i, format), await renderPage(pages[i]!, format));
    onProgress?.(i + 1);
  }
  const out = await zip.generateAsync({ type: "blob" });
  const safe = title.replace(/[\\/:*?"<>|]+/g, "-").trim() || "chapter";
  downloadBlob(out, `${safe}.zip`);
}
