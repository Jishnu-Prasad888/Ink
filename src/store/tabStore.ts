// store/tabStore.ts – extended with type, pdf, and split-panel support
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Tab {
  id: string;
  type: "markdown" | "pdf";
  filePath: string | null;
  fileName: string;
  content: string | null; // for markdown only
  mode: "view" | "edit" | "split";
  isDirty: boolean;
  savedContent?: string | null;
  revision?: number;
  diskModifiedAt?: number;
  diskFingerprint?: string;
  cursorPosition?: number;
  scrollPosition?: number;
  previewScrollPosition?: number;
  pdfBlobUrl?: string; // for PDF rendering
}

// Represents one "panel slot" in the split-file view
export interface SplitPanel {
  tabId: string | null; // which tab is shown in this panel
}

// The split-file layout for the whole workspace
export interface SplitLayout {
  enabled: boolean;
  direction: "horizontal" | "vertical";
  panels: [SplitPanel, SplitPanel];
  activePanelIndex: 0 | 1;
}

interface TabStore {
  tabs: Tab[];
  activeTabId: string | null;
  closedTabs: Tab[];
  splitLayout: SplitLayout;

  addTab: (
    tab: Omit<Tab, "id" | "savedContent" | "revision"> &
      Partial<Pick<Tab, "savedContent" | "revision">>,
  ) => void;
  updateTab: (id: string, updates: Partial<Tab>) => void;
  closeTab: (id: string) => void;
  closeAllTabs: () => void;
  closeOtherTabs: (id: string) => void;
  setActiveTab: (id: string) => void;
  reorderTabs: (startIndex: number, endIndex: number) => void;
  reopenLastClosed: () => void;
  saveTabContent: (id: string, content: string) => void;
  markTabSaved: (
    id: string,
    savedContent: string,
    updates?: Partial<Tab>,
  ) => void;

  // Split-file view actions
  enableSplitLayout: (direction: "horizontal" | "vertical") => void;
  disableSplitLayout: () => void;
  setSplitDirection: (direction: "horizontal" | "vertical") => void;
  setActiveSplitPanel: (panelIndex: 0 | 1) => void;
  setPanelTab: (panelIndex: 0 | 1, tabId: string) => void;
}

const defaultSplitLayout: SplitLayout = {
  enabled: false,
  direction: "horizontal",
  panels: [{ tabId: null }, { tabId: null }],
  activePanelIndex: 0,
};

export const useTabStore = create<TabStore>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,
      closedTabs: [],
      splitLayout: defaultSplitLayout,

      addTab: (tab) => {
        const newTab: Tab = {
          ...tab,
          id: crypto.randomUUID(),
          revision: tab.revision ?? 0,
          savedContent:
            tab.savedContent ?? (tab.isDirty ? null : tab.content),
        };
        set((state) => {
          const newState: Partial<TabStore> = {
            tabs: [...state.tabs, newTab],
            activeTabId: newTab.id,
          };
          // If split layout is active, assign to the active panel
          if (state.splitLayout.enabled) {
            const panels = [...state.splitLayout.panels] as [SplitPanel, SplitPanel];
            panels[state.splitLayout.activePanelIndex] = { tabId: newTab.id };
            newState.splitLayout = { ...state.splitLayout, panels };
          }
          return newState;
        });
      },

      updateTab: (id, updates) => {
        set((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.id === id ? { ...tab, ...updates } : tab
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

        // Remove this tab from split panels
        const panels = state.splitLayout.panels.map((p) =>
          p.tabId === id ? { tabId: newTabs[0]?.id ?? null } : p
        ) as [SplitPanel, SplitPanel];

        set({
          tabs: newTabs,
          activeTabId: newActiveId,
          closedTabs: [tabToClose, ...state.closedTabs.slice(0, 9)],
          splitLayout: { ...state.splitLayout, panels },
        });
      },

      closeAllTabs: () => {
        set({
          tabs: [],
          activeTabId: null,
          splitLayout: {
            ...get().splitLayout,
            panels: [{ tabId: null }, { tabId: null }],
          },
        });
      },

      closeOtherTabs: (id) => {
        set((state) => ({
          tabs: state.tabs.filter((t) => t.id === id),
          activeTabId: id,
          splitLayout: {
            ...state.splitLayout,
            panels: state.splitLayout.panels.map((p) =>
              p.tabId !== id ? { tabId: id } : p
            ) as [SplitPanel, SplitPanel],
          },
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
        if (tab && tab.type === "markdown") {
          const savedContent =
            tab.savedContent === undefined
              ? tab.isDirty
                ? null
                : tab.content
              : tab.savedContent;
          const isDirty =
            savedContent === null || content !== savedContent;
          set((state) => ({
            tabs: state.tabs.map((t) =>
              t.id === id
                ? {
                    ...t,
                    content,
                    savedContent,
                    isDirty,
                    revision: (t.revision ?? 0) + 1,
                  }
                : t
            ),
          }));
        }
      },

      markTabSaved: (id, savedContent, updates = {}) => {
        set((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.id === id
              ? {
                  ...tab,
                  ...updates,
                  savedContent,
                  isDirty: tab.content !== savedContent,
                }
              : tab,
          ),
        }));
      },

      // ── Split layout actions ─────────────────────────────────────────────

      enableSplitLayout: (direction) => {
        const state = get();
        const firstTabId = state.activeTabId;
        // Second panel gets the next tab, or same if only one
        const otherTab = state.tabs.find((t) => t.id !== firstTabId);
        const secondTabId = otherTab?.id ?? firstTabId;
        set({
          splitLayout: {
            enabled: true,
            direction,
            panels: [{ tabId: firstTabId }, { tabId: secondTabId ?? null }],
            activePanelIndex: 0,
          },
        });
      },

      disableSplitLayout: () => {
        set({
          splitLayout: {
            ...get().splitLayout,
            enabled: false,
          },
        });
      },

      setSplitDirection: (direction) => {
        set((state) => ({
          splitLayout: { ...state.splitLayout, direction },
        }));
      },

      setActiveSplitPanel: (panelIndex) => {
        set((state) => ({
          splitLayout: { ...state.splitLayout, activePanelIndex: panelIndex },
          activeTabId:
            state.splitLayout.panels[panelIndex].tabId ?? state.activeTabId,
        }));
      },

      setPanelTab: (panelIndex, tabId) => {
        set((state) => {
          const panels = [...state.splitLayout.panels] as [SplitPanel, SplitPanel];
          panels[panelIndex] = { tabId };
          return {
            splitLayout: { ...state.splitLayout, panels },
            activeTabId: tabId,
          };
        });
      },
    }),
    {
      name: "markdown-editor-session",
      partialize: (state) => ({
        tabs: state.tabs.map((tab) => ({
          ...tab,
          content: tab.type === "markdown" ? tab.content : null,
          pdfBlobUrl: undefined,
        })),
        activeTabId: state.activeTabId,
        splitLayout: {
          ...state.splitLayout,
          // Don't persist enabled state to avoid stale panels on reload
          enabled: false,
        },
      }),
    }
  )
);
