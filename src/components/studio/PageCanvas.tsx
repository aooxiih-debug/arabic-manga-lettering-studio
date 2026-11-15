import { RotateCw } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { fontCss } from "@/lib/fonts";
import { drawBoxText, layoutBox, shapeRadius } from "@/lib/text-layout";
import type { Page, TextBox } from "@/lib/types";
import { cn } from "@/lib/utils";

export type CanvasMode = "select" | "add" | "pick" | "erase";
type Handle = "move" | "rotate" | "nw" | "ne" | "sw" | "se";

const MIN = 0.02;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Curved lines can't be done with CSS, so they are painted with the same canvas code the download uses. */
function CurvedText({ box, page, scale, fontsVersion }: { box: TextBox; page: Page; scale: number; fontsVersion: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const layout = useMemo(
    () => layoutBox(box, page.width, page.height),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [box, page.width, page.height, fontsVersion],
  );
  const margin = Math.max(layout.w, layout.h) * 0.5;
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const fullW = layout.w + margin * 2, fullH = layout.h + margin * 2;
    const k = Math.min(scale * dpr, 4096 / Math.max(fullW, fullH));
    canvas.width = Math.max(1, Math.round(fullW * k));
    canvas.height = Math.max(1, Math.round(fullH * k));
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, fullW, fullH);
    ctx.translate(-(layout.x - margin), -(layout.y - margin));
    drawBoxText(ctx, box, layout);
  }, [box, layout, margin, scale]);
  return (
    <canvas
      ref={ref}
      className="pointer-events-none absolute"
      style={{
        left: -margin * scale,
        top: -margin * scale,
        width: (layout.w + margin * 2) * scale,
        height: (layout.h + margin * 2) * scale,
      }}
    />
  );
}

function BoxView({
  box,
  page,
  scale,
  selected,
  interactive,
  fontsVersion,
  onPointerDown,
}: {
  box: TextBox;
  page: Page;
  scale: number;
  selected: boolean;
  interactive: boolean;
  fontsVersion: number;
  onPointerDown: (e: React.PointerEvent, handle: Handle) => void;
}) {
  const layout = useMemo(
    () => layoutBox(box, page.width, page.height),
    // fontsVersion re-measures once web or uploaded fonts finish loading
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [box, page.width, page.height, fontsVersion],
  );
  const radius = box.shape === "ellipse" ? "50%" : `${shapeRadius(layout.w, layout.h) * scale}px`;
  const lineH = layout.lineHeightPx * scale;
  const curved = !!box.curve;
  return (
    <div
      data-box-id={box.id}
      className={cn(
        "absolute select-none",
        interactive ? "touch-none cursor-move" : "pointer-events-none",
        selected ? "z-10" : "",
      )}
      style={{
        left: `${box.x * 100}%`,
        top: `${box.y * 100}%`,
        width: `${box.w * 100}%`,
        height: `${box.h * 100}%`,
        transform: box.rotation ? `rotate(${box.rotation}deg)` : undefined,
      }}
      onPointerDown={(e) => onPointerDown(e, "move")}
    >
      <div
        className="absolute inset-0"
        style={{ background: box.fill ? box.bg : "transparent", borderRadius: radius }}
      />
      {curved ? (
        <CurvedText box={box} page={page} scale={scale} fontsVersion={fontsVersion} />
      ) : (
        <div
          className="absolute inset-0 flex flex-col justify-center"
          dir="rtl"
          style={{
            padding: layout.pad * scale,
            color: box.color,
            fontFamily: fontCss(box.fontFamily),
            fontWeight: box.bold ? 700 : 400,
            fontSize: layout.fontPx * scale,
            textAlign: box.align,
            WebkitTextStroke: box.strokeWidth > 0 ? `${box.strokeWidth * 2 * scale}px ${box.strokeColor}` : undefined,
            paintOrder: "stroke fill",
          }}
        >
          {layout.lines.map((line, i) => (
            <div key={i} className="whitespace-pre" style={{ height: lineH, lineHeight: `${lineH}px` }}>
              {line || "\u00a0"}
            </div>
          ))}
        </div>
      )}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 rounded-sm",
          selected ? "outline-2 outline-dashed outline-primary" : "outline-1 outline-dashed outline-primary/35",
        )}
      />
      {selected && interactive && (
        <>
          {(["nw", "ne", "sw", "se"] as const).map((h) => (
            <div
              key={h}
              role="presentation"
              onPointerDown={(e) => onPointerDown(e, h)}
              className={cn(
                "absolute size-6 touch-none rounded-full border-2 border-background bg-primary shadow-ember",
                h.includes("n") ? "-top-3" : "-bottom-3",
                h.includes("w") ? "-left-3" : "-right-3",
                h === "nw" || h === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize",
              )}
            />
          ))}
          <div className="pointer-events-none absolute -top-9 left-1/2 h-6 w-px -translate-x-1/2 bg-primary" />
          <div
            role="presentation"
            aria-label="تدوير"
            onPointerDown={(e) => onPointerDown(e, "rotate")}
            className="absolute -top-14 left-1/2 flex size-8 -translate-x-1/2 cursor-grab touch-none items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-ember [&_svg]:size-4"
          >
            <RotateCw />
          </div>
        </>
      )}
    </div>
  );
}

