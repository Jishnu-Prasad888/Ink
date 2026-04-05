import React, { useEffect, useRef, useState } from "react";
import { renderMarkdown, renderMermaidDiagrams } from "../utils/markdown";
import { Tab, useTabStore } from "../store/tabStore";

interface MarkdownPreviewProps {
  tab: Tab;
  isSplit?: boolean;
}

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
  tab,
  isSplit = false,
}) => {
  const [html, setHtml] = useState("");
  const previewRef = useRef<HTMLDivElement>(null);
  const updateTab = useTabStore((state) => state.updateTab);

  useEffect(() => {
    const render = async () => {
      const rendered = await renderMarkdown(tab.content);
      setHtml(rendered);
    };
    render();
  }, [tab.content]);

  useEffect(() => {
    if (previewRef.current) {
      // Restore scroll position
      if (tab.previewScrollPosition) {
        previewRef.current.scrollTop = tab.previewScrollPosition;
      }

      // Render mermaid diagrams
      renderMermaidDiagrams();

      // Add task list toggle functionality
      const taskItems = previewRef.current.querySelectorAll(
        ".task-list-item input",
      );
      taskItems.forEach((checkbox: any) => {
        checkbox.addEventListener("change", (e: any) => {
          // Update markdown content to reflect checkbox state
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
    }
  }, [html, tab.id]);

  const findLineIndexForTask = (checkbox: any): number => {
    // Find the line containing this task checkbox
    const items = previewRef.current?.querySelectorAll(".task-list-item");
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].contains(checkbox)) {
          // Find corresponding line in markdown
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
