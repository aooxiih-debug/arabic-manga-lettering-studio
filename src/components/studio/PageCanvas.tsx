import { useEffect, useMemo, useRef, useState } from "react";

import { fontCss } from "@/lib/fonts";
import { layoutBox, shapeRadius } from "@/lib/text-layout";
import type { Page, TextBox } from "@/lib/types";
import { cn } from "@/lib/utils";

export type CanvasMode = "select" | "add" | "pick";
type Handle = "move" | "nw" | "ne" | "sw" | "se";

const MIN = 0.02;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

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
      }}
      onPointerDown={(e) => onPointerDown(e, "move")}
    >
      <div
        className="absolute inset-0"
        style={{ background: box.fill ? box.bg : "transparent", borderRadius: radius }}
      />
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
      <div
        className={cn(
          "pointer-events-none absolute inset-0 rounded-sm",
          selected ? "outline-2 outline-dashed outline-primary" : "outline-1 outline-dashed outline-primary/35",
        )}
      />
      {selected && interactive &&
        (["nw", "ne", "sw", "se"] as const).map((h) => (
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
    </div>
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
    const dx = (e.clientX - d.startX) / rect.width;
    const dy = (e.clientY - d.startY) / rect.height;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 4) return;
    d.moved = true;
    const b = d.box;
    if (d.handle === "move") {
      onChangeBox(d.id, { x: clamp(b.x + dx, 0, 1 - b.w), y: clamp(b.y + dy, 0, 1 - b.h) });
      return;
    }
    let { x, y, w, h } = b;
    if (d.handle.includes("w")) {
      const nx = clamp(b.x + dx, 0, b.x + b.w - MIN);
      w = b.w + (b.x - nx);
      x = nx;
    } else w = clamp(b.w + dx, MIN, 1 - b.x);
    if (d.handle.includes("n")) {
      const ny = clamp(b.y + dy, 0, b.y + b.h - MIN);
      h = b.h + (b.y - ny);
      y = ny;
    } else h = clamp(b.h + dy, MIN, 1 - b.y);
    onChangeBox(d.id, { x, y, w, h });
  }

  function onPointerUp() {
    if (drag.current?.moved) onCommit();
    drag.current = null;
  }

  function onStageClick(e: React.MouseEvent) {
    const stage = stageRef.current;
    if (!stage) return;
    if ((e.target as HTMLElement).closest("[data-box-id]") && mode === "select") return;
    const rect = stage.getBoundingClientRect();
    const fx = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const fy = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    if (mode === "select") onSelect(null);
    else onTap(fx, fy);
  }

  return (
    <div ref={scrollRef} className="checkerboard relative h-full w-full overflow-auto overscroll-contain">
      <div className="flex min-h-full min-w-full justify-center p-3" style={{ width: stageW + 24 }}>
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
