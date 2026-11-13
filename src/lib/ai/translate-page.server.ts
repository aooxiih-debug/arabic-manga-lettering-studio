import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, Output, jsonSchema, streamText } from "ai";

import { createLovableAiGatewayRunIdFetch } from "./run-id";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";

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

const pageSchema = jsonSchema<{ bubbles: DetectedBubble[] }>({
  type: "object",
  additionalProperties: false,
  required: ["bubbles"],
  properties: {
    bubbles: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["x1", "y1", "x2", "y2", "original", "arabic", "kind"],
        properties: {
          x1: { type: "number" },
          y1: { type: "number" },
          x2: { type: "number" },
          y2: { type: "number" },
          original: { type: "string" },
          arabic: { type: "string" },
          kind: { type: "string", enum: ["speech", "thought", "narration", "sfx", "sign"] },
        },
      },
    },
  },
});

const INSTRUCTIONS = `You are a professional manga, manhwa and comics letterer and Arabic translator.

TASK 1 — DETECTION
Find every block of English text on the page: speech bubbles, thought bubbles, narration boxes, signs and sound effects.
For each block return a TIGHT bounding box around the lettering itself (not the whole bubble outline), as integers normalized 0-1000:
x1,y1 = top-left corner, x2,y2 = bottom-right corner, where x is relative to image width and y to image height.
Each separate bubble is a separate block. Never merge two bubbles. List blocks in natural reading order of the page.
Ignore page numbers, watermarks, scanlation credits and website URLs.

TASK 2 — TRANSLATION
"original": the exact English text of the block, with line breaks replaced by spaces.
"arabic": a natural, expressive Arabic line, the way a professional Arabic comic would read.
- Use clear simplified Modern Standard Arabic that sounds alive, not stiff or literal.
- Keep the emotion, humor, slang energy and character voice. Shouting stays punchy with "!".
- Keep it concise so it fits the same bubble; similar length to the English.
- Transliterate names consistently and keep honorifics meaningful.
- Sound effects: give a short expressive Arabic equivalent.
- Never add translator notes, quotes or explanations.`;

function parseGatewayError(error: unknown): { status: number; message: string } {
  const candidates: unknown[] = [error];
  if (error && typeof error === "object" && "cause" in error) candidates.push((error as { cause: unknown }).cause);
  for (const candidate of candidates) {
    if (APICallError.isInstance(candidate)) {
      let message = candidate.message;
      try {
        const body = JSON.parse(candidate.responseBody ?? "{}");
        message = body?.error?.message ?? body?.message ?? message;
      } catch {
        // keep SDK message
      }
      return { status: candidate.statusCode ?? 500, message };
    }
  }
  const message = error instanceof Error ? error.message : "تعذّر تحليل الصفحة";
  return { status: 500, message };
}

export async function translatePage(input: {
  imageDataUrl: string;
  notes: string;
  previousLines: string[];
}): Promise<TranslatePageResult> {
  const apiKey = process.env['LOVABLE_API_KEY'];
  if (!apiKey) return { ok: false, status: 401, message: "مفتاح الذكاء الاصطناعي غير مهيأ." };

  const runIdFetch = createLovableAiGatewayRunIdFetch(undefined);
  const provider = createOpenAI({
    baseURL: GATEWAY_URL,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  const contextParts: string[] = [];
  if (input.notes.trim()) contextParts.push(`Translator notes for this series (names, tone, glossary):\n${input.notes.trim()}`);
  if (input.previousLines.length) {
    contextParts.push(`Previous lines in this chapter, for consistency:\n${input.previousLines.join("\n")}`);
  }
  contextParts.push("Detect and translate every English text block on this page.");

  try {
    const result = streamText({
      model: provider.responses(MODEL),
      instructions: INSTRUCTIONS,
      maxRetries: 0,
      output: Output.object({ schema: pageSchema }),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: contextParts.join("\n\n") },
            { type: "image", image: new URL(input.imageDataUrl) },
          ],
        },
      ],
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: "low",
          reasoningSummary: "auto",
          store: false,
          include: ["reasoning.encrypted_content"],
        },
      },
    });

    const output = await result.output;
    const bubbles = (output?.bubbles ?? [])
      .map((b) => ({
        ...b,
        x1: Math.max(0, Math.min(1000, b.x1)),
        y1: Math.max(0, Math.min(1000, b.y1)),
        x2: Math.max(0, Math.min(1000, b.x2)),
        y2: Math.max(0, Math.min(1000, b.y2)),
      }))
      .filter((b) => b.x2 > b.x1 && b.y2 > b.y1 && b.arabic.trim().length > 0);
    return { ok: true, bubbles };
  } catch (error) {
    console.error("translatePage failed", error);
    return { ok: false, ...parseGatewayError(error) };
  }
}
