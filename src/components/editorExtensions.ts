import {
  addCursorAbove,
  addCursorBelow,
  defaultKeymap,
  moveLineDown,
  moveLineUp,
} from "@codemirror/commands";
import { EditorSelection, Prec, type StateCommand } from "@codemirror/state";
import { keymap, type Command, type KeyBinding } from "@codemirror/view";
import type { ShortcutMap } from "../utils/shortcuts";
import { shortcutToCodeMirror } from "../utils/shortcuts";

const lineCommand = (command: typeof moveLineUp) =>
  ((target) => {
    command(target);
    return true;
  }) satisfies StateCommand;

const cursorCommand =
  (command: Command): Command =>
  (view) => {
    command(view);
    return true;
  };

export const closeMarkdownCodeFence: StateCommand = ({ state, dispatch }) => {
  let handled = false;
  const transaction = state.changeByRange((range) => {
    if (!range.empty) return { range };
    const line = state.doc.lineAt(range.head);
    if (range.head !== line.to) return { range };
    const match = line.text.match(/^(\s*)```[^`]*$/);
    if (!match) return { range };

    const previousFenceCount = state.doc
      .sliceString(0, line.from)
      .split(/\r?\n/)
      .filter((text) => /^\s*```/.test(text)).length;
    if (previousFenceCount % 2 === 1) return { range };

    handled = true;
    const indentation = match[1];
    const lineBreak = state.lineBreak;
    const insert = `${lineBreak}${indentation}${lineBreak}${indentation}\`\`\``;
    return {
      changes: { from: range.head, insert },
      range: EditorSelection.cursor(range.head + lineBreak.length + indentation.length),
    };
  });

  if (!handled) return false;
  dispatch(state.update(transaction, { scrollIntoView: true, userEvent: "input" }));
  return true;
};

export const continueIndentedBlockquote: StateCommand = ({ state, dispatch }) => {
  const range = state.selection.main;
  if (!range.empty) return false;
  const line = state.doc.lineAt(range.head);
  if (range.head !== line.to) return false;
  const match = line.text.match(/^(\s+)((?:>\s*)+)(.+)$/);
  if (!match || !match[3].trim()) return false;
  const prefix = `${match[1]}${match[2]}`;
  dispatch(
    state.update({
      changes: { from: range.head, insert: `${state.lineBreak}${prefix}` },
      selection: { anchor: range.head + state.lineBreak.length + prefix.length },
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
};

const controlledDefaultKeys = new Set([
  "Alt-ArrowUp",
  "Alt-ArrowDown",
  "Shift-Alt-ArrowUp",
  "Shift-Alt-ArrowDown",
  "Mod-Alt-ArrowUp",
  "Mod-Alt-ArrowDown",
]);

export const editorKeymapExtensions = (shortcuts: ShortcutMap) => {
  const customBindings: KeyBinding[] = [
    { key: "Enter", run: closeMarkdownCodeFence },
    { key: "Enter", run: continueIndentedBlockquote },
    {
      key: shortcutToCodeMirror(shortcuts["editor.addCursorAbove"]),
      run: cursorCommand(addCursorAbove),
    },
    {
      key: shortcutToCodeMirror(shortcuts["editor.addCursorBelow"]),
      run: cursorCommand(addCursorBelow),
    },
    {
      key: shortcutToCodeMirror(shortcuts["editor.moveLineUp"]),
      run: lineCommand(moveLineUp),
    },
    {
      key: shortcutToCodeMirror(shortcuts["editor.moveLineDown"]),
      run: lineCommand(moveLineDown),
    },
  ];
  const remainingDefaults = defaultKeymap.filter(
    (binding) => !binding.key || !controlledDefaultKeys.has(binding.key),
  );
  return [Prec.highest(keymap.of(customBindings)), keymap.of(remainingDefaults)];
};
