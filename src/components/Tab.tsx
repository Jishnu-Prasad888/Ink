import React from "react";
import { Tab as TabType } from "../store/tabStore";

interface TabProps {
  tab: TabType;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
}

const log = (msg: string, data?: any) => {
  if (import.meta.env.DEV) console.log(`[TabComponent:${msg}]`, data ?? "");
};

export const Tab: React.FC<TabProps> = ({ tab, isActive, onSelect, onClose }) => {
  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    log("close clicked", { id: tab.id, fileName: tab.fileName });
    onClose();
  };

  return (
    <div
      className={`tab${isActive ? " active" : ""}`}
      onClick={onSelect}
      title={tab.filePath ?? tab.fileName}
    >
      <span className="file-name">{tab.fileName}</span>
      {tab.isDirty && <span className="unsaved-dot" title="Unsaved changes" />}
      <span className="close-btn" onClick={handleClose}>×</span>
    </div>
  );
};
