import { useEffect } from "react";
import { useTabStore } from "../store/tabStore";
import { listen } from "@tauri-apps/api/event";

export const useKeyboardShortcuts = () => {
  const { tabs, activeTabId, closeTab, reopenLastClosed, updateTab } =
    useTabStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("save-file"));
      }

      // Ctrl+W
      if (e.ctrlKey && e.key === "w") {
        e.preventDefault();
        if (activeTabId) {
          closeTab(activeTabId);
        }
      }

      // Ctrl+Tab
      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        if (tabs.length > 0 && activeTabId) {
          const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
          const nextIndex = (currentIndex + 1) % tabs.length;
          useTabStore.getState().setActiveTab(tabs[nextIndex].id);
        }
      }

      // Ctrl+Shift+T
      if (e.ctrlKey && e.shiftKey && e.key === "T") {
        e.preventDefault();
        reopenLastClosed();
      }

      // Ctrl+1,2,3 for mode switching
      if (e.ctrlKey && !e.shiftKey) {
        if (e.key === "1" && activeTab) {
          e.preventDefault();
          updateTab(activeTab.id, { mode: "view" });
        } else if (e.key === "2" && activeTab) {
          e.preventDefault();
          updateTab(activeTab.id, { mode: "edit" });
        } else if (e.key === "3" && activeTab) {
          e.preventDefault();
          updateTab(activeTab.id, { mode: "split" });
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [tabs, activeTabId, closeTab, reopenLastClosed, activeTab]);
};
