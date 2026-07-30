import { useEffect, useRef, useState, useCallback } from "react";
import { TabBar } from "./components/TabBar";
import { Editor } from "./components/Editor";
import { MarkdownPreview } from "./components/MarkdownPreview";
import { SplitView } from "./components/SplitView";
import { Sidebar } from "./components/Sidebar";
import { PdfViewer } from "./components/PdfViewer";
import { ResizableSplitPane } from "./components/ResizableSplitPane";
import { useTabStore } from "./store/tabStore";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { destroyWindow } from "./utils/windowClose";

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

type Theme = "light" | "dark" | "system";

const log = (msg: string, data?: unknown) => {
  if (import.meta.env.DEV) console.log(`[App:${msg}]`, data ?? "");
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
};

// Renders the content for one tab according to its mode
function TabContent({ tabId, onFocus }: { tabId: string | null; onFocus?: () => void }) {
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

  switch (tab.mode) {
    case "view":
      return <MarkdownPreview key={tab.id} tab={tab} />;
    case "split":
      return <SplitView key={tab.id} tab={tab} />;
    default:
      return <Editor key={tab.id} tab={tab} />;
  }
}

// A panel in the split-file view with a tab-switcher header
function SplitFilePanel({
  panelIndex,
  isActive,
  onFocus,
}: {
  panelIndex: 0 | 1;
  isActive: boolean;
  onFocus: () => void;
}) {
  const { tabs, splitLayout, setPanelTab } = useTabStore();
  const panelTabId = splitLayout.panels[panelIndex].tabId;

  return (
    <div
      className={`split-file-panel ${isActive ? "split-file-panel--active" : ""}`}
      onClick={onFocus}
    >
      {/* Mini tab-bar for this panel */}
      <div className="split-file-panel-tabbar">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`split-file-panel-tab ${panelTabId === tab.id ? "active" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setPanelTab(panelIndex, tab.id);
              onFocus();
            }}
            title={tab.filePath ?? tab.fileName}
          >
            {tab.fileName}
            {tab.isDirty && <span className="unsaved-dot" />}
          </button>
        ))}
      </div>
      <div className="split-file-panel-content">
        <TabContent tabId={panelTabId} onFocus={onFocus} />
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
    markTabSaved,
    reopenLastClosed,
    setActiveTab,
  } = useTabStore();

  const [isDragging, setIsDragging] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingClose, setPendingClose] = useState<PendingClose | null>(null);
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("ink-theme") as Theme | null) ?? "system",
  );
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [commandIndex, setCommandIndex] = useState(0);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Keep stable refs to handlers so keyboard shortcuts always see current state
  const handleSaveFileRef = useRef<() => Promise<void>>(async () => {});
  const handleSaveAsRef = useRef<() => Promise<void>>(async () => {});
  const handleOpenFileRef = useRef<() => Promise<void>>(async () => {});
  const handleNewFileRef = useRef<() => void>(() => {});
  const requestCloseRef = useRef<(tabIds: string[]) => void>(() => {});

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("ink-theme", theme);
  }, [theme]);

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
      const existing = useTabStore.getState().tabs.find((tab) => tab.filePath === filePath);
      if (existing) {
        useTabStore.getState().setActiveTab(existing.id);
        return;
      }

      const fileName = filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
      if (filePath.toLowerCase().endsWith(".pdf")) {
        addTab({
          filePath,
          fileName,
          content: null,
          mode: "view",
          isDirty: false,
          type: "pdf",
        });
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
    },
    [addTab],
  );

  const handleOpenFile = useCallback(async () => {
    try {
      const paths: string[] = await invoke("open_file_dialog");
      for (const filePath of paths) await openPath(filePath);
    } catch (error) {
      showToast(`Could not open file: ${String(error)}`);
    }
  }, [openPath, showToast]);

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
        showToast(`Saved ${fileName}`);
        return true;
      } catch (error) {
        showToast(`Could not save ${tab.fileName}: ${String(error)}`);
        return false;
      }
    },
    [markTabSaved, showToast],
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
        void destroyWindow().catch((error) => {
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
          await destroyWindow();
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
      if (openTabs.some((tab) => tab.type === "markdown" && tab.isDirty)) {
        event.preventDefault();
        requestClose(
          openTabs.map((tab) => tab.id),
          true,
        );
      }
    });
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, [requestClose]);

  // ── Keyboard shortcuts (single listener, stable) ──────────────────────────
  useEffect(() => {
    const onKeyDown = async (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (ctrl && e.shiftKey && key === "p") {
        e.preventDefault();
        setCommandPaletteOpen((open) => !open);
        setCommandQuery("");
        setCommandIndex(0);
        return;
      }
      if (ctrl && key === "b") {
        e.preventDefault();
        setSidebarOpen((open) => !open);
        return;
      }

      // Ctrl+S / Ctrl+Shift+S
      if (ctrl && key === "s") {
        e.preventDefault();
        if (e.shiftKey) await handleSaveAsRef.current();
        else await handleSaveFileRef.current();
        return;
      }
      // Ctrl+O
      if (ctrl && key === "o") {
        e.preventDefault();
        await handleOpenFileRef.current();
        return;
      }
      // Ctrl+N
      if (ctrl && key === "n") {
        e.preventDefault();
        handleNewFileRef.current();
        return;
      }
      // Ctrl+W
      if (ctrl && key === "w") {
        e.preventDefault();
        const { activeTabId: aid } = useTabStore.getState();
        if (aid) requestCloseRef.current([aid]);
        return;
      }
      // Ctrl+Tab — cycle tabs
      if (ctrl && e.key === "Tab") {
        e.preventDefault();
        const { tabs: t, activeTabId: aid } = useTabStore.getState();
        if (t.length > 1 && aid) {
          const idx = t.findIndex((x) => x.id === aid);
          const next = (idx + (e.shiftKey ? -1 : 1) + t.length) % t.length;
          setActiveTab(t[next].id);
        }
        return;
      }
      // Ctrl+Shift+T — reopen last closed
      if (ctrl && e.shiftKey && key === "t") {
        e.preventDefault();
        reopenLastClosed();
        return;
      }

      // Ctrl+1/2/3 — mode switching for active tab
      if (ctrl && !e.shiftKey) {
        const { activeTabId: aid, tabs: t, updateTab: ut } = useTabStore.getState();
        const tab = t.find((x) => x.id === aid);
        if (!tab) return;
        if (e.key === "1") {
          e.preventDefault();
          ut(tab.id, { mode: "edit" });
        }
        if (e.key === "2") {
          e.preventDefault();
          ut(tab.id, { mode: "split" });
        }
        if (e.key === "3") {
          e.preventDefault();
          ut(tab.id, { mode: "view" });
        }
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [reopenLastClosed, setActiveTab]);

  // ── Drag & drop ──────────────────────────────────────────────────────────
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      setIsDragging(true);
    };
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
    };
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer?.files || []);
      for (const file of files) {
        const lower = file.name.toLowerCase();
        if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
          const content = await file.text();
          addTab({
            filePath: null,
            fileName: file.name,
            content,
            mode: "edit",
            isDirty: true,
            type: "markdown",
          });
        }
      }
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [addTab]);

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
    if (activeTab) updateTab(activeTab.id, { mode });
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
        />
        <SplitFilePanel
          panelIndex={1}
          isActive={splitLayout.activePanelIndex === 1}
          onFocus={() => setActiveSplitPanel(1)}
        />
      </ResizableSplitPane>
    );
  };

  const commands = [
    { label: "File: New Document", shortcut: "Ctrl+N", run: handleNewFile },
    { label: "File: Open Document", shortcut: "Ctrl+O", run: () => void handleOpenFile() },
    { label: "File: Save", shortcut: "Ctrl+S", run: () => void handleSaveFile() },
    {
      label: sidebarOpen ? "View: Hide Explorer" : "View: Show Explorer",
      shortcut: "Ctrl+B",
      run: () => setSidebarOpen((open) => !open),
    },
    { label: "View: Edit", shortcut: "Ctrl+1", run: () => handleModeChange("edit") },
    { label: "View: Preview to Side", shortcut: "Ctrl+2", run: () => handleModeChange("split") },
    { label: "View: Preview", shortcut: "Ctrl+3", run: () => handleModeChange("view") },
    { label: "Theme: Light", shortcut: "", run: () => setTheme("light") },
    { label: "Theme: Dark", shortcut: "", run: () => setTheme("dark") },
    { label: "Theme: Use System", shortcut: "", run: () => setTheme("system") },
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

  return (
    <div className="app-container">
      {/* ── Toolbar ── */}
      <header className="toolbar" role="toolbar" aria-label="Application toolbar">
        <button
          className="toolbar-btn"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          title="Toggle Explorer (Ctrl+B)"
          aria-label="Toggle Explorer"
          aria-expanded={sidebarOpen}
        >
          <Icon.Menu />
        </button>

        <div className="toolbar-actions">
          <button className="toolbar-btn" onClick={handleNewFile} title="New (Ctrl+N)">
            <Icon.New /> New
          </button>
          <button className="toolbar-btn" onClick={handleOpenFile} title="Open (Ctrl+O)">
            <Icon.Open /> Open
          </button>
          <div className="toolbar-divider" />
          <button
            className="toolbar-btn"
            onClick={handleSaveFile}
            title="Save (Ctrl+S)"
            disabled={!activeTab || activeTab.type !== "markdown"}
          >
            <Icon.Save /> Save
          </button>
          <button
            className="toolbar-btn"
            onClick={handleSaveAs}
            title="Save As (Ctrl+Shift+S)"
            disabled={!activeTab || activeTab.type !== "markdown"}
          >
            Save as
          </button>
          <div className="toolbar-divider" />

          {/* Split-file view controls */}
          {!splitLayout.enabled ? (
            <>
              <button
                className="toolbar-btn"
                onClick={() => enableSplitLayout("horizontal")}
                title="Open editor group to the right"
              >
                <Icon.SplitH /> Split Right
              </button>
              <button
                className="toolbar-btn"
                onClick={() => enableSplitLayout("vertical")}
                title="Open editor group below"
              >
                <Icon.SplitV /> Split Down
              </button>
            </>
          ) : (
            <>
              <button
                className={`toolbar-btn${splitLayout.direction === "horizontal" ? " active" : ""}`}
                onClick={() => setSplitDirection("horizontal")}
                title="Side by side"
                aria-pressed={splitLayout.direction === "horizontal"}
              >
                <Icon.SplitH />
              </button>
              <button
                className={`toolbar-btn${splitLayout.direction === "vertical" ? " active" : ""}`}
                onClick={() => setSplitDirection("vertical")}
                title="Top / bottom"
                aria-pressed={splitLayout.direction === "vertical"}
              >
                <Icon.SplitV />
              </button>
              <button
                className="toolbar-btn toolbar-btn--danger"
                onClick={disableSplitLayout}
                title="Close split view"
              >
                <Icon.CloseSplit /> Close split
              </button>
            </>
          )}
          <div className="toolbar-divider" />
          <button
            className="toolbar-btn"
            onClick={() => {
              setCommandPaletteOpen(true);
              setCommandQuery("");
              setCommandIndex(0);
            }}
            title="Command Palette (Ctrl+Shift+P)"
          >
            Commands
          </button>
          <button
            className="toolbar-btn theme-button"
            onClick={() =>
              setTheme((current) =>
                current === "light" ? "dark" : current === "dark" ? "system" : "light",
              )
            }
            title="Cycle color theme"
          >
            {theme === "system"
              ? "System theme"
              : `${theme[0].toUpperCase()}${theme.slice(1)} theme`}
          </button>
        </div>

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
              Preview to Side
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
        <span>
          {activeTab
            ? `${activeTab.fileName}${activeTab.isDirty ? " - Unsaved" : " - Saved"}`
            : "No document open"}
        </span>
        {activeTab?.type === "markdown" && (
          <span>
            Ln {line}, Col {column} | {wordCount} words | Markdown
          </span>
        )}
      </footer>

      {isDragging && (
        <div className="drag-overlay">
          <div className="drag-overlay-inner">Drop .md files to open</div>
        </div>
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
