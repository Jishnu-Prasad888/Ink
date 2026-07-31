// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { matchesShortcut, shortcutFromEvent, shortcutToCodeMirror } from "./shortcuts";

describe("keyboard shortcuts", () => {
  it("normalizes modifier shortcuts", () => {
    const event = new KeyboardEvent("keydown", { key: "p", ctrlKey: true, shiftKey: true });
    expect(shortcutFromEvent(event)).toBe("Mod+Shift+P");
    expect(matchesShortcut(event, "Mod+Shift+P")).toBe(true);
    expect(matchesShortcut(event, "Mod+P")).toBe(false);
  });

  it("converts settings bindings to CodeMirror key syntax", () => {
    expect(shortcutToCodeMirror("Alt+Shift+ArrowDown")).toBe("Shift-Alt-ArrowDown");
    expect(shortcutToCodeMirror("Alt+ArrowUp")).toBe("Alt-ArrowUp");
  });
});
