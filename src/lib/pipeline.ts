import { translatePageFn } from "./ai/translate.functions";
import { getChapter, getPage, getPageImage, getPages, savePage } from "./db";
import { DEFAULT_FONT } from "./fonts";
import { newId } from "./id";
import { contrastTextColor, dominantColor, imageToCanvas, loadImage, toAnalysisDataUrl } from "./image-utils";
import { ensureFonts, fitFontSize } from "./text-layout";
import type { Page, TextBox } from "./types";

export type PipelineState = {
  running: boolean;
  chapterId?: string | undefined;
  currentPageId?: string | undefined;
  done: number;
  total: number;
  /** Set when the AI refuses all further work (credits, permissions); the queue stops. */
  blocked?: string | undefined;
};

let state: PipelineState = { running: false, done: 0, total: 0 };
const listeners = new Set<(s: PipelineState) => void>();
let cancelRequested = false;

function setState(patch: Partial<PipelineState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}
export function getPipelineState() {
  return state;
}
export function subscribePipeline(listener: (s: PipelineState) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function cancelPipeline() {
  cancelRequested = true;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type Detection = { x1: number; y1: number; x2: number; y2: number; original: string; arabic: string; kind: string };

/** Turns a tight lettering box (0-1000 coords) into a padded, colour-matched editable cover box. */
export function detectionToBox(d: Detection, data: ImageData): TextBox {
  const W = data.width, H = data.height;
  let x1 = (d.x1 / 1000) * W, y1 = (d.y1 / 1000) * H, x2 = (d.x2 / 1000) * W, y2 = (d.y2 / 1000) * H;
  const bw = x2 - x1, bh = y2 - y1;
  const padX = bw * 0.08 + W * 0.006, padY = bh * 0.12 + H * 0.004;
  x1 = Math.max(0, x1 - padX); y1 = Math.max(0, y1 - padY);
  x2 = Math.min(W, x2 + padX); y2 = Math.min(H, y2 + padY);
  const w = x2 - x1, h = y2 - y1;
  const bg = dominantColor(data, { x: x1, y: y1, w, h });
  const lineHeight = 1.3;
  return {
    id: newId(),
    x: x1 / W, y: y1 / H, w: w / W, h: h / H,
    original: d.original,
    text: d.arabic,
    kind: d.kind,
    fontFamily: DEFAULT_FONT,
    fontSize: fitFontSize(d.arabic, DEFAULT_FONT, true, w, h, lineHeight),
    bold: true,
    align: "center",
    lineHeight,
    color: contrastTextColor(bg),
    bg,
    fill: true,
    shape: "rect",
    strokeColor: "#ffffff",
    strokeWidth: 0,
  };
}

async function previousLines(chapterId: string, pageId: string) {
  const chapter = await getChapter(chapterId);
  if (!chapter) return [];
  const idx = chapter.pageIds.indexOf(pageId);
  const before = await getPages(chapter.pageIds.slice(Math.max(0, idx - 3), Math.max(0, idx)));
  return before
    .flatMap((p) => p.boxes.map((b) => `${b.original} => ${b.text}`))
    .filter((l) => l.length < 480)
    .slice(-20);
}

async function processOne(page: Page, notes: string): Promise<"ok" | "stop"> {
  await savePage({ ...page, status: "processing", error: undefined });
  const blob = await getPageImage(page.id);
  if (!blob) {
    await savePage({ ...page, status: "error", error: "الصورة غير موجودة" });
    return "ok";
  }
  const img = await loadImage(blob);
  const imageDataUrl = toAnalysisDataUrl(img);
  const lines = await previousLines(page.chapterId, page.id);

  for (let attempt = 0; attempt < 4; attempt++) {
    if (cancelRequested) {
      await savePage({ ...page, status: page.boxes.length ? "done" : "pending" });
      return "stop";
    }
    let res: Awaited<ReturnType<typeof translatePageFn>>;
    try {
      res = await translatePageFn({ data: { imageDataUrl, notes, previousLines: lines } });
    } catch (e) {
      res = { ok: false, status: 503, message: e instanceof Error ? e.message : "انقطع الاتصال" };
    }
    if (res.ok) {
      await ensureFonts([DEFAULT_FONT]);
      const { ctx, canvas } = imageToCanvas(img);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const boxes = res.bubbles.map((d) => detectionToBox(d, data));
      const fresh = (await getPage(page.id)) ?? page;
      await savePage({ ...fresh, status: "done", error: undefined, boxes });
      URL.revokeObjectURL(img.src);
      return "ok";
    }
    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < 3) {
      await sleep(4000 * 2 ** attempt + Math.random() * 1500);
      continue;
    }
    const fresh = (await getPage(page.id)) ?? page;
    await savePage({ ...fresh, status: "error", error: res.message });
    if (res.status === 402 || res.status === 403 || res.status === 401) {
      setState({ blocked: res.message });
      return "stop";
    }
    return "ok";
  }
  return "ok";
}

/** A reload interrupts the queue mid-page; put such pages back in line so they can be translated again. */
export async function resetStalePages(pages: Page[]) {
  if (state.running) return;
  await Promise.all(
    pages
      .filter((p) => p.status === "processing")
      .map((p) => savePage({ ...p, status: p.boxes.length ? "done" : "pending" })),
  );
}

/** Runs pages one by one so each page can reuse the previous pages' lines for consistent names and tone. */
export async function processPages(chapterId: string, pageIds: string[]) {
  if (state.running) return;
  cancelRequested = false;
  setState({ running: true, chapterId, done: 0, total: pageIds.length, blocked: undefined });
  try {
    const chapter = await getChapter(chapterId);
    for (const id of pageIds) {
      if (cancelRequested) break;
      const page = await getPage(id);
      if (!page) continue;
      setState({ currentPageId: id });
      const outcome = await processOne(page, chapter?.notes ?? "");
      setState({ done: state.done + 1 });
      if (outcome === "stop") break;
    }
  } finally {
    setState({ running: false, currentPageId: undefined });
  }
}
