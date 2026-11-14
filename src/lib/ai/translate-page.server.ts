import { mapGeminiError } from "./gemini-errors";

/** Native Gemini endpoint (not the OpenAI-compatible one, which rejects "AQ." keys). */
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = "gemini-2.5-flash";

export type DetectedBubble = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  original: string;
  arabic: string;
  kind: "speech" | "thought" | "narration" | "sfx" | "sign";
};

export type TranslatePageResult =
  | { ok: true; bubbles: DetectedBubble[] }
  | { ok: false; status: number; message: string };

type GeminiBlock = {
  box_2d: number[];
  original: string;
  arabic: string;
  kind: DetectedBubble["kind"];
};

const responseSchema = {
  type: "OBJECT",
  required: ["bubbles"],
  properties: {
    bubbles: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        required: ["box_2d", "original", "arabic", "kind"],
        propertyOrdering: ["box_2d", "original", "arabic", "kind"],
        properties: {
          box_2d: { type: "ARRAY", items: { type: "INTEGER" } },
          original: { type: "STRING" },
          arabic: { type: "STRING" },
          kind: { type: "STRING", enum: ["speech", "thought", "narration", "sfx", "sign"] },
        },
      },
    },
  },
};

const INSTRUCTIONS = `You are a professional manga, manhwa and comics letterer and Arabic translator.

TASK 1 — DETECTION
Find every block of English text on the page: speech bubbles, thought bubbles, narration boxes, signs and sound effects.
For each block return "box_2d": a TIGHT bounding box around the lettering itself (not the whole bubble outline),
as [ymin, xmin, ymax, xmax] integers normalized to 0-1000.
Each separate bubble is a separate block. Never merge two bubbles. List blocks in natural reading order of the page.
Ignore page numbers, watermarks, scanlation credits and website URLs.

TASK 2 — TRANSLATION
"original": the exact English text of the block, with line breaks replaced by spaces.
"arabic": the Arabic line for that block, written as natural manga dialogue.
- Use simple Modern Standard Arabic (فصحى مبسطة) in a natural manga dialogue style — never stiff, formal or word-for-word.
- Keep sentences short so they fit inside the speech bubble; no longer than the English.
- Keep each character's tone: a hothead stays blunt, a shy character stays hesitant, a joker stays playful.
- Keep the emotion and energy. Shouting stays punchy with "!".
- Transliterate names consistently and keep honorifics meaningful.
- Sound effects: a short expressive Arabic equivalent.
- Never add translator notes, quotes or explanations.`;

export async function translatePage(input: {
  imageDataUrl: string;
  notes: string;
  previousLines: string[];
}): Promise<TranslatePageResult> {
  const apiKey = process.env["GEMINI_API_KEY"]?.trim().replace(/^["']|["']$/g, "");
  if (!apiKey) return { ok: false, status: 401, message: "مفتاح Gemini غير مهيأ." };

  const match = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(input.imageDataUrl);
  if (!match) return { ok: false, status: 400, message: "صيغة الصورة غير مدعومة" };

  const contextParts: string[] = [];
  if (input.notes.trim()) contextParts.push(`Translator notes for this series (names, tone, glossary):\n${input.notes.trim()}`);
  if (input.previousLines.length) {
    contextParts.push(`Previous lines in this chapter, for consistency:\n${input.previousLines.join("\n")}`);
  }
  contextParts.push("Detect and translate every English text block on this page.");

  try {
    const res = await fetch(`${GEMINI_BASE}/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: INSTRUCTIONS }] },
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: match[1], data: match[2] } },
              { text: contextParts.join("\n\n") },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema,
          temperature: 0.4,
          thinkingConfig: { thinkingBudget: 1024 },
        },
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error("Gemini error", res.status, text.slice(0, 500));
      return { ok: false, ...mapGeminiError(res.status, text) };
    }

    const json = JSON.parse(text);
    const candidate = json?.candidates?.[0];
    if (!candidate?.content?.parts) {
      const reason = json?.promptFeedback?.blockReason ?? candidate?.finishReason ?? "unknown";
      return { ok: false, status: 422, message: `رفض Gemini تحليل هذه الصفحة (${reason})` };
    }
    const raw = candidate.content.parts.map((p: { text?: string }) => p.text ?? "").join("");
    const parsed = JSON.parse(raw) as { bubbles?: GeminiBlock[] };
    const clamp = (n: number) => Math.max(0, Math.min(1000, Number(n) || 0));
    const bubbles = (parsed.bubbles ?? [])
      .filter((b) => Array.isArray(b.box_2d) && b.box_2d.length === 4)
      .map((b) => {
        const [ymin, xmin, ymax, xmax] = b.box_2d.map(clamp) as [number, number, number, number];
        return { x1: xmin, y1: ymin, x2: xmax, y2: ymax, original: b.original ?? "", arabic: b.arabic ?? "", kind: b.kind };
      })
      .filter((b) => b.x2 > b.x1 && b.y2 > b.y1 && b.arabic.trim().length > 0);
    return { ok: true, bubbles };
  } catch (error) {
    console.error("translatePage failed", error);
    return { ok: false, status: 500, message: error instanceof Error ? error.message : "تعذّر تحليل الصفحة" };
  }
}
