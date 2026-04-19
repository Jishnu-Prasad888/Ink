import { useEffect, useState } from "react";
import { TabBar } from "./components/TabBar";
import { Editor } from "./components/Editor";
import { MarkdownPreview } from "./components/MarkdownPreview";
import { SplitView } from "./components/SplitView";
import { useTabStore } from "./store/tabStore";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useSingleInstance } from "./hooks/useSingleInstance";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { renderMarkdown } from "./utils/markdown";
import html2pdf from "html2pdf.js";
import { openPath } from "@tauri-apps/plugin-opener";

const log = (msg: string, data?: any) => {
  if (import.meta.env.DEV) console.log(`[App:${msg}]`, data ?? "");
};

const Icon = {
  New: () => (
    <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  Open: () => (
    <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1.5 5h11v7a1 1 0 01-1 1h-9a1 1 0 01-1-1V5zM1.5 5l1.5-3h3l1 1.5h5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  ),
  Save: () => (
    <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 2h8l2 2v8a1 1 0 01-1 1H3a1 1 0 01-1-1V2z" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="4.5" y="1.5" width="5" height="3" rx=".5" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="3.5" y="8" width="7" height="4.5" rx=".5" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  ),
  Export: () => (
    <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 10v2h10v-2M7 2v7M4.5 6.5L7 9l2.5-2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
};

function App() {
  const { tabs, activeTabId, addTab, updateTab } = useTabStore();
  const [isDragging, setIsDragging] = useState(false);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  useKeyboardShortcuts();
  useSingleInstance();

  useEffect(() => {
    const handleDragOver = (e: DragEvent) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = (e: DragEvent) => { e.preventDefault(); setIsDragging(false); };
    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer?.files || []);
      log("files dropped", files.map((f) => f.name));
      for (const file of files) {
        const lowerName = file.name.toLowerCase();
        if (lowerName.endsWith(".md") || lowerName.endsWith(".markdown") || lowerName.endsWith(".txt")) {
          const content = await file.text();
          addTab({ filePath: null, fileName: file.name, content, mode: "edit", isDirty: true });
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
    // 1. Check for files opened on startup
    const checkInitialFiles = async () => {
      try {
        const files: string[] = await invoke("get_opened_files");
        if (files && files.length > 0) {
          log("Initial opened files", files);
          for (const filePath of files) {
            try {
              const content: string = await invoke("read_file", { path: filePath });
              const fileName = filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
              addTab({ filePath, fileName, content, mode: "edit", isDirty: false });
            } catch (err) {
              console.error("Failed to open initial file:", err);
            }
          }
        }
      } catch (err) {
        console.error("Failed to get initially opened files:", err);
      }
    };
    checkInitialFiles();

    // 2. Listen for 'open-files' event (from subsequent instance attempts)
    const unlisten = listen("open-files", (event: any) => {
      const files: string[] = event.payload;
      log("open-files event", files);
      files.forEach(async (filePath) => {
        try {
          const content: string = await invoke("read_file", { path: filePath });
          const fileName = filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
          addTab({ filePath, fileName, content, mode: "edit", isDirty: false });
        } catch (error) {
          console.error("Failed to open file:", error);
        }
      });
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const handleNewFile = async () => {
    addTab({ filePath: null, fileName: "Untitled", content: "# New Document\n\nStart writing...", mode: "edit", isDirty: false });
  };

  const handleOpenFile = async () => {
    const paths: string[] = await invoke("open_file_dialog");
    for (const filePath of paths) {
      const existing = useTabStore.getState().tabs.find((t) => t.filePath === filePath);
      if (existing) { useTabStore.getState().setActiveTab(existing.id); continue; }
      const content: string = await invoke("read_file", { path: filePath });
      const fileName = filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
      addTab({ filePath, fileName, content, mode: "edit", isDirty: false });
    }
  };

  const handleSaveFile = async () => {
    if (!activeTab) return;
    const freshTab = useTabStore.getState().tabs.find((t) => t.id === activeTab.id);
    if (!freshTab) return;
    if (freshTab.filePath) {
      await invoke("write_file", { path: freshTab.filePath, content: freshTab.content });
      updateTab(freshTab.id, { isDirty: false });
    } else {
      let savePath: string | null = await invoke("save_file_dialog");
      if (savePath) {
        if (!savePath.endsWith(".md") && !savePath.endsWith(".markdown")) savePath += ".md";
        await invoke("write_file", { path: savePath, content: freshTab.content });
        const fileName = savePath.replace(/\\/g, "/").split("/").pop() ?? savePath;
        updateTab(freshTab.id, { filePath: savePath, fileName, isDirty: false });
      }
    }
  };

  const handleSaveAs = async () => {
    if (!activeTab) return;
    const freshTab = useTabStore.getState().tabs.find((t) => t.id === activeTab.id);
    if (!freshTab) return;
    let savePath: string | null = await invoke("save_file_dialog");
    if (savePath) {
      if (!savePath.endsWith(".md") && !savePath.endsWith(".markdown")) savePath += ".md";
      await invoke("write_file", { path: savePath, content: freshTab.content });
      const fileName = savePath.replace(/\\/g, "/").split("/").pop() ?? savePath;
      updateTab(freshTab.id, { filePath: savePath, fileName, isDirty: false });
    }
  };

  const handleExportPDF = async () => {
    if (!activeTab) return;

    // 1. Ask the user where to save the PDF (native dialog)
    const fileName = (activeTab.fileName || "document").replace(/\.(md|markdown)$/i, "");
    let savePath: string | null = await invoke("save_pdf_dialog");
    if (!savePath) return; // user cancelled
    if (!savePath.toLowerCase().endsWith(".pdf")) savePath += ".pdf";

    // 2. Render markdown to HTML
    const htmlContent = await renderMarkdown(activeTab.content);

    // 3. Build an off-screen styled container
    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.left = "-99999px";
    container.style.top = "0";
    container.style.width = "210mm";
    container.style.background = "#ffffff";
    container.innerHTML = `
      <style>
        .pdf-export-body {
          font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
          color: #1a1917;
          line-height: 1.8;
          padding: 0;
          background: #ffffff;
          font-size: 14px;
        }
        .pdf-export-body h1, .pdf-export-body h2, .pdf-export-body h3,
        .pdf-export-body h4, .pdf-export-body h5, .pdf-export-body h6 {
          color: #1a1917;
          font-weight: 600;
          margin: 1.4em 0 0.5em;
          line-height: 1.3;
          page-break-after: avoid;
          break-after: avoid;
        }
        .pdf-export-body h1 { font-size: 1.85em; }
        .pdf-export-body h2 { font-size: 1.35em; border-bottom: 1px solid #e4e3de; padding-bottom: 0.4em; }
        .pdf-export-body h3 { font-size: 1.1em; }
        .pdf-export-body p { margin: 0.65em 0; color: #37352f; font-size: 0.97em; }
        .pdf-export-body a { color: #2d6be4; text-decoration: underline; }
        .pdf-export-body code {
          font-family: 'Consolas', 'Fira Code', monospace;
          font-size: 0.84em;
          background: #f5f5f5;
          border: 1px solid #e0e0e0;
          padding: 1px 5px;
          border-radius: 4px;
          color: #2d6be4;
        }
        .pdf-export-body pre {
          background: #f6f8fa;
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          padding: 14px 18px;
          overflow-x: auto;
          margin: 1em 0;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .pdf-export-body pre code {
          background: none;
          border: none;
          padding: 0;
          color: #1a1917;
          white-space: pre-wrap;
          word-wrap: break-word;
        }
        .pdf-export-body blockquote {
          border-left: 3px solid #cccbc5;
          padding: 4px 0 4px 16px;
          margin: 1em 0;
          color: #6b6860;
          font-style: italic;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .pdf-export-body ul, .pdf-export-body ol {
          padding-left: 1.5em;
          color: #37352f;
          margin: 0.65em 0;
          font-size: 0.97em;
        }
        .pdf-export-body li { margin: 0.3em 0; }
        .pdf-export-body hr { border: none; border-top: 1px solid #e4e3de; margin: 1.5em 0; }
        .pdf-export-body table { 
          width: 100%; border-collapse: collapse; margin: 1em 0; font-size: 0.9em; 
          page-break-inside: avoid; break-inside: avoid;
        }
        .pdf-export-body th, .pdf-export-body td {
          padding: 8px 12px;
          border: 1px solid #e4e3de;
          text-align: left;
        }
        .pdf-export-body th { background: #f6f8fa; color: #1a1917; font-weight: 600; }
        .pdf-export-body td { color: #37352f; }
        .pdf-export-body img { max-width: 100%; page-break-inside: avoid; break-inside: avoid; }
        .pdf-export-body strong { color: #1a1917; font-weight: 600; }
        .pdf-export-body .task-list-item { list-style: none; margin-left: -1.5em; padding-left: 1.5em; }
        .pdf-export-body .task-list-item input[type="checkbox"] {
          width: 13px; height: 13px;
          margin-right: 8px;
          vertical-align: middle;
        }
        .pdf-export-body .hljs { background: #f6f8fa; }
        .page-break { page-break-before: always; }
      </style>
      <div class="pdf-export-body">${htmlContent}</div>
    `;
    document.body.appendChild(container);

    // 4. Wait for rendering to settle
    await new Promise((r) => setTimeout(r, 200));

    const pdfElement = container.querySelector(".pdf-export-body") as HTMLElement;

    try {
      // 5. Generate PDF blob (html2pdf's .save() is broken in Tauri – use .output() instead)
      const blob: Blob = await html2pdf()
        .set({
          margin: [12, 12, 12, 12],
          filename: `${fileName}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: "#ffffff",
            scrollX: 0,
            scrollY: 0,
          },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["avoid-all", "css", "legacy"] },
        } as any)
        .from(pdfElement)
        .output("blob");

      // 6. Convert blob → Uint8Array → plain number array for Tauri IPC
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = Array.from(new Uint8Array(arrayBuffer));

      // 7. Write to disk via Rust
      await invoke("write_binary_file", { path: savePath, data: bytes });
      log("PDF exported", savePath);
      
      // Open the exported PDF
      await openPath(savePath);
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      document.body.removeChild(container);
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
            <button className="welcome-btn primary" onClick={handleNewFile}>New file</button>
            <button className="welcome-btn" onClick={handleOpenFile}>Open file</button>
          </div>
        </div>
      );
    }
    switch (activeTab.mode) {
      case "view":  return <MarkdownPreview tab={activeTab} />;
      case "edit":  return <Editor tab={activeTab} />;
      case "split": return <SplitView tab={activeTab} />;
      default:      return <Editor tab={activeTab} />;
    }
  };

  return (
    <div className="app-container">
      <div className="toolbar">
        <div className="toolbar-actions">
          <button className="toolbar-btn" onClick={handleNewFile}><Icon.New /> New</button>
          <button className="toolbar-btn" onClick={handleOpenFile}><Icon.Open /> Open</button>
          <div className="toolbar-divider" />
          <button className="toolbar-btn" onClick={handleSaveFile}><Icon.Save /> Save</button>
          <button className="toolbar-btn" onClick={handleSaveAs}>Save as</button>
          <div className="toolbar-divider" />
          <button className="toolbar-btn" onClick={handleExportPDF}><Icon.Export /> Export PDF</button>
        </div>
        {activeTab && (
          <div className="mode-switcher">
            <button className={`mode-btn${activeTab.mode === "edit"  ? " active" : ""}`} onClick={() => handleModeChange("edit")}>Edit</button>
            <button className={`mode-btn${activeTab.mode === "split" ? " active" : ""}`} onClick={() => handleModeChange("split")}>Split</button>
            <button className={`mode-btn${activeTab.mode === "view"  ? " active" : ""}`} onClick={() => handleModeChange("view")}>Preview</button>
          </div>
        )}
      </div>

      <TabBar />
      <div className="content-area">{renderContent()}</div>

      {isDragging && (
        <div className="drag-overlay">
          <div className="drag-overlay-inner">Drop .md files to open</div>
        </div>
      )}
    </div>
  );
}

export default App;
