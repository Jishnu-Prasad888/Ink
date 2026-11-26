import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  CaptureRect,
  Screenshot,
  SCREENSHOT_EXCLUDE_ATTR,
  SCREENSHOT_REQUEST_EVENT,
  ScreenshotMode,
  captureWindow,
  copyScreenshot,
  saveScreenshot,
  waitForRepaint,
} from "../utils/screenshot";

const MIN_DRAG_PX = 4;

type Phase =
  | { kind: "idle" }
  | { kind: "selecting" }
  | { kind: "capturing" }
  | { kind: "result"; shot: Screenshot };

const normalise = (a: { x: number; y: number }, b: { x: number; y: number }): CaptureRect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(a.x - b.x),
  height: Math.abs(a.y - b.y),
});

interface ScreenshotToolProps {
  onMessage: (message: string) => void;
}

export const ScreenshotTool: React.FC<ScreenshotToolProps> = ({ onMessage }) => {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<CaptureRect | null>(null);
  const [busy, setBusy] = useState<"copy" | "save" | null>(null);
  const [copied, setCopied] = useState(false);
  const phaseRef = useRef(phase);
  const copyButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const close = useCallback(() => {
    setPhase((current) => {
      if (current.kind === "result") URL.revokeObjectURL(current.shot.url);
      return { kind: "idle" };
    });
    setDragStart(null);
    setDragRect(null);
    setCopied(false);
  }, []);

  const capture = useCallback(
    async (rect?: CaptureRect) => {
      setPhase({ kind: "capturing" });
      setDragStart(null);
      setDragRect(null);
      try {
        await waitForRepaint();
        const shot = await captureWindow(rect);
        setCopied(false);
        setPhase({ kind: "result", shot });
      } catch (error) {
        console.error("Screenshot failed", error);
        onMessage("Could not take a screenshot");
        setPhase({ kind: "idle" });
      }
    },
    [onMessage],
  );

  useEffect(() => {
    const onRequest = (event: Event) => {
      const mode = (event as CustomEvent<ScreenshotMode>).detail;
      const current = phaseRef.current;
      if (current.kind === "capturing") return;
      if (current.kind === "result") URL.revokeObjectURL(current.shot.url);
      if (mode === "window") {
        void capture();
      } else {
        setPhase({ kind: "selecting" });
      }
    };
    window.addEventListener(SCREENSHOT_REQUEST_EVENT, onRequest);
    return () => window.removeEventListener(SCREENSHOT_REQUEST_EVENT, onRequest);
  }, [capture]);

  const copy = useCallback(async () => {
    if (phase.kind !== "result") return;
    setBusy("copy");
    try {
      await copyScreenshot(phase.shot);
      setCopied(true);
    } catch (error) {
      console.error("Copying screenshot failed", error);
      onMessage("Could not copy the screenshot to the clipboard");
    } finally {
      setBusy(null);
    }
  }, [phase, onMessage]);

  const saveAs = useCallback(async () => {
    if (phase.kind !== "result") return;
    setBusy("save");
    try {
      const path = await saveScreenshot(phase.shot);
      if (path) {
        onMessage(`Screenshot saved to ${path}`);
        close();
      }
    } catch (error) {
      console.error("Saving screenshot failed", error);
      onMessage("Could not save the screenshot");
    } finally {
      setBusy(null);
    }
  }, [phase, onMessage, close]);

  // Keyboard: Esc cancels everywhere; Enter captures the whole window while selecting;
  // Ctrl/Cmd+C and Ctrl/Cmd+S act on the result.
  useEffect(() => {
    if (phase.kind === "idle" || phase.kind === "capturing") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
      } else if (phase.kind === "selecting" && event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        void capture();
      } else if (phase.kind === "result" && mod && event.key.toLowerCase() === "c") {
        event.preventDefault();
        event.stopPropagation();
        void copy();
      } else if (phase.kind === "result" && mod && event.key.toLowerCase() === "s") {
        event.preventDefault();
        event.stopPropagation();
        void saveAs();
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [phase.kind, capture, close, copy, saveAs]);

  useEffect(() => {
    if (phase.kind === "result") copyButtonRef.current?.focus();
  }, [phase.kind]);

  if (phase.kind === "idle" || phase.kind === "capturing") return null;

  if (phase.kind === "selecting") {
    const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        if (event.button === 2) close();
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragStart({ x: event.clientX, y: event.clientY });
      setDragRect(null);
    };
    const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragStart) return;
      setDragRect(normalise(dragStart, { x: event.clientX, y: event.clientY }));
    };
    const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragStart) return;
      const rect = normalise(dragStart, { x: event.clientX, y: event.clientY });
      // A click without a real drag captures the whole window.
      void capture(rect.width < MIN_DRAG_PX || rect.height < MIN_DRAG_PX ? undefined : rect);
    };

    return (
      <div
        className={`screenshot-overlay${dragRect ? " screenshot-overlay--dragging" : ""}`}
        {...{ [SCREENSHOT_EXCLUDE_ATTR]: "" }}
        role="dialog"
        aria-label="Select an area to capture"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={(event) => event.preventDefault()}
      >
        {dragRect ? (
          <div
            className="screenshot-selection"
            style={{
              left: dragRect.x,
              top: dragRect.y,
              width: dragRect.width,
              height: dragRect.height,
            }}
          >
            <span className="screenshot-selection-size">
              {Math.round(dragRect.width)} × {Math.round(dragRect.height)}
            </span>
          </div>
        ) : (
          <div className="screenshot-hint">
            Drag to select an area · Click or press Enter for the whole window · Esc to cancel
          </div>
        )}
      </div>
    );
  }

  const { shot } = phase;
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      {...{ [SCREENSHOT_EXCLUDE_ATTR]: "" }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        className="save-dialog screenshot-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="screenshot-dialog-title"
      >
        <h2 id="screenshot-dialog-title">Screenshot</h2>
        <div className="screenshot-preview">
          <img src={shot.url} alt="Captured screenshot" />
        </div>
        <p className="screenshot-meta">
          {shot.width} × {shot.height} px · PNG
        </p>
        <div className="save-dialog-actions">
          <button type="button" onClick={close}>
            Close
          </button>
          <button type="button" onClick={() => void saveAs()} disabled={busy !== null}>
            {busy === "save" ? "Saving…" : "Save as PNG…"}
          </button>
          <button
            ref={copyButtonRef}
            type="button"
            className="primary"
            onClick={() => void copy()}
            disabled={busy !== null}
          >
            {copied ? "Copied" : busy === "copy" ? "Copying…" : "Copy to clipboard"}
          </button>
        </div>
      </div>
    </div>
  );
};
