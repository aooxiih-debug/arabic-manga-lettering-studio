import { Link, createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileArchive,
  ImagePlus,
  Loader2,
  Play,
  RotateCw,
  Square,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { PageThumb } from "@/components/studio/PageThumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useChapter, usePipeline } from "@/hooks/use-studio-data";
import { addPagesToChapter } from "@/lib/chapter-actions";
import { deletePage, saveChapter } from "@/lib/db";
import { exportChapterZip, type ExportFormat } from "@/lib/export";
import { cancelPipeline, processPages, resetStalePages } from "@/lib/pipeline";
import type { Page } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/chapter/$chapterId")({
  head: () => ({
    meta: [
      { title: "الفصل — حِبر" },
      { name: "description", content: "تابع ترجمة صفحات الفصل وراجعها وصدّرها." },
      { property: "og:title", content: "الفصل — حِبر" },
      { property: "og:description", content: "تابع ترجمة صفحات الفصل وراجعها وصدّرها." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChapterPage,
});

function StatusBadge({ page, active }: { page: Page; active: boolean }) {
  if (active || page.status === "processing")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-[11px] text-primary">
        <Loader2 className="size-3 animate-spin" /> جارٍ
      </span>
    );
  if (page.status === "done")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] text-success">
        <CheckCircle2 className="size-3" /> {page.boxes.length} فقاعة
      </span>
    );
  if (page.status === "error")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] text-destructive">
        <AlertTriangle className="size-3" /> خطأ
      </span>
    );
  return <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">بالانتظار</span>;
}

