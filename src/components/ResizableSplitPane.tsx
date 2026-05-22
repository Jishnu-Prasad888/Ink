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

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      startPos.current = direction === "horizontal" ? e.clientX : e.clientY;
      startSplit.current = split;
      document.body.style.cursor =
        direction === "horizontal" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
    },
    [split, direction]
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const total =
        direction === "horizontal" ? rect.width : rect.height;
      const delta =
        direction === "horizontal"
          ? e.clientX - startPos.current
          : e.clientY - startPos.current;
      const deltaPct = (delta / total) * 100;
      const newSplit = Math.max(
        (minSize / total) * 100,
        Math.min(100 - (minSize / total) * 100, startSplit.current + deltaPct)
      );
      setSplit(newSplit);
    };

    const onMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
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
        onMouseDown={onMouseDown}
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