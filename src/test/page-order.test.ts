import { describe, expect, it } from "vitest";

import { sortFiles } from "@/lib/chapter-actions";

const img = (name: string) => new File(["x"], name, { type: "image/png" });

describe("chapter page order", () => {
  it("orders uploaded pages by their number, so page 2 comes before page 10", () => {
    const sorted = sortFiles([img("10.png"), img("2.png"), img("1.png")]).map((f) => f.name);
    expect(sorted).toEqual(["1.png", "2.png", "10.png"]);
  });

  it("skips files that are not images", () => {
    const sorted = sortFiles([img("1.png"), new File(["x"], "notes.txt", { type: "text/plain" })]);
    expect(sorted.map((f) => f.name)).toEqual(["1.png"]);
  });
});
