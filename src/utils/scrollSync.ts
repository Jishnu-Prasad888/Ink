// Maps between editor source lines and preview pixel offsets using the
// `data-source-line` anchors that the markdown renderer emits.

export interface ScrollAnchor {
  /** 0-based source line where the block starts. */
  line: number;
  /** Offset of the block's top edge within the preview's scroll content, in px. */
  top: number;
}

/**
 * Keeps anchors strictly increasing in both line and top so interpolation is
 * well defined. Anchors arrive in document order; out-of-order or zero-height
 * ones (e.g. hidden elements) are dropped.
 */
export const normalizeAnchors = (anchors: ScrollAnchor[]): ScrollAnchor[] => {
  const result: ScrollAnchor[] = [];
  for (const anchor of anchors) {
    const last = result[result.length - 1];
    if (!last || (anchor.line > last.line && anchor.top > last.top)) result.push(anchor);
  }
  return result;
};

/**
 * Builds the full interpolation table: a virtual anchor at the very top and
 * one at the very bottom so positions before the first block and after the
 * last block still map smoothly.
 */
const withBounds = (anchors: ScrollAnchor[], totalLines: number, maxTop: number) => {
  const table: ScrollAnchor[] = [{ line: 0, top: 0 }];
  for (const anchor of anchors) {
    const last = table[table.length - 1];
    if (anchor.line > last.line && anchor.top > last.top) table.push(anchor);
    else if (anchor.line === 0) table[0] = { line: 0, top: Math.min(anchor.top, 0) };
  }
  const last = table[table.length - 1];
  if (totalLines > last.line && maxTop > last.top) table.push({ line: totalLines, top: maxTop });
  return table;
};

const interpolate = (
  table: ScrollAnchor[],
  value: number,
  from: keyof ScrollAnchor,
  to: keyof ScrollAnchor,
) => {
  if (table.length === 0) return 0;
  if (value <= table[0][from]) return table[0][to];
  for (let i = 1; i < table.length; i++) {
    const a = table[i - 1];
    const b = table[i];
    if (value < b[from]) {
      const ratio = (value - a[from]) / (b[from] - a[from]);
      return a[to] + (b[to] - a[to]) * ratio;
    }
  }
  return table[table.length - 1][to];
};

/** Fractional source line → preview scroll offset. */
export const lineToPreviewTop = (
  anchors: ScrollAnchor[],
  line: number,
  totalLines: number,
  maxTop: number,
) => interpolate(withBounds(anchors, totalLines, maxTop), line, "line", "top");

/** Preview scroll offset → fractional source line. */
export const previewTopToLine = (
  anchors: ScrollAnchor[],
  top: number,
  totalLines: number,
  maxTop: number,
) => interpolate(withBounds(anchors, totalLines, maxTop), top, "top", "line");
