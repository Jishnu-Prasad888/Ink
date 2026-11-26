// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("settings migration", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("moves old Alt+Shift+Arrow cursor bindings to the new defaults", async () => {
    localStorage.setItem(
      "ink-settings",
      JSON.stringify({
        version: 2,
        state: {
          shortcuts: {
            "editor.addCursorAbove": "Alt+Shift+ArrowUp",
            "editor.addCursorBelow": "Alt+Shift+ArrowDown",
            "file.save": "Mod+Shift+K",
          },
        },
      }),
    );
    const { useSettingsStore } = await import("./settingsStore");
    const { shortcuts } = useSettingsStore.getState();
    expect(shortcuts["editor.addCursorAbove"]).toBe("Mod+Alt+ArrowUp");
    expect(shortcuts["editor.addCursorBelow"]).toBe("Mod+Alt+ArrowDown");
    expect(shortcuts["editor.copyLineDown"]).toBe("Alt+Shift+ArrowDown");
    expect(shortcuts["file.save"]).toBe("Mod+Shift+K");
  });

  it("keeps cursor bindings the user customised", async () => {
    localStorage.setItem(
      "ink-settings",
      JSON.stringify({
        version: 2,
        state: { shortcuts: { "editor.addCursorAbove": "Mod+Shift+ArrowUp" } },
      }),
    );
    const { useSettingsStore } = await import("./settingsStore");
    expect(useSettingsStore.getState().shortcuts["editor.addCursorAbove"]).toBe(
      "Mod+Shift+ArrowUp",
    );
  });
});
