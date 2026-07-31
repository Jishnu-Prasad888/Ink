import { useEffect, useRef, useState, useCallback } from "react";
import { TabBar } from "./components/TabBar";
import { Editor } from "./components/Editor";
import { MarkdownPreview } from "./components/MarkdownPreview";
import { SplitView } from "./components/SplitView";
import { Sidebar } from "./components/Sidebar";
import { PdfViewer } from "./components/PdfViewer";
import { ResizableSplitPane } from "./components/ResizableSplitPane";
import { Tab } from "./components/Tab";
import { SettingsModal } from "./components/SettingsModal";
import { ExportPdfModal } from "./components/ExportPdfModal";
import { useTabStore } from "./store/tabStore";
import { useSettingsStore } from "./store/settingsStore";
import { useRecentFilesStore } from "./store/recentFilesStore";
import { formatShortcut, matchesShortcut } from "./utils/shortcuts";
import { exportMarkdownToPdf } from "./utils/pdfExport";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { quitApp } from "./utils/appQuit";

interface FileInfo {
  modified: number;
  fingerprint: string;
}

interface WriteResult extends FileInfo {
  size: number;
}

interface PendingClose {
  tabIds: string[];
  closeWindow: boolean;
}

const log = (msg: string, data?: unknown) => {
  if (import.meta.env.DEV) console.log(`[App:${msg}]`, data ?? "");
};

const isSupportedDocumentPath = (path: string) =>
  [".md", ".markdown", ".txt", ".pdf"].some((extension) => path.toLowerCase().endsWith(extension));

const changeDocumentZoom = (tabId: string, direction: -1 | 0 | 1) => {
  const { tabs, updateTab } = useTabStore.getState();
  const tab = tabs.find((item) => item.id === tabId);
  if (!tab) return;
  const isPdf = tab.type === "pdf";
  const currentZoom = isPdf ? (tab.pdfZoom ?? 1) : (tab.documentZoom ?? 1);
  const rawZoom =
    direction === 0
      ? 1
      : Math.max(
          isPdf ? 0.5 : 0.6,
          Math.min(isPdf ? 3 : 2, currentZoom + direction * (isPdf ? 0.25 : 0.1)),
        );
  const nextZoom = Math.round(rawZoom * 100) / 100;
  updateTab(tab.id, isPdf ? { pdfZoom: nextZoom } : { documentZoom: nextZoom });
};

