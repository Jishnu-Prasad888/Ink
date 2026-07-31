import { renderMarkdown, renderMermaidDiagrams } from "./markdown";
import type { PdfOrientation } from "../store/settingsStore";

export const createPrintPageStyle = (orientation: PdfOrientation) => `
  @page { size: A4 ${orientation}; margin: 16mm; }
  @media print {
    html, body { background: #fff !important; }
    body > #root { display: none !important; }
    body > .print-root { display: block !important; }
  }
`;

const waitForImages = async (root: HTMLElement) => {
  await Promise.all(
    Array.from(root.querySelectorAll("img")).map((image) =>
      image.complete
        ? image.decode?.().catch(() => undefined)
        : new Promise<void>((resolve) => {
            image.addEventListener("load", () => resolve(), { once: true });
            image.addEventListener("error", () => resolve(), { once: true });
          }),
    ),
  );
};

export const exportMarkdownToPdf = async (
  content: string,
  fileName: string,
  orientation: PdfOrientation,
) => {
  const printRoot = document.createElement("article");
  printRoot.className = "print-root markdown-preview";
  printRoot.innerHTML = await renderMarkdown(content);
  document.body.append(printRoot);

  const pageStyle = document.createElement("style");
  pageStyle.dataset.printPage = "true";
  pageStyle.textContent = createPrintPageStyle(orientation);
  document.head.append(pageStyle);

  const previousTitle = document.title;
  document.title = fileName.replace(/\.(md|markdown)$/i, "");

  let cleaned = false;
  let cleanupTimer: number | undefined;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    window.removeEventListener("afterprint", cleanup);
    if (cleanupTimer !== undefined) window.clearTimeout(cleanupTimer);
    printRoot.remove();
    pageStyle.remove();
    document.title = previousTitle;
  };

  try {
    await renderMermaidDiagrams(printRoot);
    await document.fonts?.ready;
    await waitForImages(printRoot);
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    cleanupTimer = window.setTimeout(cleanup, 60_000);
  } catch (error) {
    cleanup();
    throw error;
  }
};
