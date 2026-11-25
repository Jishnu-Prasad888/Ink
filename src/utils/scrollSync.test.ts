import { describe, expect, it } from "vitest";
import { lineToPreviewTop, normalizeAnchors, previewTopToLine } from "./scrollSync";

const anchors = [
  { line: 0, top: 0 },
  { line: 10, top: 200 },
  { line: 20, top: 600 },
];

describe("scroll sync mapping", () => {
  it("interpolates between anchors in both directions", () => {
    expect(lineToPreviewTop(anchors, 5, 30, 1000)).toBe(100);
    expect(lineToPreviewTop(anchors, 15, 30, 1000)).toBe(400);
    expect(previewTopToLine(anchors, 400, 30, 1000)).toBe(15);
  });

  it("maps past the last anchor toward the end of the document", () => {
    expect(lineToPreviewTop(anchors, 25, 30, 1000)).toBe(800);
    expect(previewTopToLine(anchors, 800, 30, 1000)).toBe(25);
    expect(lineToPreviewTop(anchors, 40, 30, 1000)).toBe(1000);
  });

  it("maps before the first anchor from the top of the document", () => {
    expect(lineToPreviewTop([{ line: 4, top: 80 }], 2, 10, 500)).toBe(40);
  });

  it("drops anchors that would go backwards", () => {
    expect(
      normalizeAnchors([
        { line: 0, top: 0 },
        { line: 2, top: 50 },
        { line: 1, top: 60 },
        { line: 3, top: 40 },
        { line: 4, top: 90 },
      ]),
    ).toEqual([
      { line: 0, top: 0 },
      { line: 2, top: 50 },
      { line: 4, top: 90 },
    ]);
  });
});
