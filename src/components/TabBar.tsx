import React from "react";
import { useTabStore } from "../store/tabStore";
import { Tab } from "./Tab";

const log = (msg: string, data?: any) => {
  if (import.meta.env.DEV) console.log(`[TabBar:${msg}]`, data ?? "");
};

export const TabBar: React.FC = () => {
  const { tabs, activeTabId, reorderTabs, closeTab, setActiveTab } =
    useTabStore();

  const handleDragStart = (e: React.DragEvent, index: number) => {
    log("drag start", { index, fileName: tabs[index]?.fileName });
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const dragIndex = parseInt(e.dataTransfer.getData("text/plain"));
    log("drop", { dragIndex, dropIndex });
    if (dragIndex !== dropIndex) {
      reorderTabs(dragIndex, dropIndex);
    }
  };

  if (tabs.length === 0) {
    return (
      <div className="tab-bar">
        <div
          style={{
            padding: "0 16px",
            color: "var(--text-muted)",
            fontSize: "13px",
          }}
        >
          No files open
        </div>
      </div>
    );
  }

  return (
    <div className="tab-bar">
      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          draggable
          onDragStart={(e) => handleDragStart(e, index)}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, index)}
        >
          <Tab
            tab={tab}
            isActive={activeTabId === tab.id}
            onSelect={() => setActiveTab(tab.id)}
            onClose={() => closeTab(tab.id)}
          />
        </div>
      ))}
    </div>
  );
};
