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

export const Tab: React.FC<TabProps> = ({
  tab,
  isActive,
  onSelect,
  onClose,
}) => {
  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    log("close clicked", { id: tab.id, fileName: tab.fileName });
    onClose();
  };

  const handleSelect = () => {
    log("selected", { id: tab.id, fileName: tab.fileName });
    onSelect();
  };

  return (
    <div className={`tab ${isActive ? "active" : ""}`} onClick={handleSelect}>
      <span className="file-name">{tab.fileName}</span>
      {tab.isDirty && <span className="unsaved-dot" />}
      <span className="close-btn" onClick={handleClose}>
        ×
      </span>
    </div>
  );
};
