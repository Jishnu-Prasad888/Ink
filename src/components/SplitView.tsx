import React from "react";
import { Editor } from "./Editor";
import { MarkdownPreview } from "./MarkdownPreview";
import { Tab } from "../store/tabStore";

interface SplitViewProps {
  tab: Tab;
  searchQuery?: string;
}

export const SplitView: React.FC<SplitViewProps> = ({ tab, searchQuery = "" }) => {
  return (
    <div className="split-view">
      <div className="editor-pane">
        <Editor tab={tab} searchQuery={searchQuery} />
      </div>
      <div className="preview-pane">
        <MarkdownPreview tab={tab} isSplit={true} searchQuery={searchQuery} />
      </div>
    </div>
  );
};