const Icon = {
  New: () => (
    <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  Open: () => (
    <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M1.5 5h11v7a1 1 0 01-1 1h-9a1 1 0 01-1-1V5zM1.5 5l1.5-3h3l1 1.5h5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Save: () => (
    <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M2 2h8l2 2v8a1 1 0 01-1 1H3a1 1 0 01-1-1V2z"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <rect x="4.5" y="1.5" width="5" height="3" rx=".5" stroke="currentColor" strokeWidth="1.3" />
      <rect x="3.5" y="8" width="7" height="4.5" rx=".5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
  Menu: () => (
    <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M2 4h10M2 7h10M2 10h10"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  ),
  SplitH: () => (
    <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="2" width="5" height="10" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="8" y="2" width="5" height="10" rx="1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
  SplitV: () => (
    <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="1" width="10" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="2" y="8" width="10" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
  CloseSplit: () => (
    <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  Settings: () => (
    <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M7 1.5v1.2M7 11.3v1.2M1.5 7h1.2M11.3 7h1.2M3.1 3.1l.9.9M10 10l.9.9M10.9 3.1l-.9.9M4 10l-.9.9"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  ),
};

// Renders the content for one tab according to its mode
function TabContent({
  tabId,
  onFocus,
  viewMode,
  previewWidth = "readable",
}: {
  tabId: string | null;
  onFocus?: () => void;
  viewMode?: "edit" | "view";
  previewWidth?: "readable" | "full";
}) {
  const tabs = useTabStore((s) => s.tabs);
  const tab = tabs.find((t) => t.id === tabId);

  if (!tab) {
    return (
      <div className="panel-empty" onClick={onFocus}>
        <span>No file open in this panel</span>
      </div>
    );
  }

  if (tab.type === "pdf") return <PdfViewer key={tab.id} tab={tab} />;

  switch (viewMode ?? tab.mode) {
    case "view":
      return (
        <MarkdownPreview
          key={tab.id}
          tab={tab}
          widthMode={previewWidth}
          showWidthToggle={viewMode === undefined}
        />
      );
    case "split":
      return viewMode === undefined ? <SplitView key={tab.id} tab={tab} /> : <Editor tab={tab} />;
    default:
      return <Editor key={tab.id} tab={tab} />;
  }
}

// A panel in the split-file view with a tab-switcher header
function SplitFilePanel({
  panelIndex,
  isActive,
  onFocus,
  onRequestClose,
}: {
  panelIndex: 0 | 1;
  isActive: boolean;
  onFocus: () => void;
  onRequestClose: (id: string) => void;
}) {
  const { tabs, splitLayout, setPanelTab, setSplitPanelViewMode, setSplitPanelPreviewWidth } =
    useTabStore();
  const panel = splitLayout.panels[panelIndex];
  const panelTabId = panel.tabId;
  const panelTabs = tabs.filter((tab) => splitLayout.tabPanelAssignments[tab.id] === panelIndex);
  const panelTab = tabs.find((tab) => tab.id === panelTabId);
  const contentId = `split-panel-${panelIndex}-content`;

  const navigateTabs = (direction: "previous" | "next" | "first" | "last", index: number) => {
    const targetIndex =
      direction === "first"
        ? 0
        : direction === "last"
          ? panelTabs.length - 1
          : direction === "previous"
            ? (index - 1 + panelTabs.length) % panelTabs.length
            : (index + 1) % panelTabs.length;
    const target = panelTabs[targetIndex];
    if (!target) return;
    setPanelTab(panelIndex, target.id);
    onFocus();
    requestAnimationFrame(() => {
      document.getElementById(`split-panel-${panelIndex}-tab-${target.id}`)?.focus();
    });
  };

  return (
    <div
      className={`split-file-panel ${isActive ? "split-file-panel--active" : ""}`}
      onClick={onFocus}
    >
      <div className="split-file-panel-header">
        <div
          className="tab-bar split-file-panel-tabbar"
          role="tablist"
          aria-label={`Open documents in panel ${panelIndex + 1}`}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes("Files")) return;
            const hasTab =
              event.dataTransfer.types.includes("application/x-ink-tab") ||
              event.dataTransfer.types.includes("text/plain");
            if (!hasTab) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={(event) => {
            const customTabId = event.dataTransfer.getData("application/x-ink-tab");
            const plainTabId = event.dataTransfer.getData("text/plain").replace(/^ink-tab:/, "");
            const tabId = customTabId || plainTabId;
            if (!tabId) return;
            event.preventDefault();
            event.stopPropagation();
            setPanelTab(panelIndex, tabId);
          }}
        >
          {panelTabs.map((tab, index) => (
            <div
              key={tab.id}
              role="presentation"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData("application/x-ink-tab", tab.id);
                event.dataTransfer.setData("text/plain", `ink-tab:${tab.id}`);
                event.dataTransfer.effectAllowed = "move";
              }}
            >
              <Tab
                tab={tab}
                isActive={panelTabId === tab.id}
                onSelect={() => {
                  setPanelTab(panelIndex, tab.id);
                  onFocus();
                }}
                onClose={() => onRequestClose(tab.id)}
                onNavigate={(direction) => navigateTabs(direction, index)}
                elementId={`split-panel-${panelIndex}-tab-${tab.id}`}
                controlsId={contentId}
              />
            </div>
          ))}
        </div>
        {panelTab?.type === "markdown" && (
          <div className="split-panel-controls" role="group" aria-label="Panel view options">
            <button
              className={panel.viewMode === "edit" ? "active" : ""}
              aria-pressed={panel.viewMode === "edit"}
              onClick={() => setSplitPanelViewMode(panelIndex, "edit")}
            >
              Edit
            </button>
            <button
              className={panel.viewMode === "view" ? "active" : ""}
              aria-pressed={panel.viewMode === "view"}
              onClick={() => setSplitPanelViewMode(panelIndex, "view")}
            >
              Preview
            </button>
            {panel.viewMode === "view" && (
              <>
                <span className="split-control-divider" aria-hidden="true" />
                <button
                  className={panel.previewWidth === "readable" ? "active" : ""}
                  aria-pressed={panel.previewWidth === "readable"}
                  onClick={() => setSplitPanelPreviewWidth(panelIndex, "readable")}
                >
                  Readable
                </button>
                <button
                  className={panel.previewWidth === "full" ? "active" : ""}
                  aria-pressed={panel.previewWidth === "full"}
                  onClick={() => setSplitPanelPreviewWidth(panelIndex, "full")}
                >
                  Full
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <div id={contentId} className="split-file-panel-content">
        <TabContent
          tabId={panelTabId}
          onFocus={onFocus}
          viewMode={panel.viewMode}
          previewWidth={panel.previewWidth}
        />
      </div>
    </div>
  );
}

function App() {
  const {
    tabs,
    activeTabId,
    addTab,
    updateTab,
    splitLayout,
    enableSplitLayout,
    disableSplitLayout,
    setSplitDirection,
    setActiveSplitPanel,
    setSplitPanelViewMode,
    markTabSaved,
    reopenLastClosed,
    setActiveTab,
  } = useTabStore();

  const [isDragging, setIsDragging] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingClose, setPendingClose] = useState<PendingClose | null>(null);
  const { theme, appFont, shortcuts, pdfOrientation, setPdfOrientation } = useSettingsStore();
  const { recentFiles, addRecentFile, removeRecentFile, clearRecentFiles } = useRecentFilesStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportTabId, setExportTabId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [commandIndex, setCommandIndex] = useState(0);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const exportTab = tabs.find((tab) => tab.id === exportTabId && tab.type === "markdown");
  const initialSessionFiles = useRef(
    [activeTab, ...tabs.filter((tab) => tab.id !== activeTabId)]
      .filter((tab): tab is NonNullable<typeof tab> => Boolean(tab?.filePath))
      .map((tab) => ({ path: tab.filePath!, fileName: tab.fileName })),
  );

  // Keep stable refs to handlers so keyboard shortcuts always see current state
  const handleSaveFileRef = useRef<() => Promise<void>>(async () => {});
  const handleSaveAsRef = useRef<() => Promise<void>>(async () => {});
  const handleOpenFileRef = useRef<() => Promise<void>>(async () => {});
  const handleNewFileRef = useRef<() => void>(() => {});
  const requestCloseRef = useRef<(tabIds: string[]) => void>(() => {});

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.font = appFont;
  }, [appFont]);

  useEffect(() => {
    [...initialSessionFiles.current]
      .reverse()
      .forEach((file) => addRecentFile(file.path, file.fileName));
  }, [addRecentFile]);

  useEffect(() => {
    const contentArea = document.getElementById("editor-content");
    if (!contentArea) return;
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey || !activeTabId || !contentArea.contains(event.target as Node)) return;
      event.preventDefault();
      changeDocumentZoom(activeTabId, event.deltaY < 0 ? 1 : -1);
    };
    contentArea.addEventListener("wheel", handleWheel, { passive: false });
    return () => contentArea.removeEventListener("wheel", handleWheel);
  }, [activeTabId]);

  // ── File operations ──────────────────────────────────────────────────────

  const handleNewFile = useCallback(() => {
    addTab({
      filePath: null,
      fileName: "Untitled",
      content: "# New Document\n\nStart writing...",
      mode: "edit",
      isDirty: true,
      type: "markdown",
    });
  }, [addTab]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const openPath = useCallback(
    async (filePath: string) => {
      const fileName = filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
      const existing = useTabStore.getState().tabs.find((tab) => tab.filePath === filePath);
      if (existing) {
        useTabStore.getState().setActiveTab(existing.id);
        addRecentFile(filePath, fileName);
        return;
      }

      if (filePath.toLowerCase().endsWith(".pdf")) {
        addTab({
          filePath,
          fileName,
          content: null,
          mode: "view",
          isDirty: false,
          type: "pdf",
        });
        addRecentFile(filePath, fileName);
        return;
      }

      const [content, info] = await Promise.all([
        invoke<string>("read_file", { path: filePath }),
        invoke<FileInfo>("get_file_info", { path: filePath }),
      ]);
      const openedWhileReading = useTabStore
        .getState()
        .tabs.find((tab) => tab.filePath === filePath);
      if (openedWhileReading) {
        useTabStore.getState().setActiveTab(openedWhileReading.id);
        addRecentFile(filePath, fileName);
        return;
      }
      addTab({
        filePath,
        fileName,
        content,
        mode: "edit",
        isDirty: false,
        type: "markdown",
        diskModifiedAt: info.modified,
        diskFingerprint: info.fingerprint,
      });
      addRecentFile(filePath, fileName);
    },
    [addRecentFile, addTab],
  );

  const handleOpenFile = useCallback(async () => {
    try {
      const paths: string[] = await invoke("open_file_dialog");
      for (const filePath of paths) await openPath(filePath);
    } catch (error) {
      showToast(`Could not open file: ${String(error)}`);
    }
  }, [openPath, showToast]);

  const handleOpenRecentFile = useCallback(
    async (filePath: string) => {
      try {
        await invoke("get_file_info", { path: filePath });
        await openPath(filePath);
      } catch (error) {
        removeRecentFile(filePath);
        showToast(`Could not open recent file: ${String(error)}`);
      }
    },
    [openPath, removeRecentFile, showToast],
  );

  const saveTab = useCallback(
    async (tabId: string, saveAs = false) => {
      const tab = useTabStore.getState().tabs.find((item) => item.id === tabId);
      if (!tab || tab.type !== "markdown" || tab.content === null) return false;

      let savePath = tab.filePath;
      if (saveAs || !savePath) {
        savePath = await invoke<string | null>("save_file_dialog");
        if (!savePath) return false;
        const lowerPath = savePath.toLowerCase();
        if (!lowerPath.endsWith(".md") && !lowerPath.endsWith(".markdown")) {
          savePath += ".md";
        }
      }

      const contentToWrite = tab.content;
      let expectedFingerprint = savePath === tab.filePath ? tab.diskFingerprint : undefined;
      let forceInitialWrite = false;

      if (savePath === tab.filePath && !expectedFingerprint) {
        try {
          const [diskContent, info] = await Promise.all([
            invoke<string>("read_file", { path: savePath }),
            invoke<FileInfo>("get_file_info", { path: savePath }),
          ]);
          const savedBaseline = tab.savedContent ?? tab.content;
          if (diskContent !== savedBaseline) {
            forceInitialWrite = await confirm(
              `${tab.fileName} changed since the previous session. Overwrite the external changes?`,
              { title: "File changed", kind: "warning" },
            );
            if (!forceInitialWrite) return false;
          }
          expectedFingerprint = info.fingerprint;
        } catch (error) {
          showToast(`Could not verify ${tab.fileName}: ${String(error)}`);
          return false;
        }
      }

      const write = (force: boolean) =>
        invoke<WriteResult>("write_file", {
          path: savePath,
          content: contentToWrite,
          expectedFingerprint,
          force,
        });

      try {
        let result: WriteResult;
        try {
          result = await write(forceInitialWrite);
        } catch (error) {
          if (!String(error).includes("FILE_MODIFIED:")) throw error;
          const overwrite = await confirm(
            `${tab.fileName} changed on disk. Overwrite the external changes?`,
            { title: "File changed", kind: "warning" },
          );
          if (!overwrite) return false;
          result = await write(true);
        }

        const fileName = savePath.replace(/\\/g, "/").split("/").pop() ?? savePath;
        markTabSaved(tab.id, contentToWrite, {
          filePath: savePath,
          fileName,
          diskModifiedAt: result.modified,
          diskFingerprint: result.fingerprint,
        });
        addRecentFile(savePath, fileName);
        showToast(`Saved ${fileName}`);
        return true;
      } catch (error) {
        showToast(`Could not save ${tab.fileName}: ${String(error)}`);
        return false;
      }
    },
    [addRecentFile, markTabSaved, showToast],
  );

  const handleSaveFile = useCallback(async () => {
    const freshTab = useTabStore
      .getState()
      .tabs.find((t) => t.id === useTabStore.getState().activeTabId);
    if (freshTab) await saveTab(freshTab.id);
  }, [saveTab]);

  const handleSaveAs = useCallback(async () => {
    const freshTab = useTabStore
      .getState()
      .tabs.find((t) => t.id === useTabStore.getState().activeTabId);
    if (freshTab) await saveTab(freshTab.id, true);
  }, [saveTab]);

  const handleExportPdf = useCallback(async () => {
    const tab = useTabStore.getState().tabs.find((item) => item.id === exportTabId);
    if (!tab || tab.type !== "markdown" || tab.content === null) return;
    setIsExporting(true);
    try {
      await exportMarkdownToPdf(
        tab.content,
        tab.fileName,
        useSettingsStore.getState().pdfOrientation,
      );
      setExportTabId(null);
    } catch (error) {
      showToast(`Could not export ${tab.fileName}: ${String(error)}`);
    } finally {
      setIsExporting(false);
    }
  }, [exportTabId, showToast]);

  const requestClose = useCallback(
    (tabIds: string[], closeWindow = false) => {
      const dirtyTabs = useTabStore
        .getState()
        .tabs.filter((tab) => tabIds.includes(tab.id) && tab.type === "markdown" && tab.isDirty);
      if (dirtyTabs.length > 0) {
        setPendingClose({ tabIds, closeWindow });
        return;
      }

      tabIds.forEach((id) => useTabStore.getState().closeTab(id));
      if (closeWindow) {
        void quitApp().catch((error) => {
          showToast(`Could not close Ink: ${String(error)}`);
        });
      }
    },
    [showToast],
  );

  const resolvePendingClose = useCallback(
    async (action: "save" | "discard" | "cancel") => {
      const request = pendingClose;
      if (!request || action === "cancel") {
        setPendingClose(null);
        return;
      }

      if (action === "save") {
        for (const id of request.tabIds) {
          const tab = useTabStore.getState().tabs.find((item) => item.id === id);
          if (tab?.isDirty && !(await saveTab(id))) return;
        }
      }

      request.tabIds.forEach((id) => useTabStore.getState().closeTab(id));
      setPendingClose(null);
      if (request.closeWindow) {
        try {
          await quitApp();
        } catch (error) {
          showToast(`Could not close Ink: ${String(error)}`);
        }
      }
    },
    [pendingClose, saveTab, showToast],
  );

  // Keep refs in sync
  useEffect(() => {
    handleSaveFileRef.current = handleSaveFile;
  }, [handleSaveFile]);
  useEffect(() => {
    handleSaveAsRef.current = handleSaveAs;
  }, [handleSaveAs]);
  useEffect(() => {
    handleOpenFileRef.current = handleOpenFile;
  }, [handleOpenFile]);
  useEffect(() => {
    handleNewFileRef.current = handleNewFile;
  }, [handleNewFile]);
  useEffect(() => {
    requestCloseRef.current = (tabIds) => requestClose(tabIds);
  }, [requestClose]);

  useEffect(() => {
    const unlisten = getCurrentWindow().onCloseRequested((event) => {
      const openTabs = useTabStore.getState().tabs;
      event.preventDefault();
      requestClose(
        openTabs.map((tab) => tab.id),
        true,
      );
    });
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, [requestClose]);

  // ── Keyboard shortcuts (single listener, stable) ──────────────────────────
  useEffect(() => {
    const onKeyDown = async (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (settingsOpen) return;
      if (exportTab) {
        if (e.key === "Escape") {
          e.preventDefault();
          setExportTabId(null);
        }
        return;
      }
      if (matchesShortcut(e, shortcuts["app.settings"])) {
        e.preventDefault();
        setSettingsOpen(true);
        return;
      }

      if (matchesShortcut(e, shortcuts["app.commandPalette"])) {
        e.preventDefault();
        setCommandPaletteOpen((open) => !open);
        setCommandQuery("");
        setCommandIndex(0);
        return;
      }
      if (matchesShortcut(e, shortcuts["view.toggleExplorer"])) {
        e.preventDefault();
        setSidebarOpen((open) => !open);
        return;
      }
      if (matchesShortcut(e, shortcuts["file.saveAs"])) {
        e.preventDefault();
        await handleSaveAsRef.current();
        return;
      }
      if (matchesShortcut(e, shortcuts["file.save"])) {
        e.preventDefault();
        await handleSaveFileRef.current();
        return;
      }
      if (matchesShortcut(e, shortcuts["file.open"])) {
        e.preventDefault();
        await handleOpenFileRef.current();
        return;
      }
      if (matchesShortcut(e, shortcuts["file.new"])) {
        e.preventDefault();
        handleNewFileRef.current();
        return;
      }
      if (matchesShortcut(e, shortcuts["file.close"])) {
        e.preventDefault();
        const { activeTabId: aid } = useTabStore.getState();
        if (aid) requestCloseRef.current([aid]);
        return;
      }
      if (matchesShortcut(e, shortcuts["file.exportPdf"])) {
        e.preventDefault();
        const tab = useTabStore
          .getState()
          .tabs.find((item) => item.id === useTabStore.getState().activeTabId);
        if (tab?.type === "markdown") setExportTabId(tab.id);
        return;
      }
      if (
        matchesShortcut(e, shortcuts["tabs.next"]) ||
        matchesShortcut(e, shortcuts["tabs.previous"])
      ) {
        e.preventDefault();
        const { tabs: t, activeTabId: aid, splitLayout: layout } = useTabStore.getState();
        const availableTabs = layout.enabled
          ? t.filter((tab) => layout.tabPanelAssignments[tab.id] === layout.activePanelIndex)
          : t;
        if (availableTabs.length > 1 && aid) {
          const idx = availableTabs.findIndex((x) => x.id === aid);
          const direction = matchesShortcut(e, shortcuts["tabs.previous"]) ? -1 : 1;
          const next = (idx + direction + availableTabs.length) % availableTabs.length;
          setActiveTab(availableTabs[next].id);
        }
        return;
      }
      if (matchesShortcut(e, shortcuts["tabs.reopen"])) {
        e.preventDefault();
        reopenLastClosed();
        return;
      }

      const requestedMode = matchesShortcut(e, shortcuts["view.edit"])
        ? "edit"
        : matchesShortcut(e, shortcuts["view.sidePreview"])
          ? "split"
          : matchesShortcut(e, shortcuts["view.preview"])
            ? "view"
            : null;
      if (requestedMode) {
        const {
          activeTabId: aid,
          tabs: t,
          updateTab: ut,
          splitLayout: layout,
          setSplitPanelViewMode: setPanelMode,
        } = useTabStore.getState();
        const tab = t.find((x) => x.id === aid);
        if (!tab) return;
        e.preventDefault();
        if (layout.enabled) {
          setPanelMode(layout.activePanelIndex, requestedMode === "edit" ? "edit" : "view");
        } else {
          ut(tab.id, { mode: requestedMode });
        }
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [exportTab, reopenLastClosed, setActiveTab, settingsOpen, shortcuts]);

  // ── Drag & drop ──────────────────────────────────────────────────────────
  useEffect(() => {
    let dragDepth = 0;
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      dragDepth += 1;
      setIsDragging(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setIsDragging(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) setIsDragging(false);
    };
    const onDrop = async (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      dragDepth = 0;
      setIsDragging(false);
      const files = Array.from(e.dataTransfer?.files || []);
      for (const file of files) {
        const lower = file.name.toLowerCase();
        if (lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".txt")) {
          try {
            const content = await file.text();
            addTab({
              filePath: null,
              fileName: file.name,
              content,
              mode: "edit",
              isDirty: true,
              type: "markdown",
            });
          } catch (error) {
            showToast(`Could not open ${file.name}: ${String(error)}`);
          }
        }
      }
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [addTab, showToast]);

  useEffect(() => {
    let draggingSupportedFiles = false;
    const unlisten = getCurrentWindow().onDragDropEvent((event) => {
      switch (event.payload.type) {
        case "enter":
          draggingSupportedFiles = event.payload.paths.some(isSupportedDocumentPath);
          setIsDragging(draggingSupportedFiles);
          break;
        case "over":
          if (draggingSupportedFiles) setIsDragging(true);
          break;
        case "leave":
          draggingSupportedFiles = false;
          setIsDragging(false);
          break;
        case "drop": {
          draggingSupportedFiles = false;
          setIsDragging(false);
          const paths = event.payload.paths.filter(isSupportedDocumentPath);
          void (async () => {
            for (const path of paths) {
              try {
                await openPath(path);
              } catch (error) {
                showToast(`Could not open ${path}: ${String(error)}`);
              }
            }
          })();
          break;
        }
      }
    });
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, [openPath, showToast]);

  // ── Tauri open-files event ───────────────────────────────────────────────
  useEffect(() => {
    const openFiles = async (files: string[]) => {
      for (const filePath of files) {
        try {
          await openPath(filePath);
        } catch (error) {
          showToast(`Could not open ${filePath}: ${String(error)}`);
        }
      }
    };

    void invoke<string[]>("get_opened_files")
      .then(openFiles)
      .catch((error) => {
        console.error("Failed to read launch files", error);
      });

    const unlisten = listen<string[]>("open-files", (event) => {
      log("open-files event", event.payload);
      void openFiles(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [openPath, showToast]);

  // ── Mode change ──────────────────────────────────────────────────────────
  const handleModeChange = (mode: "view" | "edit" | "split") => {
    if (!activeTab) return;
    if (splitLayout.enabled) {
      setSplitPanelViewMode(splitLayout.activePanelIndex, mode === "edit" ? "edit" : "view");
    } else {
      updateTab(activeTab.id, { mode });
    }
  };

  // ── Content rendering ────────────────────────────────────────────────────
  const renderSingleContent = () => {
    if (!activeTab) {
      return (
        <div className="welcome-screen">
          <h2>Markdown Editor</h2>
          <p>Drop .md files here or open one to get started</p>
          <div className="welcome-actions">
            <button className="welcome-btn primary" onClick={handleNewFile}>
              New file
            </button>
            <button className="welcome-btn" onClick={handleOpenFile}>
              Open file
            </button>
          </div>
          <section className="recent-files" aria-labelledby="recent-files-title">
            <div className="recent-files-header">
              <h3 id="recent-files-title">Recent</h3>
              {recentFiles.length > 0 && <button onClick={clearRecentFiles}>Clear</button>}
            </div>
            {recentFiles.length > 0 ? (
              <div className="recent-files-list">
                {recentFiles.slice(0, 5).map((file) => (
                  <button
                    key={file.path}
                    className="recent-file"
                    onClick={() => void handleOpenRecentFile(file.path)}
                    title={file.path}
                  >
                    <span
                      className={`recent-file-type${file.path.toLowerCase().endsWith(".pdf") ? " pdf" : ""}`}
                    >
                      {file.path.toLowerCase().endsWith(".pdf") ? "PDF" : "MD"}
                    </span>
                    <span className="recent-file-details">
                      <strong>{file.fileName}</strong>
                      <small>{file.path}</small>
                    </span>
                    <span className="recent-file-open" aria-hidden="true">
                      Open
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="recent-files-empty">Files you open will appear here.</p>
            )}
          </section>
        </div>
      );
    }
    if (activeTab.type === "pdf") return <PdfViewer key={activeTab.id} tab={activeTab} />;
    switch (activeTab.mode) {
      case "view":
        return <MarkdownPreview key={activeTab.id} tab={activeTab} />;
      case "split":
        return <SplitView key={activeTab.id} tab={activeTab} />;
      default:
        return <Editor key={activeTab.id} tab={activeTab} />;
    }
  };

  const renderContent = () => {
    if (!splitLayout.enabled) return renderSingleContent();

    return (
      <ResizableSplitPane direction={splitLayout.direction} initialSplit={50} minSize={120}>
        <SplitFilePanel
          panelIndex={0}
          isActive={splitLayout.activePanelIndex === 0}
          onFocus={() => setActiveSplitPanel(0)}
          onRequestClose={(id) => requestClose([id])}
        />
        <SplitFilePanel
          panelIndex={1}
          isActive={splitLayout.activePanelIndex === 1}
          onFocus={() => setActiveSplitPanel(1)}
          onRequestClose={(id) => requestClose([id])}
        />
      </ResizableSplitPane>
    );
  };

  const commands = [
    {
      label: "File: New Document",
      shortcut: formatShortcut(shortcuts["file.new"]),
      run: handleNewFile,
    },
    {
      label: "File: Open Document",
      shortcut: formatShortcut(shortcuts["file.open"]),
      run: () => void handleOpenFile(),
    },
    {
      label: "File: Save",
      shortcut: formatShortcut(shortcuts["file.save"]),
      run: () => void handleSaveFile(),
    },
    {
      label: "File: Save As",
      shortcut: formatShortcut(shortcuts["file.saveAs"]),
      run: () => void handleSaveAs(),
    },
    {
      label: "File: Close Tab",
      shortcut: formatShortcut(shortcuts["file.close"]),
      run: () => activeTabId && requestClose([activeTabId]),
    },
    {
      label: "File: Export PDF",
      shortcut: formatShortcut(shortcuts["file.exportPdf"]),
      run: () => activeTab?.type === "markdown" && setExportTabId(activeTab.id),
    },
    {
      label: sidebarOpen ? "View: Hide Explorer" : "View: Show Explorer",
      shortcut: formatShortcut(shortcuts["view.toggleExplorer"]),
      run: () => setSidebarOpen((open) => !open),
    },
    {
      label: "View: Edit",
      shortcut: formatShortcut(shortcuts["view.edit"]),
      run: () => handleModeChange("edit"),
    },
    {
      label: "View: Preview to Side",
      shortcut: formatShortcut(shortcuts["view.sidePreview"]),
      run: () => handleModeChange("split"),
    },
    {
      label: "View: Preview",
      shortcut: formatShortcut(shortcuts["view.preview"]),
      run: () => handleModeChange("view"),
    },
    {
      label: "Application: Settings",
      shortcut: formatShortcut(shortcuts["app.settings"]),
      run: () => setSettingsOpen(true),
    },
  ];
  const visibleCommands = commands.filter((command) =>
    command.label.toLowerCase().includes(commandQuery.trim().toLowerCase()),
  );
  const runCommand = (index: number) => {
    const command = visibleCommands[index];
    if (!command) return;
    command.run();
    setCommandPaletteOpen(false);
    setCommandQuery("");
    setCommandIndex(0);
  };

  const activeContent = activeTab?.type === "markdown" ? (activeTab.content ?? "") : "";
  const cursorPosition = Math.min(activeTab?.cursorPosition ?? 0, activeContent.length);
  const beforeCursor = activeContent.slice(0, cursorPosition);
  const line = beforeCursor.split("\n").length;
  const column = cursorPosition - beforeCursor.lastIndexOf("\n");
  const wordCount = activeContent.trim() ? activeContent.trim().split(/\s+/).length : 0;
  const activeZoom = activeTab
    ? activeTab.type === "pdf"
      ? (activeTab.pdfZoom ?? 1)
      : (activeTab.documentZoom ?? 1)
    : 1;
  const minimumZoom = activeTab?.type === "pdf" ? 0.5 : 0.6;
  const maximumZoom = activeTab?.type === "pdf" ? 3 : 2;

  return (
    <div className="app-container">
      {/* ── Toolbar ── */}
      <header className="toolbar" role="toolbar" aria-label="Application toolbar">
        <div className="toolbar-zone toolbar-zone--files">
          <button
            className="toolbar-btn toolbar-icon-btn"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={`Toggle Explorer (${formatShortcut(shortcuts["view.toggleExplorer"])})`}
            aria-label="Toggle Explorer"
            aria-expanded={sidebarOpen}
          >
            <Icon.Menu />
          </button>
          <span className="toolbar-brand" aria-label="Ink">
            Ink
          </span>
          <div className="toolbar-divider" />
          <button
            className="toolbar-btn"
            onClick={handleNewFile}
            title={`New (${formatShortcut(shortcuts["file.new"])})`}
          >
            <Icon.New /> New
          </button>
          <button
            className="toolbar-btn"
            onClick={handleOpenFile}
            title={`Open (${formatShortcut(shortcuts["file.open"])})`}
          >
            <Icon.Open /> Open
          </button>
          <button
            className="toolbar-btn"
            onClick={handleSaveFile}
            title={`Save (${formatShortcut(shortcuts["file.save"])})`}
            disabled={!activeTab || activeTab.type !== "markdown"}
          >
            <Icon.Save /> Save
          </button>
          <button
            className="toolbar-btn toolbar-compact-action"
            onClick={handleSaveAs}
            title={`Save As (${formatShortcut(shortcuts["file.saveAs"])})`}
            disabled={!activeTab || activeTab.type !== "markdown"}
          >
            Save as
          </button>
          <button
            className="toolbar-btn toolbar-compact-action"
            onClick={() => activeTab && setExportTabId(activeTab.id)}
            title={`Export PDF (${formatShortcut(shortcuts["file.exportPdf"])})`}
            disabled={!activeTab || activeTab.type !== "markdown"}
          >
            Export
          </button>
        </div>

        <div className="toolbar-center">
          {activeTab?.type === "markdown" && !splitLayout.enabled && (
            <div className="mode-switcher">
              <button
                aria-pressed={activeTab.mode === "edit"}
                className={`mode-btn${activeTab.mode === "edit" ? " active" : ""}`}
                onClick={() => handleModeChange("edit")}
              >
                Edit
              </button>
              <button
                aria-pressed={activeTab.mode === "split"}
                className={`mode-btn${activeTab.mode === "split" ? " active" : ""}`}
                onClick={() => handleModeChange("split")}
              >
                Side Preview
              </button>
              <button
                aria-pressed={activeTab.mode === "view"}
                className={`mode-btn${activeTab.mode === "view" ? " active" : ""}`}
                onClick={() => handleModeChange("view")}
              >
                Preview
              </button>
            </div>
          )}
        </div>

        <div className="toolbar-zone toolbar-zone--workspace">
          <button
            className={`toolbar-btn toolbar-icon-btn${splitLayout.enabled && splitLayout.direction === "horizontal" ? " active" : ""}`}
            onClick={() =>
              splitLayout.enabled
                ? setSplitDirection("horizontal")
                : enableSplitLayout("horizontal")
            }
            title={tabs.length < 2 ? "Open another tab before splitting" : "Split right"}
            disabled={tabs.length < 2}
            aria-label="Split right"
            aria-pressed={splitLayout.enabled && splitLayout.direction === "horizontal"}
          >
            <Icon.SplitH />
          </button>
          <button
            className={`toolbar-btn toolbar-icon-btn${splitLayout.enabled && splitLayout.direction === "vertical" ? " active" : ""}`}
            onClick={() =>
              splitLayout.enabled ? setSplitDirection("vertical") : enableSplitLayout("vertical")
            }
            title={tabs.length < 2 ? "Open another tab before splitting" : "Split down"}
            disabled={tabs.length < 2}
            aria-label="Split down"
            aria-pressed={splitLayout.enabled && splitLayout.direction === "vertical"}
          >
            <Icon.SplitV />
          </button>
          <button
            className="toolbar-btn toolbar-icon-btn toolbar-btn--danger"
            onClick={disableSplitLayout}
            title="Close split view"
            disabled={!splitLayout.enabled}
            aria-label="Close split view"
          >
            <Icon.CloseSplit />
          </button>
          <div className="toolbar-divider" />
          <button
            className="toolbar-btn toolbar-compact-action"
            onClick={() => {
              setCommandPaletteOpen(true);
              setCommandQuery("");
              setCommandIndex(0);
            }}
            title={`Commands (${formatShortcut(shortcuts["app.commandPalette"])})`}
          >
            Commands
          </button>
          <button
            className="toolbar-btn toolbar-icon-btn settings-button"
            onClick={() => setSettingsOpen(true)}
            title={`Settings (${formatShortcut(shortcuts["app.settings"])})`}
            aria-label="Open settings"
          >
            <Icon.Settings />
          </button>
        </div>
      </header>

      {/* ── Main layout ── */}
      <main className="main-layout">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} onError={showToast} />
        <div className="content-wrapper">
          {!splitLayout.enabled && <TabBar onRequestClose={(id) => requestClose([id])} />}
          <div
            id="editor-content"
            className="content-area"
            role="tabpanel"
            aria-labelledby={activeTab ? `tab-${activeTab.id}` : undefined}
          >
            {renderContent()}
          </div>
        </div>
      </main>

      <footer className="status-bar" aria-label="Document status">
        <span className="status-document">
          {activeTab
            ? `${activeTab.fileName}${activeTab.isDirty ? " - Unsaved" : " - Saved"}`
            : "No document open"}
        </span>
        {activeTab?.type === "markdown" && (
          <span className="status-metrics">
            Ln {line}, Col {column} | {wordCount} words | Markdown
          </span>
        )}
        {activeTab && (
          <div
            className="status-zoom"
            role="group"
            aria-label={`Document zoom ${Math.round(activeZoom * 100)} percent`}
          >
            <button
              onClick={() => changeDocumentZoom(activeTab.id, -1)}
              disabled={activeZoom <= minimumZoom}
              title="Zoom out"
              aria-label="Zoom out"
            >
              −
            </button>
            <button
              className="status-zoom-reset"
              onClick={() => changeDocumentZoom(activeTab.id, 0)}
              disabled={activeZoom === 1}
              title="Reset zoom"
            >
              Reset {Math.round(activeZoom * 100)}%
            </button>
            <button
              onClick={() => changeDocumentZoom(activeTab.id, 1)}
              disabled={activeZoom >= maximumZoom}
              title="Zoom in"
              aria-label="Zoom in"
            >
              +
            </button>
          </div>
        )}
      </footer>

      {isDragging && (
        <div className="drag-overlay">
          <div className="drag-overlay-inner">Drop Markdown, text, or PDF files to open</div>
        </div>
      )}

      {settingsOpen && <SettingsModal isOpen onClose={() => setSettingsOpen(false)} />}

      {exportTab && (
        <ExportPdfModal
          fileName={exportTab.fileName}
          orientation={pdfOrientation}
          isExporting={isExporting}
          onOrientationChange={setPdfOrientation}
          onCancel={() => setExportTabId(null)}
          onExport={() => void handleExportPdf()}
        />
      )}

      {commandPaletteOpen && (
        <div
          className="command-palette-backdrop"
          role="presentation"
          onMouseDown={() => setCommandPaletteOpen(false)}
        >
          <div
            className="command-palette"
            role="dialog"
            aria-modal="true"
            aria-label="Command Palette"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <input
              autoFocus
              value={commandQuery}
              placeholder="Type a command"
              aria-label="Search commands"
              aria-controls="command-list"
              aria-activedescendant={
                visibleCommands[commandIndex] ? `command-${commandIndex}` : undefined
              }
              onChange={(event) => {
                setCommandQuery(event.target.value);
                setCommandIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") setCommandPaletteOpen(false);
                else if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setCommandIndex((index) => Math.min(index + 1, visibleCommands.length - 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setCommandIndex((index) => Math.max(index - 1, 0));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  runCommand(commandIndex);
                }
              }}
            />
            <div id="command-list" className="command-list" role="listbox">
              {visibleCommands.map((command, index) => (
                <button
                  key={command.label}
                  id={`command-${index}`}
                  role="option"
                  aria-selected={index === commandIndex}
                  className={index === commandIndex ? "active" : ""}
                  onMouseEnter={() => setCommandIndex(index)}
                  onClick={() => runCommand(index)}
                >
                  <span>{command.label}</span>
                  {command.shortcut && <kbd>{command.shortcut}</kbd>}
                </button>
              ))}
              {visibleCommands.length === 0 && (
                <p className="command-empty">No matching commands</p>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="app-toast" role="status">
          {toast}
        </div>
      )}

      {pendingClose && (
        <div className="dialog-backdrop" role="presentation">
          <div
            className="save-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="save-dialog-title"
            aria-describedby="save-dialog-description"
          >
            <h2 id="save-dialog-title">Save your changes?</h2>
            <p id="save-dialog-description">
              {pendingClose.tabIds
                .map((id) => tabs.find((tab) => tab.id === id))
                .filter((tab) => tab?.isDirty)
                .map((tab) => tab!.fileName)
                .join(", ")}
            </p>
            <div className="save-dialog-actions">
              <button onClick={() => void resolvePendingClose("cancel")}>Cancel</button>
              <button className="danger" onClick={() => void resolvePendingClose("discard")}>
                Don't Save
              </button>
              <button
                className="primary"
                autoFocus
                onClick={() => void resolvePendingClose("save")}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
