import React, { useEffect, useRef, useState } from "react";
import { renderMarkdown, renderMermaidDiagrams } from "../utils/markdown";
import { Tab, useTabStore } from "../store/tabStore";

interface MarkdownPreviewProps {
  tab: Tab;
  isSplit?: boolean;
}

const log = (msg: string, data?: any) => {
  if (import.meta.env.DEV) console.log(`[Preview:${msg}]`, data ?? "");
};

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
  tab,
  isSplit = false,
}) => {
  const [html, setHtml] = useState("");
  const previewRef = useRef<HTMLDivElement>(null);
  const updateTab = useTabStore((state) => state.updateTab);

  useEffect(() => {
    const render = async () => {
      log("render markdown", { length: tab.content.length });
      const rendered = await renderMarkdown(tab.content);
      setHtml(rendered);
    };
    render();
  }, [tab.content]);

  useEffect(() => {
    if (previewRef.current) {
      if (tab.previewScrollPosition) {
        log("restore scroll", tab.previewScrollPosition);
        previewRef.current.scrollTop = tab.previewScrollPosition;
      }

      renderMermaidDiagrams();

      const taskItems = previewRef.current.querySelectorAll(
        ".task-list-item input",
      );
      log("task items found", taskItems.length);
      taskItems.forEach((checkbox: any) => {
        checkbox.addEventListener("change", (e: any) => {
          const lineIndex = findLineIndexForTask(checkbox);
          if (lineIndex !== -1) {
            const lines = tab.content.split("\n");
            const currentLine = lines[lineIndex];
            const newLine = currentLine.replace(
              /- \[[ x]\]/,
              `- [${checkbox.checked ? "x" : " "}]`,
            );
            lines[lineIndex] = newLine;
            log("task toggled", { lineIndex, oldLine: currentLine, newLine });
            updateTab(tab.id, { content: lines.join("\n") });
          }
        });
      });
    }
  }, [html, tab.id]);

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

  const handleScroll = () => {
    if (previewRef.current) {
      log("preview scroll", previewRef.current.scrollTop);
      updateTab(tab.id, {
        previewScrollPosition: previewRef.current.scrollTop,
      });
    }
  };

  return (
    <div
      ref={previewRef}
      className="markdown-preview"
      style={{
        height: "100%",
        overflowY: "auto",
        padding: isSplit ? "20px" : "40px 20px",
      }}
      onScroll={handleScroll}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
