import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Tab {
  id: string;
  filePath: string | null;
  fileName: string;
  content: string;
  mode: "view" | "edit" | "split";
  isDirty: boolean;
  cursorPosition?: number;
  scrollPosition?: number;
  previewScrollPosition?: number;
}

interface TabStore {
  tabs: Tab[];
  activeTabId: string | null;
  closedTabs: Tab[];

  addTab: (tab: Omit<Tab, "id">) => void;
  updateTab: (id: string, updates: Partial<Tab>) => void;
  closeTab: (id: string) => void;
  closeAllTabs: () => void;
  closeOtherTabs: (id: string) => void;
  setActiveTab: (id: string) => void;
  reorderTabs: (startIndex: number, endIndex: number) => void;
  reopenLastClosed: () => void;
  saveTabContent: (id: string, content: string) => void;
}

export const useTabStore = create<TabStore>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,
      closedTabs: [],

      addTab: (tab) => {
        const newTab = { ...tab, id: crypto.randomUUID() };
        set((state) => ({
          tabs: [...state.tabs, newTab],
          activeTabId: newTab.id,
        }));
      },

      updateTab: (id, updates) => {
        set((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.id === id ? { ...tab, ...updates } : tab,
          ),
        }));
      },

      closeTab: (id) => {
        const state = get();
        const tabToClose = state.tabs.find((t) => t.id === id);
        if (!tabToClose) return;

        const newTabs = state.tabs.filter((t) => t.id !== id);
        let newActiveId = state.activeTabId;

        if (state.activeTabId === id && newTabs.length > 0) {
          const index = state.tabs.findIndex((t) => t.id === id);
          newActiveId = newTabs[Math.min(index, newTabs.length - 1)].id;
        } else if (newTabs.length === 0) {
          newActiveId = null;
        }

        set({
          tabs: newTabs,
          activeTabId: newActiveId,
          closedTabs: [tabToClose, ...state.closedTabs.slice(0, 9)],
        });
      },

      closeAllTabs: () => {
        set({ tabs: [], activeTabId: null });
      },

      closeOtherTabs: (id) => {
        set((state) => ({
          tabs: state.tabs.filter((t) => t.id === id),
          activeTabId: id,
        }));
      },

      setActiveTab: (id) => {
        set({ activeTabId: id });
      },

      reorderTabs: (startIndex, endIndex) => {
        set((state) => {
          const newTabs = [...state.tabs];
          const [removed] = newTabs.splice(startIndex, 1);
          newTabs.splice(endIndex, 0, removed);
          return { tabs: newTabs };
        });
      },

      reopenLastClosed: () => {
        const state = get();
        if (state.closedTabs.length > 0) {
          const [lastClosed, ...remaining] = state.closedTabs;
          set({
            tabs: [...state.tabs, lastClosed],
            closedTabs: remaining,
            activeTabId: lastClosed.id,
          });
        }
      },

      saveTabContent: (id, content) => {
        const tab = get().tabs.find((t) => t.id === id);
        if (tab) {
          const isDirty = tab.filePath ? content !== tab.content : true;
          set((state) => ({
            tabs: state.tabs.map((t) =>
              t.id === id ? { ...t, content, isDirty } : t,
            ),
          }));
        }
      },
    }),
    {
      name: "markdown-editor-session",
      partialize: (state) => ({
        tabs: state.tabs.map((tab) => ({
          ...tab,
          content: tab.content, // Save content for unsaved files
        })),
        activeTabId: state.activeTabId,
      }),
    },
  ),
);
