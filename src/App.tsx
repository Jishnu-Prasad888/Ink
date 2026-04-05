import { useEffect, useState } from "react";
import { TabBar } from "./components/TabBar";
import { Editor } from "./components/Editor";
import { MarkdownPreview } from "./components/MarkdownPreview";
import { SplitView } from "./components/SplitView";
import { useTabStore } from "./store/tabStore";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useSingleInstance } from "./hooks/useSingleInstance";
import { listen } from "@tauri-apps/api/event";
import { readFile } from "@tauri-apps/plugin-fs";
import { basename } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";

const log = (msg: string, data?: any) => {
  if (import.meta.env.DEV) console.log(`[App:${msg}]`, data ?? "");
};

function App() {
  const { tabs, activeTabId, addTab, updateTab } = useTabStore();
  const [isDragging, setIsDragging] = useState(false);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  useKeyboardShortcuts();
  useSingleInstance();

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
      log(
        "files dropped",
        files.map((f) => f.name),
      );
      for (const file of files) {
        if (file.name.endsWith(".md") || file.name.endsWith(".markdown")) {
          const content = await file.text();
          addTab({
            filePath: null,
            fileName: file.name,
            content,
            mode: "edit",
            isDirty: true,
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
          const data = await readFile(filePath);
          const content = new TextDecoder().decode(data);
          const fileName = await basename(filePath);
          addTab({ filePath, fileName, content, mode: "edit", isDirty: false });
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
    log("New File button clicked");
    addTab({
      filePath: null,
      fileName: "Untitled",
      content: "# New Document\n\nStart writing...",
      mode: "edit",
      isDirty: false,
    });
  };

  const handleOpenFile = async () => {
    log("Open File button clicked, invoking open_file_dialog");
    const paths: string[] = await invoke("open_file_dialog");
    log("open_file_dialog returned", paths);
    for (const filePath of paths) {
      const existing = useTabStore
        .getState()
        .tabs.find((t) => t.filePath === filePath);
      if (existing) {
        log("file already open, activating tab", existing.id);
        useTabStore.getState().setActiveTab(existing.id);
        continue;
      }
      const data = await readFile(filePath);
      const content = new TextDecoder().decode(data);
      const fileName = await basename(filePath);
      addTab({ filePath, fileName, content, mode: "edit", isDirty: false });
    }
  };

  const handleSaveFile = async () => {
    if (!activeTab) {
      log("Save File - no active tab");
      return;
    }
    log("Save File button clicked for", {
      id: activeTab.id,
      filePath: activeTab.filePath,
    });
    const freshTab = useTabStore
      .getState()
      .tabs.find((t) => t.id === activeTab.id);
    if (!freshTab) return;
    if (freshTab.filePath) {
      log("saving to existing path", freshTab.filePath);
      await invoke("write_file", {
        path: freshTab.filePath,
        content: freshTab.content,
      });
      updateTab(freshTab.id, { isDirty: false });
    } else {
      log("no filePath, opening save dialog");
      let savePath: string | null = await invoke("save_file_dialog");
      log("save_file_dialog returned", savePath);
      if (savePath) {
        if (!savePath.endsWith(".md") && !savePath.endsWith(".markdown")) {
          savePath += ".md";
        }
        await invoke("write_file", {
          path: savePath,
          content: freshTab.content,
        });
        const fileName = await basename(savePath);
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
    log("Save As button clicked for", activeTab.id);
    const freshTab = useTabStore
      .getState()
      .tabs.find((t) => t.id === activeTab.id);
    if (!freshTab) return;
    let savePath: string | null = await invoke("save_file_dialog");
    log("save_file_dialog returned", savePath);
    if (savePath) {
      if (!savePath.endsWith(".md") && !savePath.endsWith(".markdown")) {
        savePath += ".md";
      }
      await invoke("write_file", { path: savePath, content: freshTab.content });
      const fileName = await basename(savePath);
      updateTab(freshTab.id, { filePath: savePath, fileName, isDirty: false });
    }
  };

  const handleExportPDF = () => {
    log("Export PDF button clicked, calling window.print()");
    window.print();
  };

  const handleModeChange = (mode: "view" | "edit" | "split") => {
    if (activeTab) {
      log("Mode change", { from: activeTab.mode, to: mode });
      updateTab(activeTab.id, { mode });
    }
  };

  const renderContent = () => {
    if (!activeTab) {
      log("renderContent - no active tab, showing welcome screen");
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "var(--text-muted)",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <h2>Markdown Editor</h2>
          <p>Drop .md files here or use File → Open</p>
          <div style={{ display: "flex", gap: "12px" }}>
            <button onClick={handleNewFile} style={{ padding: "8px 16px" }}>
              New File
            </button>
            <button onClick={handleOpenFile} style={{ padding: "8px 16px" }}>
              Open File
            </button>
          </div>
        </div>
      );
    }
    log("renderContent - active mode", activeTab.mode);
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "4px 12px",
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={handleNewFile}
            style={{ padding: "4px 8px", fontSize: "12px" }}
          >
            New
          </button>
          <button
            onClick={handleOpenFile}
            style={{ padding: "4px 8px", fontSize: "12px" }}
          >
            Open
          </button>
          <button
            onClick={handleSaveFile}
            style={{ padding: "4px 8px", fontSize: "12px" }}
          >
            Save
          </button>
          <button
            onClick={handleSaveAs}
            style={{ padding: "4px 8px", fontSize: "12px" }}
          >
            Save As
          </button>
          <button
            onClick={handleExportPDF}
            style={{ padding: "4px 8px", fontSize: "12px" }}
          >
            Export PDF
          </button>
        </div>
        {activeTab && (
          <div
            style={{
              display: "flex",
              gap: "4px",
              background: "var(--surface-elevated)",
              borderRadius: "6px",
              padding: "2px",
            }}
          >
            <button
              onClick={() => handleModeChange("view")}
              style={{
                padding: "4px 12px",
                fontSize: "12px",
                background:
                  activeTab.mode === "view" ? "var(--accent)" : "transparent",
                color:
                  activeTab.mode === "view" ? "white" : "var(--text-secondary)",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              View
            </button>
            <button
              onClick={() => handleModeChange("edit")}
              style={{
                padding: "4px 12px",
                fontSize: "12px",
                background:
                  activeTab.mode === "edit" ? "var(--accent)" : "transparent",
                color:
                  activeTab.mode === "edit" ? "white" : "var(--text-secondary)",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Edit
            </button>
            <button
              onClick={() => handleModeChange("split")}
              style={{
                padding: "4px 12px",
                fontSize: "12px",
                background:
                  activeTab.mode === "split" ? "var(--accent)" : "transparent",
                color:
                  activeTab.mode === "split"
                    ? "white"
                    : "var(--text-secondary)",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Live Preview
            </button>
          </div>
        )}
      </div>
      <TabBar />
      <div className="content-area">{renderContent()}</div>
      {isDragging && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(9, 105, 218, 0.1)",
            border: "2px dashed var(--accent)",
            pointerEvents: "none",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "var(--surface-elevated)",
              padding: "20px",
              borderRadius: "8px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            }}
          >
            Drop .md files here
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
