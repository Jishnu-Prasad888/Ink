import type { PdfOrientation } from "../store/settingsStore";

interface ExportPdfModalProps {
  fileName: string;
  orientation: PdfOrientation;
  isExporting: boolean;
  onOrientationChange: (orientation: PdfOrientation) => void;
  onCancel: () => void;
  onExport: () => void;
}

export function ExportPdfModal({
  fileName,
  orientation,
  isExporting,
  onOrientationChange,
  onCancel,
  onExport,
}: ExportPdfModalProps) {
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onCancel()}
    >
      <section
        className="export-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
      >
        <span className="settings-eyebrow">Print-ready document</span>
        <h2 id="export-title">Export {fileName} to PDF</h2>
        <p>
          Choose the page layout. Your system print dialog will let you save the result as a PDF.
        </p>
        <div className="orientation-options" role="radiogroup" aria-label="Page orientation">
          {(["portrait", "landscape"] as const).map((option) => (
            <button
              key={option}
              className={orientation === option ? "active" : ""}
              role="radio"
              aria-checked={orientation === option}
              onClick={() => onOrientationChange(option)}
            >
              <span className={`page-shape page-shape--${option}`} aria-hidden="true" />
              <strong>{option === "portrait" ? "Portrait" : "Landscape"}</strong>
            </button>
          ))}
        </div>
        <div className="save-dialog-actions">
          <button onClick={onCancel} disabled={isExporting}>
            Cancel
          </button>
          <button className="primary" onClick={onExport} disabled={isExporting}>
            {isExporting ? "Preparing…" : "Print / Save PDF"}
          </button>
        </div>
      </section>
    </div>
  );
}
