import React, { useEffect, useRef, useState } from "react";
import { renderMarkdown, renderMermaidDiagrams } from "../utils/markdown";
import { Tab, useTabStore } from "../store/tabStore";
import { openUrl } from "@tauri-apps/plugin-opener";

interface MarkdownPreviewProps {
  tab: Tab;
  isSplit?: boolean;
  searchQuery?: string;
  widthMode?: "readable" | "full";
  onWidthModeChange?: (mode: "readable" | "full") => void;
  showWidthToggle?: boolean;
}

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
  tab,
  isSplit = false,
  searchQuery = "",
  widthMode,
  onWidthModeChange,
  showWidthToggle = true,
}) => {
  const [html, setHtml] = useState("");
  const [localWidthMode, setLocalWidthMode] = useState<"readable" | "full">("readable");
  const resolvedWidthMode = widthMode ?? localWidthMode;
  const isFullWidth = resolvedWidthMode === "full";

  const previewRef = useRef<HTMLDivElement>(null);
  const updateTab = useTabStore((state) => state.updateTab);
  const saveTabContent = useTabStore((state) => state.saveTabContent);

  const didRestoreScroll = useRef(false);
  const initialScrollPos = useRef(tab.previewScrollPosition ?? 0);

  useEffect(() => {
    const render = async () => {
      const rendered = await renderMarkdown(tab.content || "");
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

    renderMermaidDiagrams(previewRef.current).catch((error) => {
      console.error("Failed to render Mermaid diagram", error);
    });

    const taskItems = previewRef.current.querySelectorAll(".task-list-item input");
    taskItems.forEach((checkbox, taskIndex) => {
      checkbox.addEventListener("change", () => {
        const lines = (tab.content || "").split("\n");
        const taskLines = lines
          .map((line, index) => ({ line, index }))
          .filter(({ line }) => /^\s*[-+*]\s+\[[ xX]\]/.test(line));
        const lineIndex = taskLines[taskIndex]?.index ?? -1;
        if (lineIndex !== -1) {
          const currentLine = lines[lineIndex];
          const newLine = currentLine.replace(
            /\[[ xX]\]/,
            `[${(checkbox as HTMLInputElement).checked ? "x" : " "}]`,
          );
          lines[lineIndex] = newLine;
          saveTabContent(tab.id, lines.join("\n"));
        }
      });
    });
  }, [html, saveTabContent, tab.content, tab.id]);

  useEffect(() => {
    const preview = previewRef.current;
    return () => {
      if (preview) {
        updateTab(tab.id, {
          previewScrollPosition: preview.scrollTop,
        });
      }
    };
  }, [tab.id, updateTab]);

  useEffect(() => {
    if (!previewRef.current || !searchQuery.trim()) return;

    const walker = document.createTreeWalker(previewRef.current, NodeFilter.SHOW_TEXT, null);

    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      const idx = node.textContent?.toLowerCase().indexOf(searchQuery.toLowerCase()) ?? -1;

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

    const preview = previewRef.current;
    const handleClick = (event: MouseEvent) => {
      const link = (event.target as Element).closest<HTMLAnchorElement>("a");
      if (!link || !preview.contains(link)) return;

      const href = link.getAttribute("href");
      if (!href) return;

      if (href.startsWith("#")) {
        event.preventDefault();
        const target = preview.querySelector<HTMLElement>(`#${CSS.escape(href.slice(1))}`);
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      if (href.startsWith("https://") || href.startsWith("http://")) {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        event.preventDefault();
        openUrl(href).catch((error) => {
          console.error("Failed to open link", error);
        });
      }
    };

    preview.addEventListener("click", handleClick);
    return () => preview.removeEventListener("click", handleClick);
  }, [html]);

  return (
    <div className="preview-container">
      {showWidthToggle && (
        <div className="preview-toolbar">
          <button
            className="preview-width-toggle"
            onClick={() => {
              const nextMode = isFullWidth ? "readable" : "full";
              setLocalWidthMode(nextMode);
              onWidthModeChange?.(nextMode);
            }}
            aria-pressed={isFullWidth}
          >
            {isFullWidth ? "Readable Width" : "Full Width"}
          </button>
        </div>
      )}

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
