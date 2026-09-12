import React from "react";
import { Editor } from "./Editor";
import { MarkdownPreview } from "./MarkdownPreview";
import { Tab } from "../store/tabStore";

interface SplitViewProps {
  tab: Tab;
  searchQuery?: string;
}

export const SplitView: React.FC<SplitViewProps> = ({ tab, searchQuery = "" }) => {
  const mode = tab.mode === "view" || tab.mode === "split" ? tab.mode : "edit";
  const isSplit = mode === "split";
  const editorHidden = mode === "view";
  const previewHidden = mode === "edit";

  return (
    <div className="split-view" data-mode={mode}>
      <div className="editor-pane" aria-hidden={editorHidden} inert={editorHidden || undefined}>
        <Editor tab={tab} searchQuery={searchQuery} />
      </div>
      <div className="preview-pane" aria-hidden={previewHidden} inert={previewHidden || undefined}>
        <MarkdownPreview
          tab={tab}
          isSplit={isSplit}
          searchQuery={searchQuery}
          showWidthToggle={!isSplit}
        />
      </div>
    </div>
  );
};
