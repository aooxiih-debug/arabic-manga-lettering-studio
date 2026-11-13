import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Loader2,
  Pipette,
  Plus,
  RotateCw,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { BoxPanel, type PickTarget } from "@/components/studio/BoxPanel";
import { PageCanvas, type CanvasMode } from "@/components/studio/PageCanvas";
import { Button } from "@/components/ui/button";
import { useChapter, usePageImageUrl, usePipeline } from "@/hooks/use-studio-data";
import { registerCustomFonts } from "@/lib/custom-fonts";
import { onDbChange, getPageImage, listFonts, saveFont, savePage } from "@/lib/db";
import { downloadBlob, pageFileName, renderPage } from "@/lib/export";
import { BUILTIN_FONTS, DEFAULT_FONT, type FontOption } from "@/lib/fonts";
import { newId } from "@/lib/id";
import { contrastTextColor, imageToCanvas, loadImage, sampleColor } from "@/lib/image-utils";
import { processPages } from "@/lib/pipeline";
import { ensureFonts, fitFontSize } from "@/lib/text-layout";
import type { Page, TextBox } from "@/lib/types";

export const Route = createFileRoute("/edit/$chapterId")({
  validateSearch: (search: Record<string, unknown>) => ({ p: Math.max(0, Number(search['p']) || 0) }),
  head: () => ({
    meta: [
      { title: "المحرر — حِبر" },
      { name: "description", content: "راجع الترجمة العربية وعدّل مربعات النص والخطوط والألوان باللمس." },
      { property: "og:title", content: "المحرر — حِبر" },
      { property: "og:description", content: "راجع الترجمة العربية وعدّل مربعات النص والخطوط والألوان باللمس." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EditorPage,
});

function EditorPage() {
  const { chapterId } = Route.useParams();
  const { p } = Route.useSearch();
  const navigate = useNavigate();
  const { chapter, pages } = useChapter(chapterId);
  const pipeline = usePipeline();

  const index = Math.min(p, Math.max(0, pages.length - 1));
  const remote = pages[index];
  const [page, setPage] = useState<Page | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<CanvasMode>("select");
  const [pickTarget, setPickTarget] = useState<PickTarget>("bg");
  const [zoom, setZoom] = useState(1);
  const [showOriginal, setShowOriginal] = useState(false);
  const [fontsVersion, setFontsVersion] = useState(0);
  const [customFonts, setCustomFonts] = useState<FontOption[]>([]);
  const [downloading, setDownloading] = useState(false);
  const imageUrl = usePageImageUrl(page?.id);

  const history = useRef<TextBox[][]>([]);
  const lastPush = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<Page | null>(null);
  const pixels = useRef<{ pageId: string; data: ImageData } | null>(null);

  // Adopt the stored page when switching pages or when the AI pipeline changes its status.
  useEffect(() => {
    if (!remote) return;
    setPage((local) => {
      if (!local || local.id !== remote.id || local.status !== remote.status) {
        if (!local || local.id !== remote.id) {
          history.current = [];
          setSelectedId(null);
        }
        return remote;
      }
      return local;
    });
  }, [remote]);

  const flush = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    if (pendingSave.current) {
      void savePage(pendingSave.current);
      pendingSave.current = null;
    }
  }, []);

  useEffect(() => () => flush(), [flush, page?.id]);

  useEffect(() => {
    const refreshFonts = async () => {
      const list = await registerCustomFonts().catch(() => listFonts());
      setCustomFonts(list.map((f) => ({ family: f.family, label: `${f.fileName} (مرفوع)`, custom: true })));
      setFontsVersion((v) => v + 1);
    };
    void refreshFonts();
    const off = onDbChange((k) => k === "fonts" && void refreshFonts());
    const bump = () => setFontsVersion((v) => v + 1);
    document.fonts.addEventListener("loadingdone", bump);
    void document.fonts.ready.then(bump);
    return () => {
      off();
      document.fonts.removeEventListener("loadingdone", bump);
    };
  }, []);

  const fonts = useMemo(() => [...BUILTIN_FONTS, ...customFonts], [customFonts]);

  const updateBoxes = useCallback(
    (fn: (boxes: TextBox[]) => TextBox[], forceHistory = false) => {
      setPage((prev) => {
        if (!prev) return prev;
        const now = Date.now();
        if (forceHistory || now - lastPush.current > 700) {
          history.current = [...history.current.slice(-40), prev.boxes];
        }
        lastPush.current = now;
        const next = { ...prev, boxes: fn(prev.boxes) };
        pendingSave.current = next;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(flush, 400);
        return next;
      });
    },
    [flush],
  );

  const changeBox = useCallback(
    (id: string, patch: Partial<TextBox>) => updateBoxes((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b))),
    [updateBoxes],
  );

  function undo() {
    const prev = history.current.pop();
    if (!prev || !page) return;
    const next = { ...page, boxes: prev };
    setPage(next);
    pendingSave.current = next;
    flush();
  }

  async function getPixels() {
    if (!page) return null;
    if (pixels.current?.pageId === page.id) return pixels.current.data;
    const blob = await getPageImage(page.id);
    if (!blob) return null;
    const img = await loadImage(blob);
    const { canvas, ctx } = imageToCanvas(img);
    URL.revokeObjectURL(img.src);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    pixels.current = { pageId: page.id, data };
    return data;
  }

  async function handleTap(fx: number, fy: number) {
    if (!page) return;
    const data = await getPixels();
    if (mode === "pick" && selectedId && data) {
      const color = sampleColor(data, fx * data.width, fy * data.height, 2);
      changeBox(selectedId, { [pickTarget]: color } as Partial<TextBox>);
      setMode("select");
      toast.success("تم التقاط اللون");
      return;
    }
    if (mode === "add") {
      const w = 0.3, h = 0.08;
      const x = Math.min(1 - w, Math.max(0, fx - w / 2));
      const y = Math.min(1 - h, Math.max(0, fy - h / 2));
      const bg = data ? sampleColor(data, fx * data.width, fy * data.height, 3) : "#ffffff";
      await ensureFonts([DEFAULT_FONT]);
      const text = "نص جديد";
      const box: TextBox = {
        id: newId(),
        x, y, w, h,
        original: "",
        text,
        kind: "speech",
        fontFamily: DEFAULT_FONT,
        fontSize: fitFontSize(text, DEFAULT_FONT, true, w * page.width, h * page.height, 1.3),
        bold: true,
        align: "center",
        lineHeight: 1.3,
        color: contrastTextColor(bg),
        bg,
        fill: true,
        shape: "rect",
        strokeColor: "#ffffff",
        strokeWidth: 0,
      };
      updateBoxes((bs) => [...bs, box], true);
      setSelectedId(box.id);
      setMode("select");
    }
  }

  async function uploadFont(file: File) {
    if (!/\.(ttf|otf)$/i.test(file.name)) {
      toast.error("الخط يجب أن يكون بصيغة TTF أو OTF");
      return;
    }
    const base = file.name.replace(/\.(ttf|otf)$/i, "");
    const family = `custom-${base.replace(/[^\p{L}\p{N}_-]+/gu, "-")}`;
    try {
      const face = new FontFace(family, await file.arrayBuffer());
      await face.load();
      document.fonts.add(face);
      await saveFont({ id: newId(), family, fileName: base }, file);
      if (selectedId) changeBox(selectedId, { fontFamily: family });
      toast.success(`أضيف الخط ${base}`);
    } catch {
      toast.error("تعذّر قراءة ملف الخط");
    }
  }

  async function downloadCurrent() {
    if (!page) return;
    flush();
    setDownloading(true);
    try {
      downloadBlob(await renderPage(page, "png"), pageFileName(index, "png"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر التحميل");
    } finally {
      setDownloading(false);
    }
  }

  function goTo(i: number) {
    flush();
    navigate({ to: "/edit/$chapterId", params: { chapterId }, search: { p: i }, replace: true });
  }

  if (chapter === null)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p>هذا الفصل غير موجود على هذا الجهاز.</p>
        <Button asChild variant="panel">
          <Link to="/">الرئيسية</Link>
        </Button>
      </div>
    );
  if (!chapter || !page)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );

  const selected = page.boxes.find((b) => b.id === selectedId) ?? null;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
      <header className="flex items-center gap-1 border-b border-border bg-surface px-2 py-2">
        <Button asChild variant="ghost" size="icon" aria-label="رجوع للفصل">
          <Link to="/chapter/$chapterId" params={{ chapterId }} onClick={flush}>
            <ArrowRight />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{chapter.title}</div>
          <div className="text-[11px] text-muted-foreground">
            صفحة {index + 1} من {pages.length} · {page.boxes.length} مربع
          </div>
        </div>
        <Button variant="ghost" size="icon" disabled={index <= 0} onClick={() => goTo(index - 1)} aria-label="الصفحة السابقة">
          <ChevronRight />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={index >= pages.length - 1}
          onClick={() => goTo(index + 1)}
          aria-label="الصفحة التالية"
        >
          <ChevronLeft />
        </Button>
        <Button variant="ember" size="sm" onClick={downloadCurrent} disabled={downloading} aria-label="تحميل الصفحة">
          {downloading ? <Loader2 className="animate-spin" /> : <Download />}
          <span className="hidden sm:inline">تحميل الصفحة</span>
        </Button>
      </header>

      {mode !== "select" && (
        <div className="flex items-center justify-between gap-2 bg-primary px-3 py-2 text-sm text-primary-foreground">
          <span className="flex items-center gap-2">
            {mode === "pick" ? <Pipette className="size-4" /> : <Plus className="size-4" />}
            {mode === "pick" ? "انقر على الصورة لالتقاط اللون" : "انقر مكان المربع الجديد على الصفحة"}
          </span>
          <button type="button" onClick={() => setMode("select")} aria-label="إلغاء" className="rounded p-1">
            <X className="size-4" />
          </button>
        </div>
      )}

      {page.status === "error" && (
        <div className="flex items-center justify-between gap-2 bg-destructive/15 px-3 py-2 text-xs text-destructive">
          <span>{page.error ?? "تعذّرت معالجة هذه الصفحة"}</span>
          <Button size="sm" variant="panel" disabled={pipeline.running} onClick={() => processPages(chapterId, [page.id])}>
            <RotateCw /> إعادة
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative min-h-0 flex-1">
          <PageCanvas
            page={page}
            imageUrl={imageUrl}
            selectedId={selectedId}
            mode={mode}
            zoom={zoom}
            showOriginal={showOriginal}
            fontsVersion={fontsVersion}
            onSelect={setSelectedId}
            onChangeBox={changeBox}
            onCommit={flush}
            onTap={handleTap}
          />
        </div>

        {selected ? (
          <div className="lg:w-96">
            <BoxPanel
              key={selected.id}
              box={selected}
              fonts={fonts}
              onChange={(patch) => changeBox(selected.id, patch)}
              onCommit={flush}
              onDelete={() => {
                updateBoxes((bs) => bs.filter((b) => b.id !== selected.id), true);
                setSelectedId(null);
              }}
              onDuplicate={() => {
                const copy = { ...selected, id: newId(), x: Math.min(1 - selected.w, selected.x + 0.02), y: Math.min(1 - selected.h, selected.y + 0.02) };
                updateBoxes((bs) => [...bs, copy], true);
                setSelectedId(copy.id);
              }}
              onFit={async () => {
                await ensureFonts([selected.fontFamily]);
                changeBox(selected.id, {
                  fontSize: fitFontSize(
                    selected.text,
                    selected.fontFamily,
                    selected.bold,
                    selected.w * page.width,
                    selected.h * page.height,
                    selected.lineHeight,
                  ),
                });
              }}
              onPick={(target) => {
                setPickTarget(target);
                setMode("pick");
              }}
              onUploadFont={uploadFont}
              onClose={() => setSelectedId(null)}
            />
          </div>
        ) : (
          <nav className="flex items-center justify-around gap-1 border-t border-border bg-surface px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:w-20 lg:flex-col lg:justify-start lg:border-s lg:border-t-0 lg:py-4">
            <ToolButton label="إضافة نص" active={mode === "add"} onClick={() => setMode(mode === "add" ? "select" : "add")}>
              <Plus />
            </ToolButton>
            <ToolButton label={showOriginal ? "الترجمة" : "الأصل"} active={showOriginal} onClick={() => setShowOriginal((v) => !v)}>
              {showOriginal ? <EyeOff /> : <Eye />}
            </ToolButton>
            <ToolButton label="تراجع" disabled={!history.current.length} onClick={undo}>
              <Undo2 />
            </ToolButton>
            <ToolButton label="تصغير" disabled={zoom <= 0.5} onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}>
              <ZoomOut />
            </ToolButton>
            <ToolButton label="تكبير" disabled={zoom >= 4} onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}>
              <ZoomIn />
            </ToolButton>
          </nav>
        )}
      </div>
    </div>
  );
}

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-active={active}
      className="flex min-w-14 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-35 data-[active=true]:bg-primary/15 data-[active=true]:text-primary [&_svg]:size-5"
    >
      {children}
      {label}
    </button>
  );
}
