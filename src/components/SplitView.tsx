import React, { useCallback, useEffect, useRef, useState } from "react";
import { Editor } from "./Editor";
import { MarkdownPreview } from "./MarkdownPreview";
import { Tab } from "../store/tabStore";
import { useScrollSync } from "./useScrollSync";

interface SplitViewProps {
  tab: Tab;
  searchQuery?: string;
}

const SPLIT_STORAGE_KEY = "ink-split-ratio";
const DEFAULT_SPLIT = 50;
const MIN_PANE_PX = 160;
const STACKED_QUERY = "(max-width: 700px)";

const clampPct = (value: number) => Math.max(10, Math.min(90, value));

const readStoredSplit = () => {
  if (typeof localStorage === "undefined") return DEFAULT_SPLIT;
  const stored = Number(localStorage.getItem(SPLIT_STORAGE_KEY));
  return Number.isFinite(stored) && stored > 0 ? clampPct(stored) : DEFAULT_SPLIT;
};

const useStackedLayout = () => {
  const [stacked, setStacked] = useState(
    () => typeof window !== "undefined" && window.matchMedia(STACKED_QUERY).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(STACKED_QUERY);
    const onChange = () => setStacked(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return stacked;
};

export const SplitView: React.FC<SplitViewProps> = ({ tab, searchQuery = "" }) => {
  const mode = tab.mode === "view" || tab.mode === "split" ? tab.mode : "edit";
  const isSplit = mode === "split";
  const editorHidden = mode === "view";
  const previewHidden = mode === "edit";
  const containerRef = useRef<HTMLDivElement>(null);
  useScrollSync(containerRef, isSplit);

  const stacked = useStackedLayout();
  const [split, setSplit] = useState(readStoredSplit);
  const [dragging, setDragging] = useState(false);

  const commitSplit = useCallback((value: number) => {
    const next = clampPct(value);
    setSplit(next);
    localStorage.setItem(SPLIT_STORAGE_KEY, String(next));
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const total = stacked ? rect.height : rect.width;
    if (total <= 0) return;
    const offset = stacked ? event.clientY - rect.top : event.clientX - rect.left;
    const minPct = Math.min(50, (MIN_PANE_PX / total) * 100);
    setSplit(Math.max(minPct, Math.min(100 - minPct, (offset / total) * 100)));
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
    localStorage.setItem(SPLIT_STORAGE_KEY, String(split));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const decrease = stacked ? "ArrowUp" : "ArrowLeft";
    const increase = stacked ? "ArrowDown" : "ArrowRight";
    if (event.key === decrease || event.key === increase) {
      event.preventDefault();
      commitSplit(split + (event.key === decrease ? -2 : 2));
    } else if (event.key === "Home") {
      event.preventDefault();
      commitSplit(25);
    } else if (event.key === "End") {
      event.preventDefault();
      commitSplit(75);
    }
  };

  return (
    <div
      ref={containerRef}
      className="split-view"
      data-mode={mode}
      data-dragging={dragging || undefined}
      style={{ "--split": `${split}%` } as React.CSSProperties}
    >
      <div className="editor-pane" aria-hidden={editorHidden} inert={editorHidden || undefined}>
        <Editor tab={tab} searchQuery={searchQuery} />
      </div>
      <div className="preview-pane" aria-hidden={previewHidden} inert={previewHidden || undefined}>
        <MarkdownPreview
          tab={tab}
          isSplit={isSplit}
          searchQuery={searchQuery}
          showWidthToggle={!isSplit}
        />
      </div>
      {isSplit && (
        <div
          className="split-view-divider"
          role="separator"
          aria-label="Resize editor and preview"
          aria-orientation={stacked ? "horizontal" : "vertical"}
          aria-valuemin={10}
          aria-valuemax={90}
          aria-valuenow={Math.round(split)}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={() => commitSplit(DEFAULT_SPLIT)}
          onKeyDown={onKeyDown}
        />
      )}
    </div>
  );
};
