import React from "react";
import { useTabStore } from "../store/tabStore";
import { Tab } from "./Tab";

export const TabBar: React.FC = () => {
  const { tabs, activeTabId, reorderTabs, closeTab, setActiveTab } =
    useTabStore();

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData("text/plain", index.toString());
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const dragIndex = parseInt(e.dataTransfer.getData("text/plain"));
    if (dragIndex !== dropIndex) reorderTabs(dragIndex, dropIndex);
  };

  if (tabs.length === 0) {
    return (
      <div className="tab-bar">
        <span
          style={{
            padding: "0 4px",
            color: "var(--text-muted)",
            fontSize: "12px",
          }}
        >
          No files open
        </span>
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
