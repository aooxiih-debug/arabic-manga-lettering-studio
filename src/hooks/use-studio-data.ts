import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { getChapter, getDisplayImage, getPageImage, getPages, listChapters, onDbChange } from "@/lib/db";
import { getPipelineState, subscribePipeline } from "@/lib/pipeline";
import type { Chapter, Page } from "@/lib/types";

export function useChapters() {
  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  const reload = useCallback(() => {
    listChapters().then(setChapters);
  }, []);
  useEffect(() => {
    reload();
    const off = onDbChange((key) => {
      if (key.startsWith("chapter:") || key.startsWith("page:")) reload();
    });
    return () => {
      off();
    };
  }, [reload]);
  return chapters;
}

export function useChapter(chapterId: string) {
  const [chapter, setChapter] = useState<Chapter | null | undefined>(undefined);
  const [pages, setPages] = useState<Page[]>([]);
  const reload = useCallback(async () => {
    const c = await getChapter(chapterId);
    setChapter(c ?? null);
    setPages(c ? await getPages(c.pageIds) : []);
  }, [chapterId]);
  useEffect(() => {
    reload();
    const off = onDbChange((key) => {
      if (key === `chapter:${chapterId}` || key.startsWith("page:")) reload();
    });
    return () => {
      off();
    };
  }, [chapterId, reload]);
  return { chapter, pages, reload };
}

export function usePipeline() {
  return useSyncExternalStore(subscribePipeline, getPipelineState, getPipelineState);
}

/** Object URL for a stored page image (erased version by default), refreshed when the eraser changes it. */
export function usePageImageUrl(pageId: string | undefined, variant: "display" | "original" = "display") {
  const [url, setUrl] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!pageId) return;
    const off = onDbChange((k) => k === `image:${pageId}` && setVersion((v) => v + 1));
    return () => {
      off();
    };
  }, [pageId]);
  useEffect(() => {
    setUrl(null);
  }, [pageId, variant]);
  useEffect(() => {
    if (!pageId) return;
    let active = true;
    let created: string | null = null;
    (variant === "original" ? getPageImage(pageId) : getDisplayImage(pageId)).then((blob) => {
      if (!active || !blob) return;
      created = URL.createObjectURL(blob);
      setUrl(created);
    });
    return () => {
      active = false;
      // Revoke after the next image has had time to load, so the page never flashes empty.
      if (created) {
        const old = created;
        setTimeout(() => URL.revokeObjectURL(old), 3000);
      }
    };
  }, [pageId, variant, version]);
  return url;
}