/** Brush layer for the Magic Eraser, drawn at the page's own pixel size so the mask lines up exactly. */
function EraseLayer({
  page,
  scale,
  brush,
  panning,
  maskRef,
  onPaint,
}: {
  page: Page;
  scale: number;
  brush: number;
  panning: boolean;
  maskRef: React.RefObject<HTMLCanvasElement | null>;
  onPaint: () => void;
}) {
  const last = useRef<{ x: number; y: number } | null>(null);
  const color = useRef("#ff6a2b");
  useEffect(() => {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
    const probe = document.createElement("canvas").getContext("2d")!;
    probe.fillStyle = v;
    if (v && probe.fillStyle !== "#000000") color.current = v;
  }, []);

  function point(e: React.PointerEvent) {
    const rect = maskRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * page.width,
      y: ((e.clientY - rect.top) / rect.height) * page.height,
    };
  }
  function paint(from: { x: number; y: number }, to: { x: number; y: number }) {
    const ctx = maskRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = color.current;
    ctx.fillStyle = color.current;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = brush / scale;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(to.x, to.y, brush / scale / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  return (
    <canvas
      ref={maskRef}
      width={page.width}
      height={page.height}
      data-testid="erase-layer"
      className={cn(
        "absolute inset-0 h-full w-full opacity-55",
        panning ? "pointer-events-none" : "touch-none cursor-crosshair",
      )}
      onPointerDown={(e) => {
        e.stopPropagation();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        const p = point(e);
        last.current = p;
        paint(p, p);
        onPaint();
      }}
      onPointerMove={(e) => {
        if (!last.current) return;
        const p = point(e);
        paint(last.current, p);
        last.current = p;
      }}
      onPointerUp={() => (last.current = null)}
      onPointerCancel={() => (last.current = null)}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

export function PageCanvas({
  page,
  imageUrl,
  selectedId,
  mode,
  zoom,
  showOriginal,
  fontsVersion,
  eraseBrush = 30,
  erasePanning = false,
  maskRef,
  onMaskPaint,
  onSelect,
  onChangeBox,
  onCommit,
  onTap,
}: {
  page: Page;
  imageUrl: string | null;
  selectedId: string | null;
  mode: CanvasMode;
  zoom: number;
  showOriginal: boolean;
  fontsVersion: number;
  eraseBrush?: number;
  erasePanning?: boolean;
  maskRef?: React.RefObject<HTMLCanvasElement | null>;
  onMaskPaint?: () => void;
  onSelect: (id: string | null) => void;
  onChangeBox: (id: string, patch: Partial<TextBox>) => void;
  onCommit: () => void;
  onTap: (fx: number, fy: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(0);
  const drag = useRef<{
    id: string;
    handle: Handle;
    startX: number;
    startY: number;
    box: TextBox;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerW(el.clientWidth));
    ro.observe(el);
    setContainerW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const baseW = Math.max(200, Math.min(containerW - 24, 860));
  const stageW = baseW * zoom;
  const scale = stageW / page.width;
  const interactive = mode === "select" && !showOriginal;
  const erasing = mode === "erase";

  function startDrag(e: React.PointerEvent, box: TextBox, handle: Handle) {
    if (!interactive) return;
    e.stopPropagation();
    onSelect(box.id);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: box.id, handle, startX: e.clientX, startY: e.clientY, box: { ...box }, moved: false };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    const stage = stageRef.current;
    if (!d || !stage) return;
    const rect = stage.getBoundingClientRect();
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 4) return;
    d.moved = true;
    const b = d.box;
    const W = rect.width, H = rect.height;

    if (d.handle === "rotate") {
      const cx = rect.left + (b.x + b.w / 2) * W, cy = rect.top + (b.y + b.h / 2) * H;
      let deg = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90;
      if (deg > 180) deg -= 360;
      const snap = Math.round(deg / 45) * 45;
      if (Math.abs(deg - snap) < 4) deg = snap;
      onChangeBox(d.id, { rotation: Math.round(deg) === -180 ? 180 : Math.round(deg) });
      return;
    }

    const dxPx = e.clientX - d.startX, dyPx = e.clientY - d.startY;
    if (d.handle === "move") {
      onChangeBox(d.id, { x: clamp(b.x + dxPx / W, 0, 1 - b.w), y: clamp(b.y + dyPx / H, 0, 1 - b.h) });
      return;
    }

    // Resize in the box's own (rotated) axes, keeping the opposite corner where it was.
    const rot = ((b.rotation ?? 0) * Math.PI) / 180;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const lx = dxPx * cos + dyPx * sin, ly = -dxPx * sin + dyPx * cos;
    const bw = b.w * W, bh = b.h * H;
    const sx = d.handle.includes("w") ? -1 : 1, sy = d.handle.includes("n") ? -1 : 1;
    const nw = Math.max(MIN * W, bw + sx * lx), nh = Math.max(MIN * H, bh + sy * ly);
    const ox = (sx * (nw - bw)) / 2, oy = (sy * (nh - bh)) / 2;
    const cx = b.x * W + bw / 2 + ox * cos - oy * sin;
    const cy = b.y * H + bh / 2 + ox * sin + oy * cos;
    let w = Math.min(1, nw / W), h = Math.min(1, nh / H);
    let x = cx / W - w / 2, y = cy / H - h / 2;
    if (!rot) {
      // Unrotated boxes stay inside the page, as before.
      if (x < 0) { w += x; x = 0; }
      if (y < 0) { h += y; y = 0; }
      w = Math.min(w, 1 - x);
      h = Math.min(h, 1 - y);
    }
    onChangeBox(d.id, { x, y, w, h });
  }

  function onPointerUp() {
    if (drag.current?.moved) onCommit();
    drag.current = null;
  }

  function onStageClick(e: React.MouseEvent) {
    const stage = stageRef.current;
    if (!stage || erasing) return;
    if ((e.target as HTMLElement).closest("[data-box-id]") && mode === "select") return;
    const rect = stage.getBoundingClientRect();
    const fx = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const fy = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    if (mode === "select") onSelect(null);
    else onTap(fx, fy);
  }

  return (
    <div ref={scrollRef} className="checkerboard relative h-full w-full overflow-auto overscroll-contain">
      <div className="flex min-h-full min-w-full justify-center px-3 pb-3 pt-16" style={{ width: stageW + 24 }}>
        <div
          ref={stageRef}
          className={cn(
            "relative shrink-0 shadow-2xl",
            mode === "pick" && "cursor-crosshair",
            mode === "add" && "cursor-copy",
          )}
          style={{ width: stageW, aspectRatio: `${page.width} / ${page.height}` }}
          onClick={onStageClick}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={page.name}
              className="absolute inset-0 h-full w-full select-none"
              draggable={false}
            />
          ) : (
            <div className="absolute inset-0 animate-pulse bg-muted" />
          )}
          {!showOriginal &&
            !erasing &&
            page.boxes.map((box) => (
              <BoxView
                key={box.id}
                box={box}
                page={page}
                scale={scale}
                selected={box.id === selectedId}
                interactive={interactive}
                fontsVersion={fontsVersion}
                onPointerDown={(e, h) => startDrag(e, box, h)}
              />
            ))}
          {erasing && maskRef && (
            <EraseLayer
              page={page}
              scale={scale}
              brush={eraseBrush}
              panning={erasePanning}
              maskRef={maskRef}
              onPaint={() => onMaskPaint?.()}
            />
          )}
          {page.status === "processing" && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden bg-ink/30">
              <div className="animate-scan h-1/3 w-full bg-gradient-to-b from-transparent via-primary/35 to-transparent" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
