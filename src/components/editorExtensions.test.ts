// @vitest-environment jsdom
import { EditorState, type StateCommand } from "@codemirror/state";
import { markdown, insertNewlineContinueMarkup } from "@codemirror/lang-markdown";
import { describe, expect, it } from "vitest";
import { closeMarkdownCodeFence, continueIndentedBlockquote } from "./editorExtensions";

const runCommand = (doc: string, command: StateCommand) => {
  let state = EditorState.create({ doc, extensions: [markdown()] });
  state = state.update({ selection: { anchor: doc.length } }).state;
  const handled = command({
    state,
    dispatch: (transaction) => {
      state = transaction.state;
    },
  });
  return { handled, state };
};

describe("Markdown editor commands", () => {
  it("completes an opening fenced code block and places the cursor inside", () => {
    const { handled, state } = runCommand("  ```ts", closeMarkdownCodeFence);
    expect(handled).toBe(true);
    expect(state.doc.toString()).toBe("  ```ts\n  \n  ```");
    expect(state.selection.main.head).toBe("  ```ts\n  ".length);
  });

  it("does not complete a closing code fence", () => {
    const { handled, state } = runCommand("```\ncode\n```", closeMarkdownCodeFence);
    expect(handled).toBe(false);
    expect(state.doc.toString()).toBe("```\ncode\n```");
  });

  it("preserves indentation when continuing blockquotes", () => {
    const { handled, state } = runCommand("  > quote", continueIndentedBlockquote);
    expect(handled).toBe(true);
    expect(state.doc.toString()).toBe("  > quote\n  > ");
  });

  it("continues parenthesized ordered lists with the next number", () => {
    const { handled, state } = runCommand("  9) nested", insertNewlineContinueMarkup);
    expect(handled).toBe(true);
    expect(state.doc.toString()).toBe("  9) nested\n  10) ");
  });

  it("continues dash lists and blockquotes", () => {
    expect(runCommand("  - item", insertNewlineContinueMarkup).state.doc.toString()).toBe(
      "  - item\n  - ",
    );
    expect(runCommand("> quote", insertNewlineContinueMarkup).state.doc.toString()).toBe(
      "> quote\n> ",
    );
  });
});
