import { describe, expect, it } from "vitest";

import { DAILY_LIMIT_MESSAGE, mapGeminiError } from "@/lib/ai/gemini-errors";

describe("Gemini errors", () => {
  it("shows the daily-limit message when Gemini answers 429", () => {
    const r = mapGeminiError(429, '{"error":{"message":"Resource has been exhausted"}}');
    expect(r).toEqual({ status: 429, message: "Daily limit reached, try again tomorrow" });
    expect(DAILY_LIMIT_MESSAGE).toBe("Daily limit reached, try again tomorrow");
  });

  it("treats a rejected key as a stop-the-queue error", () => {
    expect(mapGeminiError(400, '{"error":{"message":"API key not valid."}}').status).toBe(401);
  });
});
