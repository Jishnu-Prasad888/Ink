import React, { useEffect, useRef, useState } from "react";
import { renderMarkdown, renderMermaidDiagrams } from "../utils/markdown";
import { Tab, useTabStore } from "../store/tabStore";

interface MarkdownPreviewProps {
  tab: Tab;
  isSplit?: boolean;
  searchQuery?: string;
}

const log = (msg: string, data?: any) => {
  if (import.meta.env.DEV) console.log(`[Preview:${msg}]`, data ?? "");
};

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
  tab,
  isSplit = false,
  searchQuery = "",
}) => {
  const [html, setHtml] = useState("");
  const previewRef = useRef<HTMLDivElement>(null);
  const updateTab = useTabStore((state) => state.updateTab);

  // We ONLY restore scroll once after first paint, never write back on every
  // scroll event. Writing back every scroll → triggers store update → re-render
  // → useEffect runs → sets scrollTop again → infinite loop.
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

    // Restore scroll position only on the very first render after mount.
    if (!didRestoreScroll.current) {
      didRestoreScroll.current = true;
      if (initialScrollPos.current > 0) {
        previewRef.current.scrollTop = initialScrollPos.current;
      }
    }

    renderMermaidDiagrams();

    const taskItems = previewRef.current.querySelectorAll(".task-list-item input");
    taskItems.forEach((checkbox: any) => {
      checkbox.addEventListener("change", () => {
        const lineIndex = findLineIndexForTask(checkbox);
        if (lineIndex !== -1) {
          const lines = tab.content.split("\n");
          const currentLine = lines[lineIndex];
          const newLine = currentLine.replace(
            /- \[[ x]\]/,
            `- [${checkbox.checked ? "x" : " "}]`
          );
          lines[lineIndex] = newLine;
          updateTab(tab.id, { content: lines.join("\n") });
        }
      });
    });
  }, [html, tab.id]);

  // Save scroll position to the store only when this tab unmounts (tab switch /
  // close), so it can be restored next time the tab is shown.
  useEffect(() => {
    return () => {
      if (previewRef.current) {
        updateTab(tab.id, { previewScrollPosition: previewRef.current.scrollTop });
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

  // Scroll to first search match whenever the query changes.
  useEffect(() => {
    if (!previewRef.current || !searchQuery.trim()) return;
    const walker = document.createTreeWalker(
      previewRef.current,
      NodeFilter.SHOW_TEXT,
      null
    );
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      const idx =
        node.textContent?.toLowerCase().indexOf(searchQuery.toLowerCase()) ?? -1;
      if (idx !== -1) {
        (node.parentElement as HTMLElement)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        break;
      }
    }
  }, [searchQuery, html]);

  return (
    <div
      ref={previewRef}
      className="markdown-preview"
      style={{
        height: "100%",
        overflowY: "auto",
        padding: isSplit ? "24px 28px" : "40px 48px",
        maxWidth: isSplit ? "none" : "740px",
        margin: isSplit ? "0" : "0 auto",
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
