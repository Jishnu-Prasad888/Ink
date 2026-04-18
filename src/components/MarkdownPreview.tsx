import React, { useEffect, useRef, useState } from "react";
import { renderMarkdown, renderMermaidDiagrams } from "../utils/markdown";
import { Tab, useTabStore } from "../store/tabStore";
import { openUrl } from "@tauri-apps/plugin-opener";

interface MarkdownPreviewProps {
  tab: Tab;
  isSplit?: boolean;
  searchQuery?: string;
}

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
  tab,
  isSplit = false,
  searchQuery = "",
}) => {
  const [html, setHtml] = useState("");
  const [isFullWidth, setIsFullWidth] = useState(false);

  const previewRef = useRef<HTMLDivElement>(null);
  const updateTab = useTabStore((state) => state.updateTab);

  const didRestoreScroll = useRef(false);
  const initialScrollPos = useRef(tab.previewScrollPosition ?? 0);

  useEffect(() => {
    const render = async () => {
      const rendered = await renderMarkdown(tab.content);
      setHtml(rendered);
    };
    render();
  }, [tab.content]);

  useEffect(() => {
    if (!previewRef.current) return;

    if (!didRestoreScroll.current) {
      didRestoreScroll.current = true;
      if (initialScrollPos.current > 0) {
        previewRef.current.scrollTop = initialScrollPos.current;
      }
    }

    renderMermaidDiagrams();

    const taskItems = previewRef.current.querySelectorAll(
      ".task-list-item input",
    );
    taskItems.forEach((checkbox: any) => {
      checkbox.addEventListener("change", () => {
        const lineIndex = findLineIndexForTask(checkbox);
        if (lineIndex !== -1) {
          const lines = tab.content.split("\n");
          const currentLine = lines[lineIndex];
          const newLine = currentLine.replace(
            /- \[[ x]\]/,
            `- [${checkbox.checked ? "x" : " "}]`,
          );
          lines[lineIndex] = newLine;
          updateTab(tab.id, { content: lines.join("\n") });
        }
      });
    });
  }, [html, tab.id]);

  useEffect(() => {
    return () => {
      if (previewRef.current) {
        updateTab(tab.id, {
          previewScrollPosition: previewRef.current.scrollTop,
        });
      }
    };
  }, [tab.id]);

  const findLineIndexForTask = (checkbox: any): number => {
    const items = previewRef.current?.querySelectorAll(".task-list-item");
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].contains(checkbox)) {
          const text = items[i].textContent || "";
          const lines = tab.content.split("\n");
          return lines.findIndex((line) => line.includes(text.trim()));
        }
      }
    }
    return -1;
  };

  useEffect(() => {
    if (!previewRef.current || !searchQuery.trim()) return;

    const walker = document.createTreeWalker(
      previewRef.current,
      NodeFilter.SHOW_TEXT,
      null,
    );

    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      const idx =
        node.textContent?.toLowerCase().indexOf(searchQuery.toLowerCase()) ??
        -1;

      if (idx !== -1) {
        (node.parentElement as HTMLElement)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        break;
      }
    }
  }, [searchQuery, html]);

  useEffect(() => {
    if (!previewRef.current) return;

    const links = previewRef.current.querySelectorAll("a");
    links.forEach((link) => {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      // Remove any previous event listeners to avoid stacking
      link.onclick = (e) => {
        e.preventDefault();
        openUrl(link.href);
      };
    });
  }, [html]);

  return (
    <div style={{ position: "relative", height: "100%" }}>
      {/* Floating Toggle */}
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 16,
          zIndex: 10,
        }}
      >
        <button
          onClick={() => setIsFullWidth((prev) => !prev)}
          style={{
            padding: "6px 10px",
            fontSize: "12px",
            borderRadius: "6px",
            border: "1px solid #ccc",
            background: "#fff",
            cursor: "pointer",
            boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
          }}
        >
          {isFullWidth ? "Readable Width" : "Full Width"}
        </button>
      </div>

      {/* Preview */}
      <div
        ref={previewRef}
        className="markdown-preview"
        style={{
          height: "100%",
          overflowY: "auto",
          padding: isSplit ? "24px 28px" : "40px 48px",
          width: "100%",
          maxWidth: isFullWidth ? "none" : "740px",
          margin: isFullWidth ? "0" : "0 auto",
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
};
