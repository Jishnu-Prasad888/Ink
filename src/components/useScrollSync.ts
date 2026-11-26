import { useEffect, type RefObject } from "react";
import { EditorView } from "@codemirror/view";
import { SOURCE_LINE_ATTR } from "../utils/markdown";
import {
  lineToPreviewTop,
  normalizeAnchors,
  previewTopToLine,
  type ScrollAnchor,
} from "../utils/scrollSync";
import { DOCUMENT_ZOOM_EVENT, type DocumentZoomDetail } from "../utils/wheelZoom";

/** A programmatic scroll lands within this many px of its target. */
const ECHO_TOLERANCE_PX = 2;

const isAtBottom = (el: HTMLElement) => el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
const maxScroll = (el: HTMLElement) => Math.max(0, el.scrollHeight - el.clientHeight);

/**
 * Keeps the editor and preview scrolled to the same place in the document
 * while both are visible. Whichever pane the user scrolls drives the other.
 */
export const useScrollSync = (containerRef: RefObject<HTMLElement | null>, enabled: boolean) => {
  useEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container) return;

    let view: EditorView | null = null;
    let preview: HTMLElement | null = null;
    let anchors: ScrollAnchor[] | null = null;
    let frame = 0;
    let pending: "editor" | "preview" | null = null;
    // The scrollTop we last set on each pane, so its echo scroll event is ignored.
    const expected = { editor: -1, preview: -1 };
    // The pane the user last scrolled; a preview re-render re-syncs from it.
    let leader: "editor" | "preview" = "editor";

    const resolve = () => {
      const editorEl = container.querySelector<HTMLElement>(".editor-pane .cm-editor");
      view = editorEl ? EditorView.findFromDOM(editorEl) : null;
      preview = container.querySelector<HTMLElement>(".preview-pane .markdown-preview");
      return Boolean(view && preview);
    };

    const getAnchors = () => {
      if (anchors || !preview) return anchors ?? [];
      const originTop = preview.getBoundingClientRect().top - preview.scrollTop;
      const raw: ScrollAnchor[] = [];
      preview.querySelectorAll<HTMLElement>(`[${SOURCE_LINE_ATTR}]`).forEach((el) => {
        const line = Number(el.getAttribute(SOURCE_LINE_ATTR));
        if (Number.isFinite(line))
          raw.push({ line, top: el.getBoundingClientRect().top - originTop });
      });
      anchors = normalizeAnchors(raw);
      return anchors;
    };

    /** Pixels of the editor's document scrolled above the viewport → fractional 0-based line. */
    const editorTopLine = (v: EditorView) => {
      const height = v.scrollDOM.getBoundingClientRect().top - v.documentTop;
      if (height <= 0) return 0;
      const block = v.lineBlockAtHeight(height);
      const line = v.state.doc.lineAt(block.from).number - 1;
      const fraction = block.height > 0 ? (height - block.top) / block.height : 0;
      return line + Math.min(Math.max(fraction, 0), 1);
    };

    const setScroll = (pane: "editor" | "preview", el: HTMLElement, top: number) => {
      const clamped = Math.round(Math.min(Math.max(top, 0), maxScroll(el)));
      if (Math.abs(el.scrollTop - clamped) < 1) return;
      expected[pane] = clamped;
      el.scrollTop = clamped;
    };

    const syncPreviewFromEditor = () => {
      if (!view || !preview) return;
      const scroller = view.scrollDOM;
      if (scroller.scrollTop <= 0) return setScroll("preview", preview, 0);
      if (isAtBottom(scroller)) return setScroll("preview", preview, maxScroll(preview));
      const totalLines = view.state.doc.lines;
      const top = lineToPreviewTop(
        getAnchors(),
        editorTopLine(view),
        totalLines,
        preview.scrollHeight,
      );
      setScroll("preview", preview, top);
    };

    const syncEditorFromPreview = () => {
      if (!view || !preview) return;
      const scroller = view.scrollDOM;
      if (preview.scrollTop <= 0) return setScroll("editor", scroller, 0);
      if (isAtBottom(preview)) return setScroll("editor", scroller, maxScroll(scroller));
      const doc = view.state.doc;
      const line = previewTopToLine(
        getAnchors(),
        preview.scrollTop,
        doc.lines,
        preview.scrollHeight,
      );
      const lineNumber = Math.min(Math.max(Math.floor(line) + 1, 1), doc.lines);
      const block = view.lineBlockAt(doc.line(lineNumber).from);
      const fraction = line - Math.floor(line);
      const docOffset =
        view.documentTop - scroller.getBoundingClientRect().top + scroller.scrollTop;
      setScroll("editor", scroller, docOffset + block.top + fraction * block.height);
    };

    const schedule = (source: "editor" | "preview") => {
      pending = source;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const from = pending;
        pending = null;
        if (from === "editor") syncPreviewFromEditor();
        else if (from === "preview") syncEditorFromPreview();
      });
    };

    const onScroll = (pane: "editor" | "preview") => (event: Event) => {
      const el = event.currentTarget as HTMLElement;
      if (expected[pane] >= 0 && Math.abs(el.scrollTop - expected[pane]) <= ECHO_TOLERANCE_PX) {
        expected[pane] = -1;
        return;
      }
      expected[pane] = -1;
      leader = pane;
      schedule(pane);
    };
    const onEditorScroll = onScroll("editor");
    const onPreviewScroll = onScroll("preview");

    // Layout changes (re-render, Mermaid diagrams, images, resizing) move the anchors.
    const invalidate = () => {
      anchors = null;
      schedule(leader);
    };
    // Zooming rescales the preview's content without resizing the preview itself.
    const onZoom = (event: Event) => {
      const { anchoredPane } = (event as CustomEvent<DocumentZoomDetail>).detail;
      if (anchoredPane) leader = anchoredPane;
      invalidate();
    };
    const mutationObserver = new MutationObserver(invalidate);
    const resizeObserver = new ResizeObserver(invalidate);

    let attached = false;
    let retry = 0;
    const attach = () => {
      if (!resolve()) {
        retry = requestAnimationFrame(attach);
        return;
      }
      attached = true;
      view!.scrollDOM.addEventListener("scroll", onEditorScroll, { passive: true });
      preview!.addEventListener("scroll", onPreviewScroll, { passive: true });
      preview!.addEventListener("load", invalidate, true); // images finishing load
      mutationObserver.observe(preview!, { childList: true, subtree: true });
      resizeObserver.observe(preview!);
      resizeObserver.observe(view!.scrollDOM);
      container.addEventListener(DOCUMENT_ZOOM_EVENT, onZoom);
      schedule("editor");
    };
    attach();

    return () => {
      cancelAnimationFrame(retry);
      cancelAnimationFrame(frame);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      if (attached) {
        view?.scrollDOM.removeEventListener("scroll", onEditorScroll);
        preview?.removeEventListener("scroll", onPreviewScroll);
        preview?.removeEventListener("load", invalidate, true);
        container.removeEventListener(DOCUMENT_ZOOM_EVENT, onZoom);
      }
    };
  }, [containerRef, enabled]);
};
