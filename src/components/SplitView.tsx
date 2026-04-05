import React from "react";
import { Editor } from "./Editor";
import { MarkdownPreview } from "./MarkdownPreview";
import { Tab } from "../store/tabStore";

interface SplitViewProps {
  tab: Tab;
}

export const SplitView: React.FC<SplitViewProps> = ({ tab }) => {
  return (
    <div className="split-view">
      <div className="editor-pane">
        <Editor tab={tab} />
      </div>
      <div className="preview-pane">
        <MarkdownPreview tab={tab} isSplit={true} />
      </div>
    </div>
  );
};
