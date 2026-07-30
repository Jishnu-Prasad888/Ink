import { describe, expect, it, vi } from "vitest";
import { destroyWindow } from "./windowClose";

describe("destroyWindow", () => {
  it("bypasses close-request interception after the user confirms quitting", async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);

    await destroyWindow({ destroy });

    expect(destroy).toHaveBeenCalledOnce();
  });
});
