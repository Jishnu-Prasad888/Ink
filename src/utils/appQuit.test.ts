import { describe, expect, it, vi } from "vitest";
import { quitApp } from "./appQuit";

describe("quitApp", () => {
  it("delegates confirmed exits to the native application process", async () => {
    const invokeCommand = vi.fn().mockResolvedValue(undefined);

    await quitApp(invokeCommand);

    expect(invokeCommand).toHaveBeenCalledOnce();
    expect(invokeCommand).toHaveBeenCalledWith("quit_app");
  });
});
