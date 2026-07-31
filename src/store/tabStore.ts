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
  documentZoom?: number;
  pdfPage?: number;
  pdfZoom?: number;
  pdfRotation?: 0 | 90 | 180 | 270;
}

// Represents one "panel slot" in the split-file view
export interface SplitPanel {
  tabId: string | null; // which tab is shown in this panel
  viewMode: "edit" | "view";
  previewWidth: "readable" | "full";
}

// The split-file layout for the whole workspace
export interface SplitLayout {
  enabled: boolean;
  direction: "horizontal" | "vertical";
  panels: [SplitPanel, SplitPanel];
  activePanelIndex: 0 | 1;
  tabPanelAssignments: Record<string, 0 | 1>;
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
  markTabSaved: (id: string, savedContent: string, updates?: Partial<Tab>) => void;

  // Split-file view actions
  enableSplitLayout: (direction: "horizontal" | "vertical") => void;
  disableSplitLayout: () => void;
  setSplitDirection: (direction: "horizontal" | "vertical") => void;
  setActiveSplitPanel: (panelIndex: 0 | 1) => void;
  setPanelTab: (panelIndex: 0 | 1, tabId: string) => void;
  setSplitPanelViewMode: (panelIndex: 0 | 1, mode: "edit" | "view") => void;
  setSplitPanelPreviewWidth: (panelIndex: 0 | 1, width: "readable" | "full") => void;
}

const createSplitPanel = (tabId: string | null = null): SplitPanel => ({
  tabId,
  viewMode: "edit",
  previewWidth: "readable",
});

