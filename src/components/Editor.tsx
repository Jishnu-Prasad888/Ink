import React, { useEffect, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { Tab, useTabStore } from "../store/tabStore";

interface EditorProps {
  tab: Tab;
  searchQuery?: string;
}

const log = (msg: string, data?: any) => {
  if (import.meta.env.DEV) console.log(`[Editor:${msg}]`, data ?? "");
};

export const Editor: React.FC<EditorProps> = ({ tab, searchQuery = "" }) => {
  const saveTabContent = useTabStore((state) => state.saveTabContent);
  const updateTab = useTabStore((state) => state.updateTab);
  const editorRef = useRef<any>(null);

  log("mount", { tabId: tab.id, fileName: tab.fileName });

  const customTheme = EditorView.theme({
    "&": {
      backgroundColor: "#ffffff",
      color: "#1a1917",
      height: "100%",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      fontFamily: "'Geist Mono', 'Fira Code', monospace",
      fontSize: "13.5px",
      lineHeight: "1.75",
      // Must be "auto" (not hidden/clip) so the native scrollbar renders.
      overflow: "auto",
    },
    ".cm-content": {
      padding: "24px 28px",
      caretColor: "#2d6be4",
    },
    ".cm-gutters": {
      backgroundColor: "#fafaf8",
      borderRight: "1px solid #e4e3de",
      color: "#cccbc5",
      minWidth: "48px",
      paddingRight: "8px",
    },
    ".cm-gutter": { backgroundColor: "#fafaf8" },
    ".cm-lineNumbers .cm-gutterElement": { fontSize: "11.5px" },
    ".cm-activeLine": { backgroundColor: "#f7f6f3" },
    ".cm-activeLineGutter": {
      backgroundColor: "#f2f1ee",
      color: "#a09e99",
    },
    ".cm-selectionBackground, ::selection": {
      backgroundColor: "#dce9fb !important",
    },
    ".cm-cursor": {
      borderLeftColor: "#2d6be4",
      borderLeftWidth: "2px",
    },
    ".cm-matchingBracket": {
      backgroundColor: "#eef3fd",
      outline: "1px solid #c3d4f8",
    },
    ".cm-foldPlaceholder": {
      background: "#eef3fd",
      border: "1px solid #c3d4f8",
      color: "#2d6be4",
      borderRadius: "3px",
      padding: "0 4px",
    },
    ".cm-tooltip": {
      background: "#ffffff",
      border: "1px solid #e4e3de",
      borderRadius: "6px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    },
    ".cm-tooltip-autocomplete": {
      "& > ul > li[aria-selected]": {
        background: "#eef3fd",
        color: "#1a1917",
      },
    },
    // Markdown syntax
    ".cm-header":   { color: "#1a1917", fontWeight: "500" },
    ".cm-header-1": { fontSize: "1.12em" },
    ".cm-header-2": { fontSize: "1.05em" },
    ".cm-strong":   { color: "#1a1917", fontWeight: "600" },
    ".cm-em":       { color: "#6b6860", fontStyle: "italic" },
    ".cm-link":     { color: "#2d6be4" },
    ".cm-url":      { color: "#6b9ff0" },
    ".cm-quote":    { color: "#a09e99", fontStyle: "italic" },
    ".cm-code":     { color: "#2d6be4", background: "#f0f4fd", borderRadius: "3px" },
    ".cm-hr":       { color: "#cccbc5" },
    ".cm-list":     { color: "#6b6860" },
  });

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
    return () => {
      const view = editorRef.current?.view;
      if (view) {
        updateTab(tab.id, { scrollPosition: view.scrollDOM.scrollTop });
      }
    };
  }, [tab.id]);

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
  }, []); // empty deps — run once on mount only

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
    <div className="edit-mode" style={{ height: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <CodeMirror
        ref={editorRef}
        value={tab.content ?? ""}
        onChange={handleChange}
        onFocus={handleFocus}
        theme={customTheme}
        extensions={[markdown(), EditorView.lineWrapping]}
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
