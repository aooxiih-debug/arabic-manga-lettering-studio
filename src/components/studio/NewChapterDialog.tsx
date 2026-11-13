import { useNavigate } from "@tanstack/react-router";
import { ImagePlus, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createChapter, sortFiles } from "@/lib/chapter-actions";
import { processPages } from "@/lib/pipeline";

export function NewChapterDialog({ trigger }: { trigger: React.ReactNode }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit() {
    if (!files.length) {
      toast.error("اختر صفحات الفصل أولاً");
      return;
    }
    setBusy(true);
    try {
      const { chapterId, pageIds } = await createChapter(title, notes, files);
      setOpen(false);
      void processPages(chapterId, pageIds);
      navigate({ to: "/chapter/$chapterId", params: { chapterId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر إنشاء الفصل");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md border-border bg-popover">
        <DialogHeader className="text-start">
          <DialogTitle className="font-display text-2xl font-normal">فصل جديد</DialogTitle>
          <DialogDescription>ارفع صفحات الفصل الإنجليزية وسنبدأ الترجمة فورًا.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="chapter-title">اسم الفصل</Label>
            <Input
              id="chapter-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: الفصل 12 — بوابة الفجر"
            />
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-input bg-surface px-4 py-6 text-center transition-colors hover:border-primary"
          >
            <ImagePlus className="size-7 text-primary" />
            <span className="font-medium">
              {files.length ? `${files.length} صفحة جاهزة` : "اختر صفحات الفصل"}
            </span>
            <span className="text-xs text-muted-foreground">
              PNG أو JPG أو WEBP — تُرتّب حسب اسم الملف
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => setFiles(sortFiles(Array.from(e.target.files ?? [])))}
          />
          <div className="space-y-1.5">
            <Label htmlFor="chapter-notes">ملاحظات للمترجم (اختياري)</Label>
            <Textarea
              id="chapter-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="أسماء الشخصيات، الأسلوب، مصطلحات… مثال: Kai = كاي، أسلوب ساخر"
            />
          </div>
          <Button variant="ember" size="xl" className="w-full" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            ابدأ الترجمة الذكية
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
