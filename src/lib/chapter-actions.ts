import { getChapter, saveChapter, savePage, savePageImage } from "./db";
import { newId } from "./id";
import { loadImage } from "./image-utils";
import type { Chapter, Page } from "./types";

const naturalCompare = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }).compare;

export function sortFiles(files: File[]) {
  return [...files].filter((f) => f.type.startsWith("image/")).sort((a, b) => naturalCompare(a.name, b.name));
}

export async function addPagesToChapter(chapterId: string, files: File[]) {
  const chapter = await getChapter(chapterId);
  if (!chapter) throw new Error("الفصل غير موجود");
  const ids: string[] = [];
  for (const file of sortFiles(files)) {
    const img = await loadImage(file);
    const id = newId();
    const page: Page = {
      id,
      chapterId,
      name: file.name,
      width: img.naturalWidth,
      height: img.naturalHeight,
      status: "pending",
      boxes: [],
      updatedAt: Date.now(),
    };
    URL.revokeObjectURL(img.src);
    await savePageImage(id, file);
    await savePage(page);
    ids.push(id);
  }
  const fresh = (await getChapter(chapterId)) ?? chapter;
  await saveChapter({ ...fresh, pageIds: [...fresh.pageIds, ...ids] });
  return ids;
}

export async function createChapter(title: string, notes: string, files: File[]) {
  const chapter: Chapter = {
    id: newId(),
    title: title.trim() || "فصل جديد",
    notes,
    pageIds: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await saveChapter(chapter);
  const pageIds = await addPagesToChapter(chapter.id, files);
  return { chapterId: chapter.id, pageIds };
}

export async function sampleFiles() {
  const res = await fetch("/samples/sample-page-1.jpg");
  const blob = await res.blob();
  return [new File([blob], "sample-page-1.jpg", { type: "image/jpeg" })];
}
