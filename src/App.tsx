import { useEffect, useState } from "react";
import { TabBar } from "./components/TabBar";
import { Editor } from "./components/Editor";
import { MarkdownPreview } from "./components/MarkdownPreview";
import { SplitView } from "./components/SplitView";
import { Sidebar } from "./components/Sidebar";
import { PdfViewer } from "./components/PdfViewer";
import { useTabStore } from "./store/tabStore";
import { useSingleInstance } from "./hooks/useSingleInstance";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

const log = (msg: string, data?: any) => {
  if (import.meta.env.DEV) console.log(`[App:${msg}]`, data ?? "");
};

const Icon = {
  New: () => (
    <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M7 2v10M2 7h10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
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
      <rect
        x="4.5"
        y="1.5"
        width="5"
        height="3"
        rx=".5"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <rect
        x="3.5"
        y="8"
        width="7"
        height="4.5"
        rx=".5"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  ),
  Export: () => (
    <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M2 10v2h10v-2M7 2v7M4.5 6.5L7 9l2.5-2.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
};

function App() {
  const { tabs, activeTabId, addTab, updateTab } = useTabStore();
  const [isDragging, setIsDragging] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  useSingleInstance();

  useEffect(() => {
    const onKeyDown = async (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;

      if (e.key === "s" && e.shiftKey) {
        e.preventDefault();
        await handleSaveAs();
        return;
      }
      if (e.key === "s") {
        e.preventDefault();
        await handleSaveFile();
        return;
      }
      if (e.key === "o") {
        e.preventDefault();
        await handleOpenFile();
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTabId]);

  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
    };
    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
    };
    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer?.files || []);
      for (const file of files) {
        const lowerName = file.name.toLowerCase();
        if (lowerName.endsWith(".md") || lowerName.endsWith(".markdown")) {
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
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, []);

  useEffect(() => {
    const unlisten = listen("open-files", (event: any) => {
      const files: string[] = event.payload;
      log("open-files event", files);
      files.forEach(async (filePath) => {
        try {
          const content: string = await invoke("read_file", { path: filePath });
          const fileName =
            filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
          addTab({
            filePath,
            fileName,
            content,
            mode: "edit",
            isDirty: false,
            type: "markdown",
          });
        } catch (error) {
          console.error("Failed to open file:", error);
        }
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleNewFile = async () => {
    addTab({
      filePath: null,
      fileName: "Untitled",
      content: "# New Document\n\nStart writing...",
      mode: "edit",
      isDirty: false,
      type: "markdown",
    });
  };

  const handleOpenFile = async () => {
    const paths: string[] = await invoke("open_file_dialog");
    for (const filePath of paths) {
      const existing = useTabStore
        .getState()
        .tabs.find((t) => t.filePath === filePath);
      if (existing) {
        useTabStore.getState().setActiveTab(existing.id);
        continue;
      }
      const content: string = await invoke("read_file", { path: filePath });
      const fileName =
        filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
      addTab({
        filePath,
        fileName,
        content,
        mode: "edit",
        isDirty: false,
        type: "markdown",
      });
    }
  };

  const handleSaveFile = async () => {
    if (!activeTab) return;
    const freshTab = useTabStore
      .getState()
      .tabs.find((t) => t.id === activeTab.id);
    if (!freshTab) return;
    if (freshTab.filePath) {
      await invoke("write_file", {
        path: freshTab.filePath,
        content: freshTab.content,
      });
      updateTab(freshTab.id, { isDirty: false });
    } else {
      let savePath: string | null = await invoke("save_file_dialog");
      if (savePath) {
        if (!savePath.endsWith(".md") && !savePath.endsWith(".markdown"))
          savePath += ".md";
        await invoke("write_file", {
          path: savePath,
          content: freshTab.content,
        });
        const fileName =
          savePath.replace(/\\/g, "/").split("/").pop() ?? savePath;
        updateTab(freshTab.id, {
          filePath: savePath,
          fileName,
          isDirty: false,
        });
      }
    }
  };

  const handleSaveAs = async () => {
    if (!activeTab) return;
    const freshTab = useTabStore
      .getState()
      .tabs.find((t) => t.id === activeTab.id);
    if (!freshTab) return;
    let savePath: string | null = await invoke("save_file_dialog");
    if (savePath) {
      if (!savePath.endsWith(".md") && !savePath.endsWith(".markdown"))
        savePath += ".md";
      await invoke("write_file", { path: savePath, content: freshTab.content });
      const fileName =
        savePath.replace(/\\/g, "/").split("/").pop() ?? savePath;
      updateTab(freshTab.id, { filePath: savePath, fileName, isDirty: false });
    }
  };

  const handleModeChange = (mode: "view" | "edit" | "split") => {
    if (activeTab) updateTab(activeTab.id, { mode });
  };

  const renderContent = () => {
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

    if (activeTab.type === "pdf") {
      return <PdfViewer tab={activeTab} />;
    }

    switch (activeTab.mode) {
      case "view":
        return <MarkdownPreview tab={activeTab} />;
      case "edit":
        return <Editor tab={activeTab} />;
      case "split":
        return <SplitView tab={activeTab} />;
      default:
        return <Editor tab={activeTab} />;
    }
  };

  return (
    <div className="app-container">
      <div className="toolbar">
        <button
          className="toolbar-btn"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          title="Toggle sidebar"
        >
          <Icon.Menu />
        </button>
        <div className="toolbar-actions">
          <button
            className="toolbar-btn"
            onClick={handleNewFile}
            title="New (Ctrl+N)"
          >
            <Icon.New /> New
          </button>
          <button
            className="toolbar-btn"
            onClick={handleOpenFile}
            title="Open (Ctrl+O)"
          >
            <Icon.Open /> Open
          </button>
          <div className="toolbar-divider" />
          <button
            className="toolbar-btn"
            onClick={handleSaveFile}
            title="Save (Ctrl+S)"
          >
            <Icon.Save /> Save
          </button>
          <button
            className="toolbar-btn"
            onClick={handleSaveAs}
            title="Save As (Ctrl+Shift+S)"
          >
            Save as
          </button>
        </div>
        {activeTab && (
          <div className="mode-switcher">
            <button
              className={`mode-btn${activeTab.mode === "edit" ? " active" : ""}`}
              onClick={() => handleModeChange("edit")}
            >
              Edit
            </button>
            <button
              className={`mode-btn${activeTab.mode === "split" ? " active" : ""}`}
              onClick={() => handleModeChange("split")}
            >
              Split
            </button>
            <button
              className={`mode-btn${activeTab.mode === "view" ? " active" : ""}`}
              onClick={() => handleModeChange("view")}
            >
              Preview
            </button>
          </div>
        )}
      </div>

      <div className="main-layout">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="content-wrapper">
          <TabBar />
          <div className="content-area">{renderContent()}</div>
        </div>
      </div>

      {isDragging && (
        <div className="drag-overlay">
          <div className="drag-overlay-inner">Drop .md files to open</div>
        </div>
      )}
    </div>
  );
}

export default App;
