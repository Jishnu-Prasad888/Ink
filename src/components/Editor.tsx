import React, { useEffect, useRef } from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { Tab, useTabStore } from "../store/tabStore";

interface EditorProps {
  tab: Tab;
  searchQuery?: string;
}

const log = (msg: string, data?: unknown) => {
  if (import.meta.env.DEV) console.log(`[Editor:${msg}]`, data ?? "");
};

const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.content, color: "var(--text-primary)" },
  { tag: tags.heading, color: "var(--text-primary)", fontWeight: "650" },
  { tag: tags.heading1, fontSize: "1.12em" },
  { tag: tags.heading2, fontSize: "1.05em" },
  {
    tag: [tags.link, tags.url],
    color: "var(--accent)",
    textDecoration: "underline",
    textDecorationColor: "var(--accent-border)",
    textUnderlineOffset: "2px",
  },
  { tag: tags.strong, color: "var(--text-primary)", fontWeight: "700" },
  { tag: tags.emphasis, color: "var(--text-secondary)", fontStyle: "italic" },
  { tag: tags.strikethrough, color: "var(--text-secondary)", textDecoration: "line-through" },
  { tag: tags.quote, color: "var(--text-muted)", fontStyle: "italic" },
  { tag: tags.list, color: "var(--text-secondary)" },
  { tag: tags.monospace, color: "var(--syntax-cyan)" },
  { tag: tags.contentSeparator, color: "var(--border-strong)" },
  { tag: [tags.meta, tags.punctuation], color: "var(--text-muted)" },
  { tag: tags.comment, color: "var(--syntax-comment)", fontStyle: "italic" },
  { tag: [tags.keyword, tags.tagName], color: "var(--syntax-red)" },
  { tag: [tags.string, tags.regexp], color: "var(--syntax-cyan)" },
  { tag: [tags.number, tags.bool, tags.atom], color: "var(--syntax-blue)" },
  { tag: [tags.typeName, tags.className], color: "var(--syntax-purple)" },
  { tag: tags.operator, color: "var(--syntax-orange)" },
  { tag: tags.variableName, color: "var(--text-secondary)" },
  { tag: tags.inserted, color: "var(--syntax-green)" },
  { tag: [tags.deleted, tags.invalid], color: "var(--danger)" },
]);

const customTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--surface)",
    color: "var(--text-primary)",
    height: "100%",
  },
  "&.cm-focused": { outline: "1px solid var(--accent-border)" },
  ".cm-scroller": {
    fontFamily: "var(--font-editor)",
    fontSize: "13.5px",
    lineHeight: "1.75",
    // Must be "auto" (not hidden/clip) so the native scrollbar renders.
    overflow: "auto",
  },
  ".cm-content": {
    padding: "24px 28px",
    caretColor: "var(--accent)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--surface-raised)",
    borderRight: "1px solid var(--border)",
    color: "var(--text-muted)",
    minWidth: "48px",
    paddingRight: "8px",
  },
  ".cm-gutter": { backgroundColor: "var(--surface-raised)" },
  ".cm-lineNumbers .cm-gutterElement": { fontSize: "11.5px" },
  ".cm-activeLine": { backgroundColor: "var(--bg)" },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--surface-hover)",
    color: "var(--text-secondary)",
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "var(--accent-bg) !important",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--accent)",
    borderLeftWidth: "2px",
  },
  ".cm-matchingBracket": {
    backgroundColor: "var(--accent-bg)",
    outline: "1px solid var(--accent-border)",
  },
  ".cm-foldPlaceholder": {
    background: "var(--accent-bg)",
    border: "1px solid var(--accent-border)",
    color: "var(--accent)",
    borderRadius: "3px",
    padding: "0 4px",
  },
  ".cm-tooltip": {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  ".cm-tooltip-autocomplete": {
    "& > ul > li[aria-selected]": {
      background: "var(--accent-bg)",
      color: "var(--text-primary)",
    },
  },
});

export const Editor: React.FC<EditorProps> = ({ tab, searchQuery = "" }) => {
  const saveTabContent = useTabStore((state) => state.saveTabContent);
  const updateTab = useTabStore((state) => state.updateTab);
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  log("mount", { tabId: tab.id, fileName: tab.fileName });

  const handleChange = (value: string) => {
    log("change", { length: value.length });
    saveTabContent(tab.id, value);
  };

  const handleFocus = () => {
    const view = editorRef.current?.view;
    if (!view) return;
    const pos = view.state.selection.main.head;
    updateTab(tab.id, { cursorPosition: pos });
  };

  // Persist scroll position to the store only on unmount (tab switch / close).
  // Doing it on every scroll event causes a render → useEffect → scrollTop
  // assignment loop.
  useEffect(() => {
    const view = editorRef.current?.view;
    return () => {
      if (view) {
        updateTab(tab.id, { scrollPosition: view.scrollDOM.scrollTop });
      }
    };
  }, [tab.id, updateTab]);

  useEffect(() => {
    if (editorRef.current && tab.cursorPosition !== undefined) {
      const view = editorRef.current.view;
      if (view) {
        view.dispatch({
          selection: { anchor: tab.cursorPosition },
          scrollIntoView: true,
        });
      }
    }
  }, [tab.cursorPosition]);

  // Restore scroll position once on mount.
  useEffect(() => {
    if (editorRef.current && tab.scrollPosition !== undefined) {
      const view = editorRef.current.view;
      if (view) view.scrollDOM.scrollTop = tab.scrollPosition;
    }
  }, [tab.scrollPosition]);

  // Jump to first line matching searchQuery whenever it changes.
  useEffect(() => {
    if (!searchQuery.trim() || !editorRef.current) return;
    const view = editorRef.current.view;
    if (!view) return;
    const text = view.state.doc.toString();
    const idx = text.toLowerCase().indexOf(searchQuery.toLowerCase());
    if (idx !== -1) {
      view.dispatch({
        selection: { anchor: idx, head: idx + searchQuery.length },
        scrollIntoView: true,
      });
    }
  }, [searchQuery]);

  return (
    <div
      className="edit-mode"
      style={{ height: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}
    >
      <CodeMirror
        ref={editorRef}
        value={tab.content ?? ""}
        onChange={handleChange}
        onFocus={handleFocus}
        onUpdate={(update) => {
          if (update.selectionSet) {
            updateTab(tab.id, {
              cursorPosition: update.state.selection.main.head,
            });
          }
        }}
        theme={customTheme}
        extensions={[
          markdown(),
          syntaxHighlighting(markdownHighlightStyle),
          EditorView.lineWrapping,
        ]}
        style={{ flex: 1, minHeight: 0, overflow: "hidden" }}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: true,
          highlightActiveLine: true,
          foldGutter: true,
          dropCursor: true,
          allowMultipleSelections: true,
          indentOnInput: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: true,
          rectangularSelection: true,
          crosshairCursor: false,
          highlightSelectionMatches: true,
          closeBracketsKeymap: true,
          defaultKeymap: true,
          searchKeymap: true,
          historyKeymap: true,
          foldKeymap: true,
          completionKeymap: true,
          lintKeymap: true,
        }}
      />
    </div>
  );
};
