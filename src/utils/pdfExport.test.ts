// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createPrintPageStyle } from "./pdfExport";

describe("PDF export page styles", () => {
  it("creates portrait and landscape A4 page rules", () => {
    expect(createPrintPageStyle("portrait")).toContain("size: A4 portrait");
    expect(createPrintPageStyle("landscape")).toContain("size: A4 landscape");
  });
});
