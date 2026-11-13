export type FontOption = { family: string; label: string; custom?: boolean };

/** Arabic families loaded from Google Fonts in the root head. */
export const BUILTIN_FONTS: FontOption[] = [
  { family: "Cairo", label: "القاهرة" },
  { family: "Changa", label: "تشانغا" },
  { family: "Marhey", label: "مرحي — كوميكس" },
  { family: "Lemonada", label: "ليمونادة" },
  { family: "Lalezar", label: "لاله‌زار — عريض" },
  { family: "Tajawal", label: "تجوال" },
  { family: "Reem Kufi", label: "ريم كوفي" },
  { family: "IBM Plex Sans Arabic", label: "بلكس" },
];

export const DEFAULT_FONT = "Cairo";

export const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&family=Changa:wght@400;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Lalezar&family=Lemonada:wght@400;700&family=Marhey:wght@400;700&family=Reem+Kufi:wght@400;700&family=Tajawal:wght@400;700;900&display=swap";

export function fontCss(family: string) {
  return `"${family}", "Cairo", sans-serif`;
}
