// components/PdfViewer.tsx
import React, { useEffect, useState } from "react";
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
  const [pageNumber, setPageNumber] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const updateTab = useTabStore((state) => state.updateTab);

  useEffect(() => {
    const loadPdf = async () => {
      if (!tab.filePath) {
        setError("No file path provided");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const bytes: Uint8Array | number[] = await invoke("read_file_binary", {
          path: tab.filePath,
        });

        const uint8Array =
          bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

        const safeArrayBuffer = new ArrayBuffer(uint8Array.byteLength);
        new Uint8Array(safeArrayBuffer).set(uint8Array);

        const blob = new Blob([safeArrayBuffer], {
          type: "application/pdf",
        });

        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
        updateTab(tab.id, { pdfBlobUrl: url });
        setLoading(false);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(`Failed to load PDF: ${errorMsg}`);
        setLoading(false);
      }
    };

    loadPdf();

    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [tab.filePath, tab.id]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const onDocumentLoadError = (error: Error) => {
    setError(`Failed to render PDF: ${error.message}`);
  };

  if (error) {
    return (
      <div
        className="pdf-loading"
        style={{ color: "var(--danger)", flexDirection: "column", gap: "12px" }}
      >
        <div>⚠️ Error</div>
        <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
          {error}
        </div>
      </div>
    );
  }

  if (loading || !blobUrl) {
    return (
      <div className="pdf-loading">
        <div>Loading PDF...</div>
      </div>
    );
  }

  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar">
        <button
          disabled={pageNumber <= 1}
          onClick={() => setPageNumber(pageNumber - 1)}
        >
          ← Previous
        </button>
        <span>
          Page {pageNumber} of {numPages || "?"}
        </span>
        <button
          disabled={pageNumber >= (numPages || 1)}
          onClick={() => setPageNumber(pageNumber + 1)}
        >
          Next →
        </button>
      </div>
      <div className="pdf-document">
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
            key={pageNumber}
            pageNumber={pageNumber}
            width={window.innerWidth * 0.6}
            renderTextLayer={true}
            renderAnnotationLayer={true}
          />
        </Document>
      </div>
    </div>
  );
};