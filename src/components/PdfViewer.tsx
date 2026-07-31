// components/PdfViewer.tsx
import React, { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { invoke } from "@tauri-apps/api/core";
import { Tab, useTabStore } from "../store/tabStore";

// ✅ FIX 1: Import required CSS — without these, pages 2+ lose canvas rendering
// and fall back to raw text layer only
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

interface PdfViewerProps {
  tab: Tab;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({ tab }) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(tab.pdfPage ?? 1);
  const [zoom, setZoom] = useState(tab.pdfZoom ?? 1);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(tab.pdfRotation ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageWidth, setPageWidth] = useState(720);
  const documentRef = useRef<HTMLDivElement>(null);
  const updateTab = useTabStore((state) => state.updateTab);

  useEffect(() => {
    const container = documentRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      setPageWidth(Math.max(280, Math.min(entry.contentRect.width - 40, 960)));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let createdUrl: string | null = null;
    let cancelled = false;

    const loadPdf = async () => {
      if (!tab.filePath) {
        setError("No file path provided");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        setBlobUrl(null);
        setNumPages(null);

        const bytes: Uint8Array | number[] = await invoke("read_file_binary", {
          path: tab.filePath,
        });

        const uint8Array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

        const safeArrayBuffer = new ArrayBuffer(uint8Array.byteLength);
        new Uint8Array(safeArrayBuffer).set(uint8Array);

        const blob = new Blob([safeArrayBuffer], {
          type: "application/pdf",
        });

        const url = URL.createObjectURL(blob);
        createdUrl = url;
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        setBlobUrl(url);
        setLoading(false);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(`Failed to load PDF: ${errorMsg}`);
        setLoading(false);
      }
    };

    loadPdf();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [tab.filePath]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    const clampedPage = Math.max(1, Math.min(pageNumber, numPages));
    if (clampedPage !== pageNumber) {
      setPageNumber(clampedPage);
      updateTab(tab.id, { pdfPage: clampedPage });
    }
  };

  const onDocumentLoadError = (error: Error) => {
    setError(`Failed to render PDF: ${error.message}`);
  };

  if (error) {
    return (
      <div
        className="pdf-loading"
        role="alert"
        style={{ color: "var(--danger)", flexDirection: "column", gap: "12px" }}
      >
        <div>PDF error</div>
        <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{error}</div>
      </div>
    );
  }

  if (loading || !blobUrl) {
    return (
      <div className="pdf-loading" role="status" aria-live="polite">
        <div>Loading PDF...</div>
      </div>
    );
  }

  const changePage = (nextPage: number) => {
    const clampedPage = Math.max(1, Math.min(nextPage, numPages ?? 1));
    setPageNumber(clampedPage);
    updateTab(tab.id, { pdfPage: clampedPage });
  };

  const changeZoom = (nextZoom: number) => {
    const clampedZoom = Math.max(0.5, Math.min(nextZoom, 3));
    setZoom(clampedZoom);
    updateTab(tab.id, { pdfZoom: clampedZoom });
  };

  const rotate = (direction: -1 | 1) => {
    const nextRotation = ((rotation + direction * 90 + 360) % 360) as 0 | 90 | 180 | 270;
    setRotation(nextRotation);
    updateTab(tab.id, { pdfRotation: nextRotation });
  };

  return (
    <div className="pdf-viewer" aria-busy={loading}>
      <div className="pdf-toolbar" role="toolbar" aria-label="PDF navigation">
        <button disabled={pageNumber <= 1} onClick={() => changePage(pageNumber - 1)}>
          ← Previous
        </button>
        <span>
          Page {pageNumber} of {numPages || "?"}
        </span>
        <button disabled={pageNumber >= (numPages || 1)} onClick={() => changePage(pageNumber + 1)}>
          Next →
        </button>
        <span className="pdf-toolbar-divider" aria-hidden="true" />
        <button
          onClick={() => changeZoom(zoom - 0.25)}
          disabled={zoom <= 0.5}
          aria-label="Zoom out"
        >
          −
        </button>
        <span className="pdf-zoom-value">{Math.round(zoom * 100)}%</span>
        <button onClick={() => changeZoom(zoom + 0.25)} disabled={zoom >= 3} aria-label="Zoom in">
          +
        </button>
        <button onClick={() => changeZoom(1)}>Fit width</button>
        <span className="pdf-toolbar-divider" aria-hidden="true" />
        <button onClick={() => rotate(-1)} aria-label="Rotate counterclockwise">
          ↶ Rotate
        </button>
        <button onClick={() => rotate(1)} aria-label="Rotate clockwise">
          Rotate ↷
        </button>
      </div>
      <div ref={documentRef} className="pdf-document">
        <Document
          file={blobUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={<div>Rendering...</div>}
        >
          {/* ✅ FIX 2: key={pageNumber} forces React to fully remount the canvas
              element on page change, preventing the stale/missing canvas bug */}
          {/* ✅ FIX 3: Explicit renderTextLayer + renderAnnotationLayer keeps
              rendering consistent across all pages */}
          <Page
            key={`${pageNumber}-${rotation}`}
            pageNumber={pageNumber}
            width={pageWidth * zoom}
            rotate={rotation}
            renderTextLayer={true}
            renderAnnotationLayer={true}
          />
        </Document>
      </div>
    </div>
  );
};
