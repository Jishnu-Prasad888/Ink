/**
 * Smooth Ctrl/Cmd+wheel zoom for documents.
 *
 * Wheel events arrive in very different sizes: a mouse notch is ~100px, a
 * touchpad sends many 1-10px events. Zooming by the scrolled distance (rather
 * than a fixed step per event) makes both feel the same. While the wheel is
 * moving, zoom is written straight to the DOM once per frame; the tab store is
 * only updated once the wheel goes quiet, so React and the PDF renderer do not
 * re-render on every event.
 */

/** Marks the elements that display a tab's zoom (editor, preview, PDF page area). */
export const ZOOM_TAB_ATTR = "data-zoom-tab";
/** Dispatched (bubbling) from a zoomed element so dependents such as scroll sync can re-measure. */
export const DOCUMENT_ZOOM_EVENT = "ink:document-zoom";

export interface DocumentZoomDetail {
  /** The Split-mode pane kept steady under the pointer, which should lead scroll sync. */
  anchoredPane: "editor" | "preview" | null;
}

const LINE_HEIGHT_PX = 16;
const PAGE_HEIGHT_PX = 800;
const MAX_EVENT_DELTA_PX = 120;
/** Zoom change per pixel of wheel travel: one ~100px mouse notch is about 15%. */
const ZOOM_PER_PIXEL = 0.0014;

export const wheelDeltaPixels = (event: Pick<WheelEvent, "deltaY" | "deltaMode">) => {
  const scale = event.deltaMode === 1 ? LINE_HEIGHT_PX : event.deltaMode === 2 ? PAGE_HEIGHT_PX : 1;
  return event.deltaY * scale;
};

/** Multiplicative zoom factor for one wheel event (>1 zooms in). */
export const wheelZoomFactor = (event: Pick<WheelEvent, "deltaY" | "deltaMode">) => {
  const pixels = Math.max(
    -MAX_EVENT_DELTA_PX,
    Math.min(MAX_EVENT_DELTA_PX, wheelDeltaPixels(event)),
  );
  return Math.exp(-pixels * ZOOM_PER_PIXEL);
};

export const clampZoom = (zoom: number, isPdf: boolean) =>
  Math.max(isPdf ? 0.5 : 0.6, Math.min(isPdf ? 3 : 2, zoom));

export const roundZoom = (zoom: number) => Math.round(zoom * 100) / 100;

const containsPoint = (element: Element, x: number, y: number) => {
  const rect = element.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    x >= rect.left &&
    x <= rect.right &&
    y >= rect.top &&
    y <= rect.bottom
  );
};

/** Scroll element whose content scales with the zoom variable on `target`. */
const scrollerFor = (target: HTMLElement) =>
  target.querySelector<HTMLElement>(".cm-scroller") ?? target;

/**
 * Sets a Markdown tab's zoom on its editor and preview, keeping the content
 * under the pointer in place in whichever pane the pointer is over.
 */
export const applyDocumentZoom = (
  targets: HTMLElement[],
  previous: number,
  next: number,
  pointer: { x: number; y: number },
) => {
  const ratio = next / previous;
  const anchored = targets
    .map(scrollerFor)
    .filter((scroller) => containsPoint(scroller, pointer.x, pointer.y))
    .map((scroller) => ({
      scroller,
      offset: pointer.y - scroller.getBoundingClientRect().top,
      top: scroller.scrollTop,
    }));

  for (const target of targets) target.style.setProperty("--document-zoom", String(next));

  for (const { scroller, offset, top } of anchored) {
    scroller.scrollTop = (top + offset) * ratio - offset;
  }
  const anchoredPane = anchored[0]
    ? anchored[0].scroller.classList.contains("cm-scroller")
      ? "editor"
      : "preview"
    : null;
  targets[0]?.dispatchEvent(
    new CustomEvent<DocumentZoomDetail>(DOCUMENT_ZOOM_EVENT, {
      bubbles: true,
      detail: { anchoredPane },
    }),
  );
};

/**
 * Previews a PDF zoom by scaling the rendered page around `origin` (page-local
 * px). The page is re-rendered at full resolution once the zoom is committed.
 */
export const previewPdfZoom = (
  target: HTMLElement,
  scale: number,
  origin: { x: number; y: number },
) => {
  const page = target.querySelector<HTMLElement>(".react-pdf__Page");
  if (!page) return;
  page.style.transformOrigin = `${origin.x}px ${origin.y}px`;
  page.style.transform = scale === 1 ? "" : `scale(${scale})`;
};

export const pdfZoomOrigin = (target: HTMLElement, pointer: { x: number; y: number }) => {
  const page = target.querySelector<HTMLElement>(".react-pdf__Page");
  const rect = page?.getBoundingClientRect();
  return rect ? { x: pointer.x - rect.left, y: pointer.y - rect.top } : { x: 0, y: 0 };
};

/** After the PDF re-renders at the new zoom, scrolls so the point under the pointer stays put. */
export const anchorPdfScroll = (
  target: HTMLElement,
  before: { left: number; top: number },
  ratio: number,
  pointer: { x: number; y: number },
) => {
  const rect = target.getBoundingClientRect();
  const offsetX = pointer.x - rect.left;
  const offsetY = pointer.y - rect.top;
  target.scrollLeft = (before.left + offsetX) * ratio - offsetX;
  target.scrollTop = (before.top + offsetY) * ratio - offsetY;
};
