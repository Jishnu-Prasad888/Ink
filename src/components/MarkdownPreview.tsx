import React, { useEffect, useRef, useState } from "react";
import { renderMarkdown, renderMermaidDiagrams } from "../utils/markdown";
import { Tab, useTabStore } from "../store/tabStore";
import { useSettingsStore } from "../store/settingsStore";
import { openUrl } from "@tauri-apps/plugin-opener";

const RENDER_DEBOUNCE_MS = 120;

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
  const theme = useSettingsStore((state) => state.theme);
  const updateTab = useTabStore((state) => state.updateTab);
  const saveTabContent = useTabStore((state) => state.saveTabContent);

  const didRestoreScroll = useRef(false);
  const initialScrollPos = useRef(tab.previewScrollPosition ?? 0);

  const hasRendered = useRef(false);

  // Render immediately on first paint, then debounce while the user is typing
  // so large documents don't re-parse on every keystroke.
  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      const rendered = await renderMarkdown(tab.content || "");
      if (!cancelled) {
        hasRendered.current = true;
        setHtml(rendered);
      }
    };
    if (!hasRendered.current) {
      render();
      return () => {
        cancelled = true;
      };
    }
    const timer = window.setTimeout(render, RENDER_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [tab.content]);

  useEffect(() => {
    if (!previewRef.current) return;

    if (!didRestoreScroll.current && html) {
      didRestoreScroll.current = true;
      if (initialScrollPos.current > 0) {
        previewRef.current.scrollTop = initialScrollPos.current;
      }
    }

    // Wait a frame so a theme change has reached the document's CSS variables,
    // which App applies in an effect that runs after this one.
    const preview = previewRef.current;
    const frame = requestAnimationFrame(() => {
      renderMermaidDiagrams(preview).catch((error) => {
        console.error("Failed to render Mermaid diagram", error);
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [html, theme]);

  // One delegated listener for task checkboxes instead of one per checkbox per render.
  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;
    const handleChange = (event: Event) => {
      const checkbox = event.target as HTMLInputElement;
      if (!checkbox.matches(".task-list-item input")) return;
      const taskIndex = Array.from(preview.querySelectorAll(".task-list-item input")).indexOf(
        checkbox,
      );
      const lines = (useTabStore.getState().tabs.find((t) => t.id === tab.id)?.content || "").split(
        "\n",
      );
      const taskLines = lines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => /^\s*[-+*]\s+\[[ xX]\]/.test(line));
      const lineIndex = taskLines[taskIndex]?.index ?? -1;
      if (lineIndex === -1) return;
      lines[lineIndex] = lines[lineIndex].replace(/\[[ xX]\]/, `[${checkbox.checked ? "x" : " "}]`);
      saveTabContent(tab.id, lines.join("\n"));
    };
    preview.addEventListener("change", handleChange);
    return () => preview.removeEventListener("change", handleChange);
  }, [saveTabContent, tab.id]);

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
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, Math.min(idx + searchQuery.length, node.textContent?.length ?? idx));
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
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
  }, []);

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

      <div
        ref={previewRef}
        className={`markdown-preview${isFullWidth ? " markdown-preview--full" : " markdown-preview--readable"}${isSplit ? " markdown-preview--split" : ""}`}
        style={
          {
            "--document-zoom": tab.documentZoom ?? 1,
          } as React.CSSProperties
        }
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
};
