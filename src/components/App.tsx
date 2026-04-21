import { useEffect, useRef, useState } from "react";
import { TabBar } from "./TabBar";
import { Editor } from "./Editor";
import { MarkdownPreview } from "./MarkdownPreview";
import { SplitView } from "./SplitView";
import { useTabStore } from "../store/tabStore";
import { useSingleInstance } from "../hooks/useSingleInstance";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

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
  Find: () => (
    <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M9.5 9.5L12.5 12.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  ),
  Close: () => (
    <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3 3l8 8M11 3l-8 8"
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
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const findInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null); // 🧱 1. Add a preview ref
  const activeTab = tabs.find((t) => t.id === activeTabId);

  useSingleInstance();

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = async (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;

      if (e.key === "s" && e.shiftKey) {
        // Ctrl+Shift+S → Save As
        e.preventDefault();
        await handleSaveAs();
        return;
      }
      if (e.key === "s") {
        // Ctrl+S → Save
        e.preventDefault();
        await handleSaveFile();
        return;
      }
      if (e.key === "o") {
        // Ctrl+O → Open
        e.preventDefault();
        await handleOpenFile();
        return;
      }
      if (e.key === "f") {
        // Ctrl+F → Find
        e.preventDefault();
        setFindOpen(true);
        setTimeout(() => findInputRef.current?.focus(), 50);
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTabId]); // re-bind when active tab changes so handlers capture fresh state

  // Close find bar on Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && findOpen) {
        setFindOpen(false);
        setFindQuery("");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [findOpen]);

  // ── Drag-and-drop ───────────────────────────────────────────────────────────
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

  // ── Tauri file-open event ───────────────────────────────────────────────────
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

  // ── File handlers ───────────────────────────────────────────────────────────
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
    const freshTab = useTabStore
      .getState()
      .tabs.find((t) => t.id === useTabStore.getState().activeTabId);
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
          type: "markdown",
        });
      }
    }
  };

  const handleSaveAs = async () => {
    const freshTab = useTabStore
      .getState()
      .tabs.find((t) => t.id === useTabStore.getState().activeTabId);
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

  const handleExportPDF = async () => {
    if (!previewRef.current || !activeTab) return;

    const element = previewRef.current;

    // Wait for fonts + layout stabilization
    await document.fonts.ready;
    await new Promise((r) => setTimeout(r, 300));

    const pdf = new jsPDF("p", "mm", "a4");

    const pageWidth = 210;

    const scale = 2; // high quality scaling

    const clone = element.cloneNode(true) as HTMLElement;
    clone.style.width = element.scrollWidth + "px";
    clone.style.background = "white";
    clone.style.position = "absolute";
    clone.style.left = "-99999px";
    document.body.appendChild(clone);

    // ✨ 5. Syntax highlighting (preserved)
    clone.querySelectorAll("pre code").forEach((block) => {
      (block as HTMLElement).style.whiteSpace = "pre-wrap";
    });

    const totalHeight = clone.scrollHeight;

    let currentY = 0;
    let pageIndex = 0;

    // 🧠 4. Real page-break detection (smart improvement)
    const findNextBreak = (container: HTMLElement, startY: number) => {
      const breaks = container.querySelectorAll(".page-break");
      for (const el of breaks) {
        const rect = (el as HTMLElement).offsetTop;
        if (rect > startY + 200 && rect < startY + 1200) {
          return rect;
        }
      }
      return null;
    };

    while (currentY < totalHeight) {
      const nextBreak = findNextBreak(clone, currentY);
      const sliceHeight = nextBreak
        ? nextBreak - currentY
        : clone.scrollWidth * 1.414; // approx A4 ratio

      const canvas = await html2canvas(clone, {
        scale,
        useCORS: true,
        backgroundColor: "#ffffff",
        x: 0,
        y: currentY,
        width: clone.scrollWidth,
        height: Math.min(clone.scrollHeight - currentY, sliceHeight),
      });

      const imgData = canvas.toDataURL("image/png");

      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      if (pageIndex > 0) pdf.addPage();

      pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);

      currentY += canvas.height / scale;
      pageIndex++;
    }

    document.body.removeChild(clone);

    pdf.save((activeTab?.fileName || "document") + ".pdf");
  };

  const handleModeChange = (mode: "view" | "edit" | "split") => {
    if (activeTab) updateTab(activeTab.id, { mode });
  };

  const handleOpenFind = () => {
    setFindOpen(true);
    setTimeout(() => findInputRef.current?.focus(), 50);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
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
    switch (activeTab.mode) {
      case "view":
        return <MarkdownPreview tab={activeTab} searchQuery={findQuery} />;
      case "edit":
        return <Editor tab={activeTab} searchQuery={findQuery} />;
      case "split":
        return <SplitView tab={activeTab} searchQuery={findQuery} />;
      default:
        return <Editor tab={activeTab} searchQuery={findQuery} />;
    }
  };

  return (
    <div className="app-container">
      <div className="toolbar">
        <div className="toolbar-actions">
          <button className="toolbar-btn" onClick={handleNewFile}>
            <Icon.New /> New
          </button>
          <button
            className="toolbar-btn"
            onClick={handleOpenFile}
            title="Open (Ctrl+O)"
          >
            <Icon.Open /> Open
          </button>
          <button
            className="toolbar-btn"
            onClick={handleOpenFind}
            title="Find (Ctrl+F)"
          >
            <Icon.Find /> Find
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
          <div className="toolbar-divider" />
          <button className="toolbar-btn" onClick={handleExportPDF}>
            <Icon.Export /> Export PDF
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

      {/* Find bar */}
      {findOpen && (
        <div className="find-bar">
          <Icon.Find />
          <input
            ref={findInputRef}
            className="find-input"
            placeholder="Find in document…"
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setFindOpen(false);
                setFindQuery("");
              }
            }}
          />
          {findQuery && (
            <span
              className="find-clear"
              onClick={() => setFindQuery("")}
              title="Clear"
            >
              <Icon.Close />
            </span>
          )}
          <button
            className="find-close"
            onClick={() => {
              setFindOpen(false);
              setFindQuery("");
            }}
            title="Close (Esc)"
          >
            <Icon.Close />
          </button>
        </div>
      )}

      <TabBar />
      {/* 🧱 1. Wrap preview in ref */}
      <div className="content-area">
        {activeTab ? (
          <div ref={previewRef} className="pdf-target">
            <MarkdownPreview tab={activeTab} searchQuery={findQuery} />
          </div>
        ) : (
          renderContent()
        )}
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
