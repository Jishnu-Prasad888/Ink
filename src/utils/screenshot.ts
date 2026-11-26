import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeImage } from "@tauri-apps/plugin-clipboard-manager";

export interface CaptureRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Screenshot {
  bytes: Uint8Array;
  url: string; // object URL for previewing; release with URL.revokeObjectURL
  width: number;
  height: number;
}

export type ScreenshotMode = "area" | "window";

export const SCREENSHOT_REQUEST_EVENT = "ink:screenshot";

/** Starts a screenshot from anywhere: the shortcut, the context menu or the command palette. */
export const requestScreenshot = (mode: ScreenshotMode) => {
  window.dispatchEvent(new CustomEvent<ScreenshotMode>(SCREENSHOT_REQUEST_EVENT, { detail: mode }));
};

/** Elements carrying this attribute (the screenshot UI itself) are left out of captures. */
export const SCREENSHOT_EXCLUDE_ATTR = "data-screenshot-exclude";
const SCROLL_ATTR = "data-screenshot-scroll";

/**
 * The DOM is cloned for rendering, and clones lose their scroll offsets. Record
 * each scrolled element's offset as an attribute (attributes survive cloning)
 * so the clone can be shifted to show what is actually on screen.
 */
const markScrolledElements = () => {
  const marked: Element[] = [];
  for (const element of document.body.querySelectorAll("*")) {
    if (element.scrollTop || element.scrollLeft) {
      element.setAttribute(SCROLL_ATTR, `${element.scrollLeft},${element.scrollTop}`);
      marked.push(element);
    }
  }
  return () => marked.forEach((element) => element.removeAttribute(SCROLL_ATTR));
};

const applyScrollOffsets = (clonedRoot: Node) => {
  if (!(clonedRoot instanceof Element)) return;
  const scrolled = [
    ...(clonedRoot.hasAttribute(SCROLL_ATTR) ? [clonedRoot] : []),
    ...clonedRoot.querySelectorAll(`[${SCROLL_ATTR}]`),
  ];
  for (const element of scrolled) {
    const [left, top] = (element.getAttribute(SCROLL_ATTR) ?? "0,0").split(",").map(Number);
    element.removeAttribute(SCROLL_ATTR);
    if (element instanceof HTMLElement) element.style.overflow = "hidden";
    for (const child of element.children) {
      if (child instanceof HTMLElement || child instanceof SVGElement) {
        child.style.translate = `${-left}px ${-top}px`;
      }
    }
  }
};

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

/** Waits until menus and the selection overlay have actually left the screen. */
export const waitForRepaint = async () => {
  await nextFrame();
  await nextFrame();
};

const canvasToPng = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode PNG"))),
      "image/png",
    ),
  );

/** Renders the app window, or the given part of it (in CSS pixels), to a PNG. */
export const captureWindow = async (rect?: CaptureRect): Promise<Screenshot> => {
  const { domToCanvas } = await import("modern-screenshot");
  const scale = window.devicePixelRatio || 1;
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const background = getComputedStyle(document.body).backgroundColor;

  const unmark = markScrolledElements();
  let full: HTMLCanvasElement;
  try {
    full = await domToCanvas(document.body, {
      width: viewport.width,
      height: viewport.height,
      scale,
      backgroundColor: background,
      // The cloned body falls back to the browser's default 8px margin.
      style: { margin: "0" },
      filter: (node) => !(node instanceof Element && node.hasAttribute(SCREENSHOT_EXCLUDE_ATTR)),
      onCloneNode: applyScrollOffsets,
    });
  } finally {
    unmark();
  }

  const area = rect ?? { x: 0, y: 0, ...viewport };
  const width = Math.max(1, Math.round(area.width * scale));
  const height = Math.max(1, Math.round(area.height * scale));
  const cropped = document.createElement("canvas");
  cropped.width = width;
  cropped.height = height;
  cropped
    .getContext("2d")!
    .drawImage(
      full,
      Math.round(area.x * scale),
      Math.round(area.y * scale),
      width,
      height,
      0,
      0,
      width,
      height,
    );

  const blob = await canvasToPng(cropped);
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    url: URL.createObjectURL(blob),
    width,
    height,
  };
};

export const copyScreenshot = (shot: Screenshot) => writeImage(shot.bytes);

const pad = (value: number) => String(value).padStart(2, "0");

export const defaultScreenshotName = (date = new Date()) =>
  `Ink Screenshot ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
  `at ${pad(date.getHours())}.${pad(date.getMinutes())}.${pad(date.getSeconds())}.png`;

/** Asks where to save and writes the PNG. Returns the path, or null if cancelled. */
export const saveScreenshot = async (shot: Screenshot) => {
  const chosen = await save({
    title: "Save screenshot",
    defaultPath: defaultScreenshotName(),
    filters: [{ name: "PNG Image", extensions: ["png"] }],
  });
  if (!chosen) return null;
  const path = /\.png$/i.test(chosen) ? chosen : `${chosen}.png`;
  await invoke("write_binary_file", { path, data: Array.from(shot.bytes) });
  return path;
};
