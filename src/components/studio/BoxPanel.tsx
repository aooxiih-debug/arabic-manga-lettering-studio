import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Circle,
  Copy,
  Maximize2,
  Pipette,
  RectangleHorizontal,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { fontCss, type FontOption } from "@/lib/fonts";
import type { TextBox } from "@/lib/types";
import { cn } from "@/lib/utils";

export type PickTarget = "bg" | "color" | "strokeColor";
type Tab = "text" | "font" | "colors";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">{children}</div>
    </div>
  );
}

function ColorField({
  value,
  onChange,
  onPick,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: () => void;
  label: string;
}) {
  return (
    <Row label={label}>
      <span className="font-mono text-xs text-muted-foreground" dir="ltr">
        {value}
      </span>
      <label className="relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-border">
        <span className="absolute inset-0" style={{ background: value }} />
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label={label}
        />
      </label>
      <Button variant="panel" size="icon" onClick={onPick} aria-label={`التقاط ${label} من الصورة`}>
        <Pipette />
      </Button>
    </Row>
  );
}

export function BoxPanel({
  box,
  fonts,
  onChange,
  onCommit,
  onDelete,
  onDuplicate,
  onFit,
  onPick,
  onUploadFont,
  onClose,
}: {
  box: TextBox;
  fonts: FontOption[];
  onChange: (patch: Partial<TextBox>) => void;
  onCommit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onFit: () => void;
  onPick: (target: PickTarget) => void;
  onUploadFont: (file: File) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("text");
  const fontInput = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<TextBox>) => {
    onChange(patch);
    onCommit();
  };

  return (
    <div className="flex max-h-[46dvh] flex-col border-t border-border bg-popover shadow-panel lg:max-h-none lg:h-full lg:border-t-0 lg:border-s">
      <div className="flex items-center gap-1 border-b border-border px-2 py-2">
        {(
          [
            ["text", "النص"],
            ["font", "الخط"],
            ["colors", "الألوان"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm transition-colors",
              tab === key ? "bg-primary/15 font-semibold text-primary" : "text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
        <div className="ms-auto flex">
          <Button variant="tool" size="icon" onClick={onDuplicate} aria-label="نسخ المربع">
            <Copy />
          </Button>
          <Button variant="tool" size="icon" onClick={onDelete} aria-label="حذف المربع" className="hover:text-destructive">
            <Trash2 />
          </Button>
          <Button variant="tool" size="icon" onClick={onClose} aria-label="إغلاق">
            <X />
          </Button>
        </div>
      </div>

      <div className="space-y-4 overflow-y-auto p-3">
        {tab === "text" && (
          <>
            {box.original && (
              <p dir="ltr" className="rounded-lg bg-surface px-3 py-2 text-left text-xs leading-relaxed text-muted-foreground">
                {box.original}
              </p>
            )}
            <Textarea
              dir="rtl"
              value={box.text}
              onChange={(e) => onChange({ text: e.target.value })}
              onBlur={onCommit}
              rows={3}
              className="text-base"
              style={{ fontFamily: fontCss(box.fontFamily) }}
              aria-label="الترجمة"
            />
            <Button variant="panel" size="sm" onClick={onFit}>
              <Maximize2 /> ملاءمة حجم الخط للمربع
            </Button>
          </>
        )}

        {tab === "font" && (
          <>
            <Row label="الخط">
              <Select value={box.fontFamily} onValueChange={(v) => set({ fontFamily: v })}>
                <SelectTrigger className="h-9 max-w-[13rem]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fonts.map((f) => (
                    <SelectItem key={f.family} value={f.family}>
                      <span style={{ fontFamily: fontCss(f.family) }}>{f.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="panel" size="icon" onClick={() => fontInput.current?.click()} aria-label="رفع خط">
                <Upload />
              </Button>
              <input
                ref={fontInput}
                type="file"
                accept=".ttf,.otf,font/ttf,font/otf"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) onUploadFont(f);
                }}
              />
            </Row>
            <Row label={`الحجم ${Math.round(box.fontSize)}`}>
              <Slider
                dir="rtl"
                min={6}
                max={200}
                step={1}
                value={[box.fontSize]}
                onValueChange={([v]) => onChange({ fontSize: v ?? box.fontSize })}
                onValueCommit={onCommit}
                className="max-w-[14rem]"
              />
            </Row>
            <Row label="تباعد الأسطر">
              <Slider
                dir="rtl"
                min={0.8}
                max={2}
                step={0.05}
                value={[box.lineHeight]}
                onValueChange={([v]) => onChange({ lineHeight: v ?? box.lineHeight })}
                onValueCommit={onCommit}
                className="max-w-[14rem]"
              />
            </Row>
            <Row label={`الانحناء ${box.curve ?? 0}`}>
              <Slider
                dir="rtl"
                min={-100}
                max={100}
                step={1}
                value={[box.curve ?? 0]}
                onValueChange={([v]) => onChange({ curve: v ?? 0 })}
                onValueCommit={onCommit}
                className="max-w-[12rem]"
                aria-label="انحناء النص"
              />
              <Button variant="tool" size="icon" onClick={() => set({ curve: 0 })} aria-label="إلغاء الانحناء">
                <RotateCcw />
              </Button>
            </Row>
            <Row label={`التدوير ${box.rotation ?? 0}°`}>
              <Slider
                dir="rtl"
                min={-180}
                max={180}
                step={1}
                value={[box.rotation ?? 0]}
                onValueChange={([v]) => onChange({ rotation: v ?? 0 })}
                onValueCommit={onCommit}
                className="max-w-[12rem]"
                aria-label="تدوير المربع"
              />
              <Button variant="tool" size="icon" onClick={() => set({ rotation: 0 })} aria-label="إلغاء التدوير">
                <RotateCcw />
              </Button>
            </Row>
            <Row label="المحاذاة">
              {(
                [
                  ["right", AlignRight],
                  ["center", AlignCenter],
                  ["left", AlignLeft],
                ] as const
              ).map(([a, Icon]) => (
                <Button
                  key={a}
                  variant="tool"
                  size="icon"
                  data-active={box.align === a}
                  onClick={() => set({ align: a })}
                  aria-label={a}
                >
                  <Icon />
                </Button>
              ))}
              <Button variant="tool" size="icon" data-active={box.bold} onClick={() => set({ bold: !box.bold })} aria-label="عريض">
                <Bold />
              </Button>
            </Row>
          </>
        )}

        {tab === "colors" && (
          <>
            <ColorField label="لون النص" value={box.color} onChange={(v) => onChange({ color: v })} onPick={() => onPick("color")} />
            <Row label="تغطية الخلفية">
              <Switch checked={box.fill} onCheckedChange={(v) => set({ fill: v })} dir="rtl" />
            </Row>
            {box.fill && (
              <>
                <ColorField label="لون الخلفية" value={box.bg} onChange={(v) => onChange({ bg: v })} onPick={() => onPick("bg")} />
                <Row label="الشكل">
                  <Button variant="tool" size="icon" data-active={box.shape === "rect"} onClick={() => set({ shape: "rect" })} aria-label="مستطيل">
                    <RectangleHorizontal />
                  </Button>
                  <Button variant="tool" size="icon" data-active={box.shape === "ellipse"} onClick={() => set({ shape: "ellipse" })} aria-label="بيضاوي">
                    <Circle />
                  </Button>
                </Row>
              </>
            )}
            <Row label={`حدّ النص ${box.strokeWidth}`}>
              <Slider
                dir="rtl"
                min={0}
                max={12}
                step={0.5}
                value={[box.strokeWidth]}
                onValueChange={([v]) => onChange({ strokeWidth: v ?? box.strokeWidth })}
                onValueCommit={onCommit}
                className="max-w-[14rem]"
              />
            </Row>
            {box.strokeWidth > 0 && (
              <ColorField
                label="لون الحدّ"
                value={box.strokeColor}
                onChange={(v) => onChange({ strokeColor: v })}
                onPick={() => onPick("strokeColor")}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
