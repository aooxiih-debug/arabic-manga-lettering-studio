import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { BookOpen, Download, Loader2, Plus, ScanText, Sparkles, Trash2, Wand2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import heroInk from "@/assets/hero-ink.jpg";
import { NewChapterDialog } from "@/components/studio/NewChapterDialog";
import { PageThumb } from "@/components/studio/PageThumb";
import { Button } from "@/components/ui/button";
import { useChapters } from "@/hooks/use-studio-data";
import { createChapter, sampleFiles } from "@/lib/chapter-actions";
import { deleteChapter } from "@/lib/db";
import { processPages } from "@/lib/pipeline";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "حِبر — ترجمة المانجا والمانهوا إلى العربية بالذكاء الاصطناعي" },
      {
        name: "description",
        content:
          "ارفع فصلاً كاملاً، ودع الذكاء الاصطناعي يكشف الفقاعات وينظفها ويترجمها، ثم راجع وصدّر الصفحات من متصفحك.",
      },
      { property: "og:title", content: "حِبر — استوديو ترجمة المانجا" },
      {
        property: "og:description",
        content: "كشف الفقاعات، تنظيفها، ترجمتها للعربية، وتحريرها باللمس — كله من المتصفح.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const steps = [
  { icon: ScanText, title: "ارفع الفصل", text: "كل الصفحات دفعة واحدة" },
  { icon: Wand2, title: "الذكاء يعمل", text: "كشف، تغطية، وترجمة" },
  { icon: Download, title: "راجع وصدّر", text: "صورة أو ملف ZIP" },
];

function Home() {
  const chapters = useChapters();
  const navigate = useNavigate();
  const [sampleBusy, setSampleBusy] = useState(false);

  async function trySample() {
    setSampleBusy(true);
    try {
      const { chapterId, pageIds } = await createChapter("صفحة تجريبية", "", await sampleFiles());
      void processPages(chapterId, pageIds);
      navigate({ to: "/chapter/$chapterId", params: { chapterId } });
    } catch {
      toast.error("تعذّر تحميل الصفحة التجريبية");
    } finally {
      setSampleBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-stage">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 pt-5">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-3xl text-primary">حِبر</span>
          <span className="text-xs text-muted-foreground">استوديو ترجمة المانجا</span>
        </div>
        <NewChapterDialog
          trigger={
            <Button variant="panel" size="sm">
              <Plus /> فصل جديد
            </Button>
          }
        />
      </header>

      <section className="mx-auto max-w-6xl px-5 pt-6">
        <div className="relative overflow-hidden rounded-3xl border border-border">
          <img
            src={heroInk}
            alt="رسّام مانجا يحبّر صفحة وسط فقاعات كلام فارغة"
            width={1600}
            height={912}
            className="h-[22rem] w-full object-cover object-left sm:h-[26rem]"
          />
          <div className="absolute inset-0 bg-gradient-to-l from-background via-background/85 to-transparent" />
          <div className="absolute inset-0 flex flex-col justify-end p-6 sm:justify-center sm:p-10">
            <div className="max-w-md space-y-4">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
                <Sparkles className="size-3.5" /> من العمل اليدوي إلى التدقيق النهائي
              </span>
              <h1 className="font-display text-4xl leading-[1.15] sm:text-5xl">
                ترجم الفصل كاملاً… <span className="text-primary">وراجعه فقط</span>
              </h1>
              <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
                نكشف الفقاعات الإنجليزية، نغطيها بلون الخلفية، ونترجمها لحوار عربي حيّ. أنت تلمس وتعدّل وتصدّر.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <NewChapterDialog
                  trigger={
                    <Button variant="ember" size="xl">
                      <Plus /> ارفع فصلاً
                    </Button>
                  }
                />
                <Button variant="panel" size="xl" onClick={trySample} disabled={sampleBusy}>
                  {sampleBusy ? <Loader2 className="animate-spin" /> : <BookOpen />}
                  جرّب صفحة تجريبية
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-4">
          {steps.map((s, i) => (
            <div key={s.title} className="rounded-2xl border border-border bg-surface p-3 sm:p-5">
              <div className="flex items-center gap-2">
                <span className="font-display text-xl text-primary/70">{i + 1}</span>
                <s.icon className="size-4 text-primary" />
              </div>
              <div className="mt-2 text-sm font-semibold">{s.title}</div>
              <div className="text-xs text-muted-foreground">{s.text}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-10">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="font-display text-2xl">فصولك</h2>
          <span className="text-xs text-muted-foreground">محفوظة على هذا الجهاز</span>
        </div>
        {chapters === null ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[0, 1].map((i) => (
              <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : chapters.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface/60 bg-halftone px-6 py-12 text-center">
            <p className="font-medium">لا توجد فصول بعد</p>
            <p className="mt-1 text-sm text-muted-foreground">ارفع أول فصل أو جرّب الصفحة التجريبية.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {chapters.map((c) => (
              <div key={c.id} className="group relative overflow-hidden rounded-2xl border border-border bg-surface">
                <Link to="/chapter/$chapterId" params={{ chapterId: c.id }} className="block">
                  <PageThumb pageId={c.pageIds[0]} alt={c.title} className="aspect-[3/4] w-full" />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink via-ink/80 to-transparent p-3 pt-10">
                    <div className="truncate font-semibold">{c.title}</div>
                    <div className="text-xs text-muted-foreground">{c.pageIds.length} صفحة</div>
                  </div>
                </Link>
                <button
                  type="button"
                  aria-label="حذف الفصل"
                  onClick={async () => {
                    if (!confirm(`حذف "${c.title}" نهائيًا؟`)) return;
                    await deleteChapter(c.id);
                    toast.success("تم حذف الفصل");
                  }}
                  className="absolute left-2 top-2 rounded-lg bg-ink/70 p-2 text-muted-foreground backdrop-blur hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
