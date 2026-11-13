import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  imageDataUrl: z
    .string()
    .startsWith("data:image/")
    .max(8_000_000),
  notes: z.string().max(4000).default(""),
  previousLines: z.array(z.string().max(500)).max(30).default([]),
});

export const translatePageFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const { translatePage } = await import("./translate-page.server");
    return translatePage(data);
  });
