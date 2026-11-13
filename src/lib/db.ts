import { createStore, del, get, keys, set } from "idb-keyval";

import type { Chapter, CustomFont, Page } from "./types";

/** All work lives in this browser's IndexedDB; nothing is uploaded except images sent for AI analysis. */
let store: ReturnType<typeof createStore> | null = null;
function db() {
  store ??= createStore("manga-arab-studio", "kv");
  return store;
}

type Listener = (key: string) => void;
const listeners = new Set<Listener>();
export function onDbChange(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function emit(key: string) {
  listeners.forEach((l) => l(key));
}

export async function listChapters(): Promise<Chapter[]> {
  const all = (await keys(db())).filter((k) => String(k).startsWith("chapter:"));
  const chapters = await Promise.all(all.map((k) => get<Chapter>(k, db())));
  return chapters.filter((c): c is Chapter => !!c).sort((a, b) => b.updatedAt - a.updatedAt);
}

export const getChapter = (id: string) => get<Chapter>(`chapter:${id}`, db());

export async function saveChapter(chapter: Chapter) {
  await set(`chapter:${chapter.id}`, { ...chapter, updatedAt: Date.now() }, db());
  emit(`chapter:${chapter.id}`);
}

export async function deleteChapter(id: string) {
  const chapter = await getChapter(id);
  if (chapter) {
    await Promise.all(
      chapter.pageIds.flatMap((pid) => [del(`page:${pid}`, db()), del(`image:${pid}`, db())]),
    );
  }
  await del(`chapter:${id}`, db());
  emit(`chapter:${id}`);
}

export const getPage = (id: string) => get<Page>(`page:${id}`, db());

export async function getPages(ids: string[]): Promise<Page[]> {
  const pages = await Promise.all(ids.map((id) => getPage(id)));
  return pages.filter((p): p is Page => !!p);
}

export async function savePage(page: Page) {
  await set(`page:${page.id}`, { ...page, updatedAt: Date.now() }, db());
  emit(`page:${page.id}`);
}

export async function deletePage(chapterId: string, pageId: string) {
  const chapter = await getChapter(chapterId);
  if (chapter) await saveChapter({ ...chapter, pageIds: chapter.pageIds.filter((p) => p !== pageId) });
  await del(`page:${pageId}`, db());
  await del(`image:${pageId}`, db());
}

export const getPageImage = (pageId: string) => get<Blob>(`image:${pageId}`, db());
export const savePageImage = (pageId: string, blob: Blob) => set(`image:${pageId}`, blob, db());

export async function listFonts(): Promise<CustomFont[]> {
  return (await get<CustomFont[]>("fonts", db())) ?? [];
}
export const getFontFile = (id: string) => get<Blob>(`font:${id}`, db());
export async function saveFont(font: CustomFont, file: Blob) {
  await set(`font:${font.id}`, file, db());
  const fonts = await listFonts();
  await set("fonts", [...fonts.filter((f) => f.id !== font.id), font], db());
  emit("fonts");
}
export async function deleteFont(id: string) {
  await del(`font:${id}`, db());
  const fonts = await listFonts();
  await set("fonts", fonts.filter((f) => f.id !== id), db());
  emit("fonts");
}
