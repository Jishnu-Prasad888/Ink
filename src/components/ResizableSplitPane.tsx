import React, { useRef, useState, useCallback, useEffect } from "react";

interface ResizableSplitPaneProps {
  direction: "horizontal" | "vertical";
  initialSplit?: number; // 0-100 percentage for first pane
  minSize?: number; // minimum px for each pane
  children: [React.ReactNode, React.ReactNode];
  className?: string;
}

export const ResizableSplitPane: React.FC<ResizableSplitPaneProps> = ({
  direction,
  initialSplit = 50,
  minSize = 80,
  children,
  className = "",
}) => {
  const [split, setSplit] = useState(initialSplit);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startPos = useRef(0);
  const startSplit = useRef(initialSplit);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      isDragging.current = true;
      startPos.current =
        direction === "horizontal" ? event.clientX : event.clientY;
      startSplit.current = split;
      document.body.style.cursor =
        direction === "horizontal" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
    },
    [split, direction]
  );

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const total =
        direction === "horizontal" ? rect.width : rect.height;
      const delta =
        direction === "horizontal"
          ? event.clientX - startPos.current
          : event.clientY - startPos.current;
      const deltaPct = (delta / total) * 100;
      const newSplit = Math.max(
        (minSize / total) * 100,
        Math.min(100 - (minSize / total) * 100, startSplit.current + deltaPct)
      );
      setSplit(newSplit);
    };

    const onPointerUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [direction, minSize]);

  const isHorizontal = direction === "horizontal";

  return (
    <div
      ref={containerRef}
      className={`resizable-split-pane ${isHorizontal ? "split-h" : "split-v"} ${className}`}
      style={{
        display: "flex",
        flexDirection: isHorizontal ? "row" : "column",
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Pane 1 */}
      <div
        className="split-pane-child"
        style={{
          [isHorizontal ? "width" : "height"]: `${split}%`,
          flexShrink: 0,
          overflow: "hidden",
          minWidth: isHorizontal ? minSize : undefined,
          minHeight: !isHorizontal ? minSize : undefined,
        }}
      >
        {children[0]}
      </div>

      {/* Divider */}
      <div
        className={`split-divider ${isHorizontal ? "split-divider-h" : "split-divider-v"}`}
        role="separator"
        aria-label="Resize editor groups"
        aria-orientation={isHorizontal ? "vertical" : "horizontal"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(split)}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onDoubleClick={() => setSplit(50)}
        onKeyDown={(event) => {
          const decrease = isHorizontal ? "ArrowLeft" : "ArrowUp";
          const increase = isHorizontal ? "ArrowRight" : "ArrowDown";
          if (event.key === decrease || event.key === increase) {
            event.preventDefault();
            const delta = event.key === decrease ? -2 : 2;
            setSplit((value) => Math.max(10, Math.min(90, value + delta)));
          } else if (event.key === "Home") {
            event.preventDefault();
            setSplit(25);
          } else if (event.key === "End") {
            event.preventDefault();
            setSplit(75);
          }
        }}
      >
        <div className="split-divider-handle" />
      </div>

      {/* Pane 2 */}
      <div
        className="split-pane-child"
        style={{
          flex: 1,
          overflow: "hidden",
          minWidth: isHorizontal ? minSize : undefined,
          minHeight: !isHorizontal ? minSize : undefined,
        }}
      >
        {children[1]}
      </div>
    </div>
  );
};
