import React, { useEffect, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { Tab, useTabStore } from "../store/tabStore";

interface EditorProps {
  tab: Tab;
}

export const Editor: React.FC<EditorProps> = ({ tab }) => {
  const saveTabContent = useTabStore((state) => state.saveTabContent);
  const updateTab = useTabStore((state) => state.updateTab);

  const editorRef = useRef<any>(null);

  // Custom light theme based on our CSS variables
  const customTheme = EditorView.theme({
    "&": {
      backgroundColor: "var(--bg)",
      color: "var(--text-primary)",
    },
    ".cm-content": {
      fontFamily: "var(--font-editor)",
      fontSize: "14px",
      padding: "20px",
    },
    ".cm-gutters": {
      backgroundColor: "var(--surface)",
      borderRight: "1px solid var(--border)",
    },
    ".cm-activeLine": {
      backgroundColor: "var(--surface)",
    },
  });

  const handleChange = (value: string) => {
    saveTabContent(tab.id, value);
  };

  const handleFocus = (view: any) => {
    // Save cursor position
    const pos = view.state.selection.main.head;
    updateTab(tab.id, { cursorPosition: pos });
  };

  const handleScroll = (view: any) => {
    const scrollInfo = view.scrollDOM;
    updateTab(tab.id, { scrollPosition: scrollInfo.scrollTop });
  };

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

  useEffect(() => {
    if (editorRef.current && tab.scrollPosition !== undefined) {
      const view = editorRef.current.view;
      if (view) {
        view.scrollDOM.scrollTop = tab.scrollPosition;
      }
    }
  }, [tab.scrollPosition]);

  return (
    <div className="edit-mode">
      <CodeMirror
        ref={editorRef}
        value={tab.content}
        onChange={handleChange}
        onFocus={handleFocus}
        onScroll={handleScroll}
        theme={customTheme}
        extensions={[markdown(), EditorView.lineWrapping]}
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
          crosshairCursor: true,
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
