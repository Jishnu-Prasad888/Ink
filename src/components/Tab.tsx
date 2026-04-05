import React from "react";
import { Tab as TabType } from "../store/tabStore";

interface TabProps {
  tab: TabType;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
}

export const Tab: React.FC<TabProps> = ({
  tab,
  isActive,
  onSelect,
  onClose,
}) => {
  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  };

  return (
    <div className={`tab ${isActive ? "active" : ""}`} onClick={onSelect}>
      <span className="file-name">{tab.fileName}</span>
      {tab.isDirty && <span className="unsaved-dot" />}
      <span className="close-btn" onClick={handleClose}>
        ×
      </span>
    </div>
  );
};
