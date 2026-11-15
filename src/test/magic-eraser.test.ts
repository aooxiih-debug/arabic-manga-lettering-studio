import { describe, expect, it } from "vitest";

import { inpaint } from "@/lib/inpaint";

function solid(w: number, h: number, rgb: [number, number, number]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([...rgb, 255], i * 4);
  return { data, width: w, height: h };
}

describe("magic eraser", () => {
  it("fills the painted area with the surrounding colour, removing what was there", () => {
    const img = solid(60, 40, [200, 220, 240]);
    const mask = new Uint8Array(60 * 40);
    for (let y = 15; y < 25; y++) {
      for (let x = 20; x < 40; x++) {
        img.data.set([0, 0, 0, 255], (y * 60 + x) * 4); // black lettering
        mask[y * 60 + x] = 1;
      }
    }
    expect(inpaint(img, mask)).toBe(true);
    const i = (20 * 60 + 30) * 4;
    expect([...img.data.slice(i, i + 3)]).toEqual([200, 220, 240]);
  });

  it("leaves pixels outside the painted area untouched", () => {
    const img = solid(40, 40, [10, 20, 30]);
    img.data.set([255, 0, 0, 255], 0);
    const mask = new Uint8Array(40 * 40);
    mask[20 * 40 + 20] = 1;
    inpaint(img, mask);
    expect([...img.data.slice(0, 4)]).toEqual([255, 0, 0, 255]);
  });

  it("does nothing when nothing was painted", () => {
    expect(inpaint(solid(10, 10, [1, 2, 3]), new Uint8Array(100))).toBe(false);
  });
});