function ChapterPage() {
  const { chapterId } = Route.useParams();
  const { chapter, pages } = useChapter(chapterId);
  const pipeline = usePipeline();
  const addRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [format, setFormat] = useState<ExportFormat>("png");
  const [exporting, setExporting] = useState<number | null>(null);

  useEffect(() => {
    void resetStalePages(pages);
  }, [pages]);

  useEffect(() => {
    if (chapter) {
      setTitle(chapter.title);
      setNotes(chapter.notes);
    }
    // only when the chapter id changes, so typing is not overwritten by saves
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter?.id]);

  if (chapter === undefined)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  if (chapter === null)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p>هذا الفصل غير موجود على هذا الجهاز.</p>
        <Button asChild variant="panel">
          <Link to="/">الرئيسية</Link>
        </Button>
      </div>
    );

  const runningHere = pipeline.running && pipeline.chapterId === chapterId;
  const remaining = pages.filter((p) => p.status === "pending" || p.status === "error");
  const doneCount = pages.filter((p) => p.status === "done").length;

  async function doExport() {
    if (!pages.length) return;
    setExporting(0);
    try {
      await exportChapterZip(title, pages, format, setExporting);
      toast.success("تم تجهيز ملف ZIP");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر التصدير");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="min-h-screen bg-stage pb-16">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3">
          <Button asChild variant="ghost" size="icon" aria-label="رجوع">
            <Link to="/">
              <ArrowRight />
            </Link>
          </Button>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title !== chapter.title && saveChapter({ ...chapter, title })}
            className="h-9 border-transparent bg-transparent text-lg font-semibold focus-visible:border-input"
            aria-label="اسم الفصل"
          />
          <span className="shrink-0 text-xs text-muted-foreground">
            {doneCount}/{pages.length}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 pt-4">
        <section className="rounded-2xl border border-border bg-surface p-4">
          {runningHere ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  الذكاء الاصطناعي يترجم الصفحات…
                </span>
                <span className="text-muted-foreground">
                  {pipeline.done}/{pipeline.total}
                </span>
              </div>
              <Progress value={(pipeline.done / Math.max(1, pipeline.total)) * 100} />
              <Button variant="panel" size="sm" onClick={cancelPipeline}>
                <Square /> إيقاف بعد الصفحة الحالية
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {remaining.length > 0 && (
                <Button
                  variant="ember"
                  onClick={() => processPages(chapterId, remaining.map((p) => p.id))}
                  disabled={pipeline.running}
                >
                  <Play /> ترجمة {remaining.length} صفحة
                </Button>
              )}
              <Button variant="panel" onClick={() => addRef.current?.click()}>
                <ImagePlus /> إضافة صفحات
              </Button>
              <div className="flex items-center gap-1 rounded-md border border-border bg-surface-raised p-0.5">
                {(["png", "jpeg"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFormat(f)}
                    className={cn(
                      "rounded px-2 py-1 text-xs uppercase",
                      format === f ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                    )}
                  >
                    {f === "png" ? "PNG" : "JPG"}
                  </button>
                ))}
              </div>
              <Button variant="panel" onClick={doExport} disabled={exporting !== null || !pages.length}>
                {exporting !== null ? <Loader2 className="animate-spin" /> : <FileArchive />}
                {exporting !== null ? `${exporting}/${pages.length}` : "تصدير ZIP"}
              </Button>
            </div>
          )}
          {pipeline.blocked && pipeline.chapterId === chapterId && (
            <p className="mt-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{pipeline.blocked}</p>
          )}
          <input
            ref={addRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (!files.length) return;
              const ids = await addPagesToChapter(chapterId, files);
              toast.success(`أضيفت ${ids.length} صفحة`);
              if (!pipeline.running) void processPages(chapterId, ids);
            }}
          />
        </section>

        <details className="rounded-2xl border border-border bg-surface p-4 [&_summary]:cursor-pointer">
          <summary className="text-sm font-medium">ملاحظات للمترجم الذكي</summary>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== chapter.notes && saveChapter({ ...chapter, notes })}
            rows={3}
            className="mt-3"
            placeholder="أسماء الشخصيات، الأسلوب، مصطلحات ثابتة…"
          />
          <p className="mt-2 text-xs text-muted-foreground">تُستخدم عند ترجمة الصفحات التالية أو إعادة ترجمتها.</p>
        </details>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {pages.map((page, index) => {
            const active = runningHere && pipeline.currentPageId === page.id;
            return (
              <div key={page.id} className="overflow-hidden rounded-2xl border border-border bg-surface">
                <Link
                  to="/edit/$chapterId"
                  params={{ chapterId }}
                  search={{ p: index }}
                  className="relative block"
                >
                  <PageThumb pageId={page.id} alt={`صفحة ${index + 1}`} className="aspect-[3/4] w-full" />
                  {active && (
                    <div className="pointer-events-none absolute inset-0 overflow-hidden">
                      <div className="animate-scan h-1/3 w-full bg-gradient-to-b from-transparent via-primary/30 to-transparent" />
                    </div>
                  )}
                  <span className="absolute right-2 top-2 rounded-md bg-ink/80 px-2 py-0.5 font-display text-sm">
                    {index + 1}
                  </span>
                </Link>
                <div className="flex items-center justify-between gap-1 p-2">
                  <StatusBadge page={page} active={active} />
                  <div className="flex">
                    <button
                      type="button"
                      aria-label="إعادة الترجمة"
                      disabled={pipeline.running}
                      onClick={() => {
                        if (page.boxes.length && !confirm("إعادة الترجمة ستستبدل تعديلات هذه الصفحة. متابعة؟")) return;
                        void processPages(chapterId, [page.id]);
                      }}
                      className="rounded-md p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
                    >
                      <RotateCw className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="حذف الصفحة"
                      disabled={active}
                      onClick={async () => {
                        if (!confirm("حذف هذه الصفحة؟")) return;
                        await deletePage(chapterId, page.id);
                      }}
                      className="rounded-md p-1.5 text-muted-foreground hover:text-destructive disabled:opacity-40"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
                {page.status === "error" && page.error && (
                  <p className="px-2 pb-2 text-[11px] leading-snug text-destructive">{page.error}</p>
                )}
              </div>
            );
          })}
        </section>
      </main>
    </div>
  );
}
