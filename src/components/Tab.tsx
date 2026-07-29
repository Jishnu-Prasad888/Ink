import React from "react";
import { Tab as TabType } from "../store/tabStore";

interface TabProps {
  tab: TabType;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
  onNavigate: (direction: "previous" | "next" | "first" | "last") => void;
}

const log = (msg: string, data?: any) => {
  if (import.meta.env.DEV) console.log(`[TabComponent:${msg}]`, data ?? "");
};

export const Tab: React.FC<TabProps> = ({
  tab,
  isActive,
  onSelect,
  onClose,
  onNavigate,
}) => {
  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    log("close clicked", { id: tab.id, fileName: tab.fileName });
    onClose();
  };

  return (
    <div
      className={`tab${isActive ? " active" : ""}`}
      id={`tab-${tab.id}`}
      role="tab"
      aria-selected={isActive}
      aria-controls="editor-content"
      tabIndex={isActive ? 0 : -1}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        } else if (event.key === "Delete") {
          event.preventDefault();
          onClose();
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          onNavigate("previous");
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          onNavigate("next");
        } else if (event.key === "Home") {
          event.preventDefault();
          onNavigate("first");
        } else if (event.key === "End") {
          event.preventDefault();
          onNavigate("last");
        }
      }}
      title={tab.filePath ?? tab.fileName}
    >
      <span className="file-name">{tab.fileName}</span>
      {tab.isDirty && (
        <span className="unsaved-dot" title="Unsaved changes">
          <span className="sr-only">Unsaved changes</span>
        </span>
      )}
      <button
        type="button"
        className="close-btn"
        onClick={handleClose}
        aria-label={`Close ${tab.fileName}`}
      >
        ×
      </button>
    </div>
  );
};
