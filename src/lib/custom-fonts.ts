import { getFontFile, listFonts } from "./db";

const loaded = new Set<string>();

/** Registers every uploaded TrueType font with the browser so both the editor and exports can use it. */
export async function registerCustomFonts() {
  const fonts = await listFonts();
  await Promise.all(
    fonts.map(async (f) => {
      if (loaded.has(f.id)) return;
      const file = await getFontFile(f.id);
      if (!file) return;
      const face = new FontFace(f.family, await file.arrayBuffer());
      await face.load();
      document.fonts.add(face);
      loaded.add(f.id);
    }),
  );
  return fonts;
}
