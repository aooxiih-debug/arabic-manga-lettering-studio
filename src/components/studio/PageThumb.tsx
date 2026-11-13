import { usePageImageUrl } from "@/hooks/use-studio-data";
import { cn } from "@/lib/utils";

export function PageThumb({ pageId, className, alt }: { pageId?: string | undefined; className?: string; alt: string }) {
  const url = usePageImageUrl(pageId);
  return url ? (
    <img src={url} alt={alt} className={cn("object-cover", className)} draggable={false} />
  ) : (
    <div className={cn("animate-pulse bg-muted", className)} />
  );
}
