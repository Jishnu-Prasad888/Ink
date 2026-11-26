// @vitest-environment jsdom
import { EditorView, runScopeHandlers } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { editorKeymapExtensions } from "./editorExtensions";
import { defaultShortcuts } from "../utils/shortcuts";

// jsdom has no layout; CodeMirror's vertical cursor motion measures text ranges.
Range.prototype.getClientRects ??= () =>
  Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const press = (view: EditorView, init: KeyboardEventInit) =>
  runScopeHandlers(view, new KeyboardEvent("keydown", init), "editor");

const createView = (doc: string, cursor: number) =>
  new EditorView({
    doc,
    selection: { anchor: cursor },
    extensions: editorKeymapExtensions(defaultShortcuts),
    parent: document.body,
  });

describe("editor line and cursor shortcuts", () => {
  it("duplicates the line down with Alt+Shift+ArrowDown", () => {
    const view = createView("one\ntwo", 1);
    expect(press(view, { key: "ArrowDown", altKey: true, shiftKey: true })).toBe(true);
    expect(view.state.doc.toString()).toBe("one\none\ntwo");
    expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(2);
    view.destroy();
  });

  it("duplicates the line up with Alt+Shift+ArrowUp", () => {
    const view = createView("one\ntwo", 5);
    expect(press(view, { key: "ArrowUp", altKey: true, shiftKey: true })).toBe(true);
    expect(view.state.doc.toString()).toBe("one\ntwo\ntwo");
    view.destroy();
  });

  it("moves the line with Alt+Arrow", () => {
    const view = createView("one\ntwo", 1);
    expect(press(view, { key: "ArrowDown", altKey: true })).toBe(true);
    expect(view.state.doc.toString()).toBe("two\none");
    view.destroy();
  });

  // jsdom cannot lay out text, so the new cursor's position is not checked here;
  // this verifies Ctrl+Alt+Arrow is bound to cursor motion, not a line edit.
  it("handles Ctrl+Alt+Arrow as a cursor command", () => {
    const view = createView("one\ntwo", 1);
    expect(press(view, { key: "ArrowDown", altKey: true, ctrlKey: true })).toBe(true);
    expect(press(view, { key: "ArrowUp", altKey: true, ctrlKey: true })).toBe(true);
    expect(view.state.doc.toString()).toBe("one\ntwo");
    view.destroy();
  });
});
