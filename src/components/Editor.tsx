import React, { useEffect, useRef } from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { Tab, useTabStore } from "../store/tabStore";
import { useSettingsStore } from "../store/settingsStore";
import { editorKeymapExtensions } from "./editorExtensions";

interface EditorProps {
  tab: Tab;
  searchQuery?: string;
}

const log = (msg: string, data?: unknown) => {
  if (import.meta.env.DEV) console.log(`[Editor:${msg}]`, data ?? "");
};

/** Uniform metrics — no per-heading font-size changes (those make selection boxes jagged). */
const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.content, color: "var(--text-primary)" },
  { tag: tags.heading, color: "var(--text-primary)", fontWeight: "700" },
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
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-editor)",
    fontSize: "calc(13.5px * var(--document-zoom, 1))",
    lineHeight: "1.65",
    fontVariantLigatures: "none",
    overflow: "auto",
  },
  ".cm-content": {
    padding: "22px 28px",
    caretColor: "var(--accent)",
    fontFamily: "inherit",
  },
  ".cm-line": {
    padding: "0 2px",
  },
  ".cm-gutters": {
    backgroundColor: "var(--surface)",
    borderRight: "1px solid var(--border)",
    color: "var(--text-muted)",
    minWidth: "44px",
    paddingRight: "6px",
  },
  ".cm-gutter": { backgroundColor: "transparent" },
  ".cm-lineNumbers .cm-gutterElement": {
    fontSize: "11px",
    fontFamily: "var(--font-editor)",
    padding: "0 8px 0 4px",
    minWidth: "2.5em",
  },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "var(--text-secondary)",
  },
  ".cm-selectionBackground": {
    backgroundColor: "var(--selection-bg-inactive) !important",
  },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--selection-bg) !important",
  },
  ".cm-selectionMatch": {
    backgroundColor: "var(--selection-match)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--accent)",
    borderLeftWidth: "2px",
  },
  ".cm-matchingBracket": {
    backgroundColor: "var(--accent-bg)",
    outline: "1px solid var(--accent-border)",
    borderRadius: "3px",
  },
  ".cm-foldPlaceholder": {
    background: "var(--accent-bg)",
    border: "1px solid var(--accent-border)",
    color: "var(--accent)",
    borderRadius: "6px",
    padding: "0 5px",
  },
  ".cm-tooltip": {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    boxShadow: "var(--shadow-menu)",
    overflow: "hidden",
  },
  ".cm-tooltip-autocomplete": {
    "& > ul > li[aria-selected]": {
      background: "var(--accent)",
      color: "var(--accent-contrast)",
    },
  },
});

export const Editor: React.FC<EditorProps> = ({ tab, searchQuery = "" }) => {
  const saveTabContent = useTabStore((state) => state.saveTabContent);
  const updateTab = useTabStore((state) => state.updateTab);
  const shortcuts = useSettingsStore((state) => state.shortcuts);
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const initialCursorPosition = useRef(tab.cursorPosition);
  const cursorUpdateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSearchQuery = useRef(searchQuery);

  log("mount", { tabId: tab.id, fileName: tab.fileName });

  const handleChange = (value: string) => {
    log("change", { length: value.length });
    saveTabContent(tab.id, value);
  };

  const persistCursor = (pos: number) => {
    if (cursorUpdateTimer.current) clearTimeout(cursorUpdateTimer.current);
    cursorUpdateTimer.current = setTimeout(() => {
      updateTab(tab.id, { cursorPosition: pos });
    }, 100);
  };

  const handleFocus = () => {
    const view = editorRef.current?.view;
    if (!view) return;
    persistCursor(view.state.selection.main.head);
  };

  useEffect(() => {
    const view = editorRef.current?.view;
    return () => {
      if (cursorUpdateTimer.current) clearTimeout(cursorUpdateTimer.current);
      if (view) {
        updateTab(tab.id, {
          scrollPosition: view.scrollDOM.scrollTop,
          cursorPosition: view.state.selection.main.head,
        });
      }
    };
  }, [tab.id, updateTab]);

  useEffect(() => {
    if (editorRef.current && initialCursorPosition.current !== undefined) {
      const view = editorRef.current.view;
      if (view) {
        view.dispatch({
          selection: { anchor: initialCursorPosition.current },
          scrollIntoView: true,
        });
      }
    }
  }, []);

  useEffect(() => {
    const view = editorRef.current?.view;
    if (view && tab.scrollPosition !== undefined) {
      view.scrollDOM.scrollTop = tab.scrollPosition;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id]);

  useEffect(() => {
    if (searchQuery === lastSearchQuery.current) return;
    lastSearchQuery.current = searchQuery;
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
      style={
        {
          "--document-zoom": tab.documentZoom ?? 1,
          height: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        } as React.CSSProperties
      }
    >
      <CodeMirror
        ref={editorRef}
        value={tab.content ?? ""}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={() => {
          const view = editorRef.current?.view;
          if (!view) return;
          if (cursorUpdateTimer.current) clearTimeout(cursorUpdateTimer.current);
          updateTab(tab.id, { cursorPosition: view.state.selection.main.head });
        }}
        onUpdate={(update) => {
          if (update.selectionSet) {
            persistCursor(update.state.selection.main.head);
          }
        }}
        theme={customTheme}
        extensions={[
          markdown(),
          syntaxHighlighting(markdownHighlightStyle),
          ...editorKeymapExtensions(shortcuts),
          EditorView.lineWrapping,
        ]}
        style={{ flex: 1, minHeight: 0, overflow: "hidden" }}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: true,
          highlightActiveLine: false,
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
          defaultKeymap: false,
          searchKeymap: true,
          historyKeymap: true,
          foldKeymap: true,
          completionKeymap: true,
          lintKeymap: true,
          // Native browser selection = white-on-blue (accessible). CM layer fights it.
          drawSelection: false,
        }}
      />
    </div>
  );
};
