import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { getChapter, getPageImage, getPages, listChapters, onDbChange } from "@/lib/db";
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

/** Object URL for a stored page image, revoked on unmount. */
export function usePageImageUrl(pageId: string | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!pageId) return;
    let active = true;
    let created: string | null = null;
    getPageImage(pageId).then((blob) => {
      if (!active || !blob) return;
      created = URL.createObjectURL(blob);
      setUrl(created);
    });
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
      setUrl(null);
    };
  }, [pageId]);
  return url;
}