const defaultSplitLayout: SplitLayout = {
  enabled: false,
  direction: "horizontal",
  panels: [createSplitPanel(), createSplitPanel()],
  activePanelIndex: 0,
  tabPanelAssignments: {},
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
          savedContent: tab.savedContent ?? (tab.isDirty ? null : tab.content),
        };
        set((state) => {
          const newState: Partial<TabStore> = {
            tabs: [...state.tabs, newTab],
            activeTabId: newTab.id,
          };
          // If split layout is active, assign to the active panel
          if (state.splitLayout.enabled) {
            const panels = [...state.splitLayout.panels] as [SplitPanel, SplitPanel];
            const panelIndex = state.splitLayout.activePanelIndex;
            panels[panelIndex] = { ...panels[panelIndex], tabId: newTab.id };
            newState.splitLayout = {
              ...state.splitLayout,
              panels,
              tabPanelAssignments: {
                ...state.splitLayout.tabPanelAssignments,
                [newTab.id]: panelIndex,
              },
            };
          }
          return newState;
        });
      },

      updateTab: (id, updates) => {
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, ...updates } : tab)),
        }));
      },

      closeTab: (id) => {
        const state = get();
        const tabToClose = state.tabs.find((t) => t.id === id);
        if (!tabToClose) return;

        const newTabs = state.tabs.filter((t) => t.id !== id);
        const tabPanelAssignments = { ...state.splitLayout.tabPanelAssignments };
        delete tabPanelAssignments[id];
        const panels = state.splitLayout.panels.map((panel, panelIndex) => {
          if (panel.tabId !== id) return panel;
          const replacement = newTabs.find((tab) => tabPanelAssignments[tab.id] === panelIndex);
          return { ...panel, tabId: replacement?.id ?? null };
        }) as [SplitPanel, SplitPanel];

        let activePanelIndex = state.splitLayout.activePanelIndex;
        let newActiveId = state.activeTabId;
        if (state.splitLayout.enabled && state.activeTabId === id) {
          newActiveId = panels[activePanelIndex].tabId;
          if (!newActiveId) {
            const otherPanelIndex = (activePanelIndex === 0 ? 1 : 0) as 0 | 1;
            newActiveId = panels[otherPanelIndex].tabId;
            if (newActiveId) activePanelIndex = otherPanelIndex;
          }
        } else if (!state.splitLayout.enabled && state.activeTabId === id) {
          const index = state.tabs.findIndex((tab) => tab.id === id);
          newActiveId = newTabs[Math.min(index, newTabs.length - 1)]?.id ?? null;
        }
        if (newTabs.length === 0) newActiveId = null;

        const hasTabsInBothPanels = ([0, 1] as const).every((panelIndex) =>
          newTabs.some((tab) => tabPanelAssignments[tab.id] === panelIndex),
        );
        const shouldCollapse = state.splitLayout.enabled && !hasTabsInBothPanels;
        if (shouldCollapse && !newActiveId) newActiveId = newTabs[0]?.id ?? null;

        set({
          tabs: newTabs,
          activeTabId: newActiveId,
          closedTabs: [tabToClose, ...state.closedTabs.slice(0, 9)],
          splitLayout: shouldCollapse
            ? {
                ...state.splitLayout,
                enabled: false,
                panels: [createSplitPanel(), createSplitPanel()],
                activePanelIndex: 0,
                tabPanelAssignments: {},
              }
            : {
                ...state.splitLayout,
                panels,
                activePanelIndex,
                tabPanelAssignments,
              },
        });
      },

      closeAllTabs: () => {
        set({
          tabs: [],
          activeTabId: null,
          splitLayout: {
            ...get().splitLayout,
            enabled: false,
            panels: [createSplitPanel(), createSplitPanel()],
            activePanelIndex: 0,
            tabPanelAssignments: {},
          },
        });
      },

      closeOtherTabs: (id) => {
        set((state) => {
          return {
            tabs: state.tabs.filter((t) => t.id === id),
            activeTabId: id,
            splitLayout: {
              ...state.splitLayout,
              enabled: false,
              panels: [createSplitPanel(), createSplitPanel()],
              activePanelIndex: 0,
              tabPanelAssignments: {},
            },
          };
        });
      },

      setActiveTab: (id) => {
        set((state) => {
          if (!state.splitLayout.enabled) return { activeTabId: id };
          const panelIndex =
            state.splitLayout.tabPanelAssignments[id] ?? state.splitLayout.activePanelIndex;
          const panels = [...state.splitLayout.panels] as [SplitPanel, SplitPanel];
          panels[panelIndex] = { ...panels[panelIndex], tabId: id };
          return {
            activeTabId: id,
            splitLayout: {
              ...state.splitLayout,
              panels,
              activePanelIndex: panelIndex,
              tabPanelAssignments: {
                ...state.splitLayout.tabPanelAssignments,
                [id]: panelIndex,
              },
            },
          };
        });
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
          const panelIndex = state.splitLayout.activePanelIndex;
          const panels = [...state.splitLayout.panels] as [SplitPanel, SplitPanel];
          if (state.splitLayout.enabled) {
            panels[panelIndex] = { ...panels[panelIndex], tabId: lastClosed.id };
          }
          set({
            tabs: [...state.tabs, lastClosed],
            closedTabs: remaining,
            activeTabId: lastClosed.id,
            splitLayout: state.splitLayout.enabled
              ? {
                  ...state.splitLayout,
                  panels,
                  tabPanelAssignments: {
                    ...state.splitLayout.tabPanelAssignments,
                    [lastClosed.id]: panelIndex,
                  },
                }
              : state.splitLayout,
          });
        }
      },

      saveTabContent: (id, content) => {
        const tab = get().tabs.find((t) => t.id === id);
        if (tab && tab.type === "markdown") {
          const savedContent =
            tab.savedContent === undefined ? (tab.isDirty ? null : tab.content) : tab.savedContent;
          const isDirty = savedContent === null || content !== savedContent;
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
                : t,
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
        if (state.tabs.length < 2) return;
        const firstTabId = state.tabs.some((tab) => tab.id === state.activeTabId)
          ? state.activeTabId
          : (state.tabs[0]?.id ?? null);
        const otherTabs = state.tabs.filter((tab) => tab.id !== firstTabId);
        const tabPanelAssignments = Object.fromEntries(
          state.tabs.map((tab) => [tab.id, tab.id === firstTabId ? 0 : 1]),
        ) as Record<string, 0 | 1>;
        set({
          activeTabId: firstTabId,
          splitLayout: {
            enabled: true,
            direction,
            panels: [createSplitPanel(firstTabId), createSplitPanel(otherTabs[0]?.id ?? null)],
            activePanelIndex: 0,
            tabPanelAssignments,
          },
        });
      },

      disableSplitLayout: () => {
        set((state) => ({
          activeTabId:
            state.activeTabId ??
            state.splitLayout.panels.find((panel) => panel.tabId)?.tabId ??
            state.tabs[0]?.id ??
            null,
          splitLayout: {
            ...state.splitLayout,
            enabled: false,
            panels: [createSplitPanel(), createSplitPanel()],
            activePanelIndex: 0,
            tabPanelAssignments: {},
          },
        }));
      },

      setSplitDirection: (direction) => {
        set((state) => ({
          splitLayout: { ...state.splitLayout, direction },
        }));
      },

      setActiveSplitPanel: (panelIndex) => {
        set((state) => ({
          splitLayout: { ...state.splitLayout, activePanelIndex: panelIndex },
          activeTabId: state.splitLayout.panels[panelIndex].tabId,
        }));
      },

      setPanelTab: (panelIndex, tabId) => {
        set((state) => {
          if (!state.tabs.some((tab) => tab.id === tabId)) return state;
          const panels = [...state.splitLayout.panels] as [SplitPanel, SplitPanel];
          const assignments = { ...state.splitLayout.tabPanelAssignments };
          const previousPanelIndex = assignments[tabId];

          if (previousPanelIndex !== undefined && previousPanelIndex !== panelIndex) {
            if (panels[previousPanelIndex].tabId === tabId) {
              const replacement = state.tabs.find(
                (tab) => tab.id !== tabId && assignments[tab.id] === previousPanelIndex,
              );
              panels[previousPanelIndex] = {
                ...panels[previousPanelIndex],
                tabId: replacement?.id ?? null,
              };
            }
          }

          assignments[tabId] = panelIndex;
          panels[panelIndex] = { ...panels[panelIndex], tabId };
          const sourcePanelIsEmpty =
            previousPanelIndex !== undefined &&
            previousPanelIndex !== panelIndex &&
            !state.tabs.some(
              (tab) => tab.id !== tabId && assignments[tab.id] === previousPanelIndex,
            );
          if (sourcePanelIsEmpty) {
            return {
              activeTabId: tabId,
              splitLayout: {
                ...state.splitLayout,
                enabled: false,
                panels: [createSplitPanel(), createSplitPanel()],
                activePanelIndex: 0,
                tabPanelAssignments: {},
              },
            };
          }
          return {
            splitLayout: {
              ...state.splitLayout,
              panels,
              activePanelIndex: panelIndex,
              tabPanelAssignments: assignments,
            },
            activeTabId: tabId,
          };
        });
      },

      setSplitPanelViewMode: (panelIndex, viewMode) => {
        set((state) => {
          const panels = [...state.splitLayout.panels] as [SplitPanel, SplitPanel];
          panels[panelIndex] = { ...panels[panelIndex], viewMode };
          return { splitLayout: { ...state.splitLayout, panels } };
        });
      },

      setSplitPanelPreviewWidth: (panelIndex, previewWidth) => {
        set((state) => {
          const panels = [...state.splitLayout.panels] as [SplitPanel, SplitPanel];
          panels[panelIndex] = { ...panels[panelIndex], previewWidth };
          return { splitLayout: { ...state.splitLayout, panels } };
        });
      },
    }),
    {
      name: "markdown-editor-session",
      partialize: (state) => ({
        tabs: state.tabs.map((tab) => ({
          ...tab,
          content: tab.type === "markdown" ? tab.content : null,
        })),
        activeTabId: state.activeTabId,
        splitLayout: {
          ...state.splitLayout,
          // Don't persist enabled state to avoid stale panels on reload
          enabled: false,
          panels: [createSplitPanel(), createSplitPanel()],
          tabPanelAssignments: {},
        },
      }),
    },
  ),
);
