import { describe, expect, it } from "vitest";
import { clampZoom, roundZoom, wheelDeltaPixels, wheelZoomFactor } from "./wheelZoom";

describe("wheel zoom", () => {
  it("normalises line and page wheel deltas to pixels", () => {
    expect(wheelDeltaPixels({ deltaY: 3, deltaMode: 1 })).toBe(48);
    expect(wheelDeltaPixels({ deltaY: 1, deltaMode: 2 })).toBe(800);
    expect(wheelDeltaPixels({ deltaY: 10, deltaMode: 0 })).toBe(10);
  });

  it("zooms in proportion to wheel travel, so many small events match one large one", () => {
    const small = wheelZoomFactor({ deltaY: -10, deltaMode: 0 }) ** 10;
    const large = wheelZoomFactor({ deltaY: -100, deltaMode: 0 });
    expect(small).toBeCloseTo(large, 10);
    expect(large).toBeGreaterThan(1.1);
    expect(large).toBeLessThan(1.2);
    expect(wheelZoomFactor({ deltaY: 100, deltaMode: 0 })).toBeCloseTo(1 / large, 10);
  });

  it("caps a single oversized event", () => {
    expect(wheelZoomFactor({ deltaY: -5000, deltaMode: 0 })).toBe(
      wheelZoomFactor({ deltaY: -120, deltaMode: 0 }),
    );
  });

  it("clamps and rounds zoom levels", () => {
    expect(clampZoom(5, false)).toBe(2);
    expect(clampZoom(0.1, true)).toBe(0.5);
    expect(roundZoom(1.23456)).toBe(1.23);
  });
});
