import React from "react";
import { useTabStore } from "../store/tabStore";
import { Tab } from "./Tab";

interface TabBarProps {
  onRequestClose: (id: string) => void;
}

export const TabBar: React.FC<TabBarProps> = ({ onRequestClose }) => {
  const { tabs, activeTabId, reorderTabs, setActiveTab } = useTabStore();

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

  const navigateTabs = (
    direction: "previous" | "next" | "first" | "last",
    index: number,
  ) => {
    const targetIndex =
      direction === "first"
        ? 0
        : direction === "last"
          ? tabs.length - 1
          : direction === "previous"
            ? (index - 1 + tabs.length) % tabs.length
            : (index + 1) % tabs.length;
    const target = tabs[targetIndex];
    setActiveTab(target.id);
    requestAnimationFrame(() => {
      document.getElementById(`tab-${target.id}`)?.focus();
    });
  };

  if (tabs.length === 0) {
    return (
      <div className="tab-bar" role="tablist" aria-label="Open documents">
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
    <div className="tab-bar" role="tablist" aria-label="Open documents">
      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          role="presentation"
          draggable
          onDragStart={(e) => handleDragStart(e, index)}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, index)}
        >
          <Tab
            tab={tab}
            isActive={activeTabId === tab.id}
            onSelect={() => setActiveTab(tab.id)}
            onClose={() => onRequestClose(tab.id)}
            onNavigate={(direction) => navigateTabs(direction, index)}
          />
        </div>
      ))}
    </div>
  );
};
