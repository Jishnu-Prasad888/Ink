import type MarkdownIt from "markdown-it";
import type StateBlock from "markdown-it/lib/rules_block/state_block.mjs";

/**
 * Pandoc-style tables, which markdown-it does not understand on its own.
 * Tools such as `pandoc input.docx -t markdown` emit these, so documents
 * converted from Word commonly contain them.
 *
 * Multiline table (with or without the header block):
 *
 *   ----------------------------------------
 *   Area        Technology   Responsibility
 *   ----------- ------------ ---------------
 *   Agent       Go           Lightweight
 *                            remote execution
 *
 *   Database    PostgreSQL   Definitions
 *   ----------------------------------------
 *
 * Simple table:
 *
 *   Right   Left   Center
 *   ------- ------ --------
 *        12 12        12
 *
 * Column boundaries come from the dashed separator line, and column alignment
 * from where the header text sits relative to its dashes (as in Pandoc).
 */

type Align = "left" | "right" | "center" | null;

interface Column {
  start: number;
  end: number; // exclusive end of the dashes
}

interface ParsedTable {
  header: string[] | null;
  rows: string[][];
  aligns: Align[];
  caption: string | null;
  endLine: number; // first line after the table
}

const FULL_RULE = /^ {0,3}-{3,}\s*$/;
const SEGMENTED_RULE = /^ {0,3}-+(?: +-+)+\s*$/;
const CAPTION = /^ {0,3}(?:Table)?:\s+(.+)$/;

const lineAt = (state: StateBlock, line: number) =>
  state.src.slice(state.bMarks[line], state.eMarks[line]).replace(/\t/g, "    ");

const isBlank = (text: string) => text.trim() === "";

const columnsOf = (rule: string): Column[] => {
  const columns: Column[] = [];
  for (const match of rule.matchAll(/-+/g)) {
    columns.push({ start: match.index, end: match.index + match[0].length });
  }
  return columns;
};

/** Slices one line into cells. Each column owns the text up to the next column's start. */
const sliceCells = (text: string, columns: Column[]) =>
  columns.map((column, index) => {
    const from = index === 0 ? 0 : column.start;
    const to = index === columns.length - 1 ? text.length : columns[index + 1].start;
    return text.slice(from, to).trim();
  });

/** Merges the lines of one multiline row into a cell per column. */
const mergeRow = (lines: string[], columns: Column[]) => {
  const cells: string[][] = columns.map(() => []);
  for (const line of lines) {
    sliceCells(line, columns).forEach((cell, index) => {
      if (cell) cells[index].push(cell);
    });
  }
  return cells.map((parts) => parts.join("\n"));
};

const alignmentsOf = (sample: string, columns: Column[], fallback: Align): Align[] =>
  columns.map((column) => {
    if (isBlank(sample.slice(column.start, column.end))) return fallback;
    const flushLeft = (sample[column.start] ?? " ") !== " ";
    const flushRight = (sample[column.end - 1] ?? " ") !== " ";
    if (flushLeft && flushRight) return fallback;
    if (flushLeft) return "left";
    if (flushRight) return "right";
    return "center";
  });

const readCaption = (state: StateBlock, line: number, endLine: number) => {
  let next = line;
  if (next < endLine && isBlank(lineAt(state, next))) next += 1;
  if (next >= endLine) return null;
  const match = CAPTION.exec(lineAt(state, next));
  return match ? { caption: match[1].trim(), endLine: next + 1 } : null;
};

const withCaption = (
  state: StateBlock,
  table: Omit<ParsedTable, "caption">,
  endLine: number,
): ParsedTable => {
  const caption = readCaption(state, table.endLine, endLine);
  return caption ? { ...table, ...caption } : { ...table, caption: null };
};

/** Rows of a multiline body: groups of lines separated by blank lines, up to a closing rule. */
const readMultilineBody = (
  state: StateBlock,
  firstLine: number,
  endLine: number,
  isClosing: (text: string) => boolean,
) => {
  const rows: string[][] = [];
  let current: string[] = [];
  for (let line = firstLine; line < endLine; line += 1) {
    const text = lineAt(state, line);
    if (isClosing(text)) {
      if (current.length) rows.push(current);
      return { rows, closeLine: line };
    }
    if (isBlank(text)) {
      if (current.length) rows.push(current);
      current = [];
    } else {
      current.push(text);
    }
  }
  return null;
};

const parseMultiline = (
  state: StateBlock,
  startLine: number,
  endLine: number,
): ParsedTable | null => {
  const first = lineAt(state, startLine);

  // With a header: full-width rule, header lines, segmented rule, body, full-width rule.
  if (FULL_RULE.test(first)) {
    let line = startLine + 1;
    const headerLines: string[] = [];
    while (line < endLine && !SEGMENTED_RULE.test(lineAt(state, line))) {
      const text = lineAt(state, line);
      if (isBlank(text) || FULL_RULE.test(text)) return null;
      headerLines.push(text);
      line += 1;
    }
    if (line >= endLine || headerLines.length === 0) return null;
    const columns = columnsOf(lineAt(state, line));
    const body = readMultilineBody(state, line + 1, endLine, (text) => FULL_RULE.test(text));
    if (!body || body.rows.length === 0) return null;
    return withCaption(
      state,
      {
        header: mergeRow(headerLines, columns),
        rows: body.rows.map((row) => mergeRow(row, columns)),
        aligns: alignmentsOf(headerLines[0], columns, "left"),
        endLine: body.closeLine + 1,
      },
      endLine,
    );
  }

  // Headerless: segmented rule, body rows separated by blank lines, segmented rule.
  if (SEGMENTED_RULE.test(first)) {
    const columns = columnsOf(first);
    const body = readMultilineBody(state, startLine + 1, endLine, (text) =>
      SEGMENTED_RULE.test(text),
    );
    // A single row without blank-line separators is a simple headerless table instead.
    if (!body || body.rows.length < 2) return null;
    return withCaption(
      state,
      {
        header: null,
        rows: body.rows.map((row) => mergeRow(row, columns)),
        aligns: alignmentsOf(body.rows[0][0], columns, "left"),
        endLine: body.closeLine + 1,
      },
      endLine,
    );
  }

  return null;
};

const parseSimple = (state: StateBlock, startLine: number, endLine: number): ParsedTable | null => {
  const first = lineAt(state, startLine);

  // With a header: header line, segmented rule, one line per row until a blank line.
  if (
    !isBlank(first) &&
    startLine + 1 < endLine &&
    SEGMENTED_RULE.test(lineAt(state, startLine + 1))
  ) {
    if (SEGMENTED_RULE.test(first) || FULL_RULE.test(first)) return null;
    const columns = columnsOf(lineAt(state, startLine + 1));
    const rows: string[][] = [];
    let line = startLine + 2;
    for (; line < endLine; line += 1) {
      const text = lineAt(state, line);
      if (isBlank(text)) break;
      if (SEGMENTED_RULE.test(text) || FULL_RULE.test(text)) {
        line += 1;
        break;
      }
      rows.push(sliceCells(text, columns));
    }
    if (rows.length === 0) return null;
    return withCaption(
      state,
      {
        header: sliceCells(first, columns),
        rows,
        aligns: alignmentsOf(first, columns, null),
        endLine: line,
      },
      endLine,
    );
  }

  // Headerless: segmented rule, one line per row, segmented rule.
  if (SEGMENTED_RULE.test(first)) {
    const columns = columnsOf(first);
    const rows: string[][] = [];
    for (let line = startLine + 1; line < endLine; line += 1) {
      const text = lineAt(state, line);
      if (SEGMENTED_RULE.test(text)) {
        if (rows.length === 0) return null;
        return withCaption(
          state,
          {
            header: null,
            rows: rows.map((row) => sliceCells(row[0], columns)),
            aligns: alignmentsOf(rows[0][0], columns, null),
            endLine: line + 1,
          },
          endLine,
        );
      }
      if (isBlank(text)) return null;
      rows.push([text]);
    }
  }

  return null;
};

const pushTable = (state: StateBlock, table: ParsedTable, startLine: number) => {
  const pushCells = (cells: string[], tag: "th" | "td", line: number) => {
    state.push("tr_open", "tr", 1).map = [line, line + 1];
    table.aligns.forEach((align, index) => {
      const open = state.push(`${tag}_open`, tag, 1);
      if (align) open.attrs = [["style", `text-align:${align}`]];
      const inline = state.push("inline", "", 0);
      inline.content = cells[index] ?? "";
      inline.map = [line, line + 1];
      inline.children = [];
      state.push(`${tag}_close`, tag, -1);
    });
    state.push("tr_close", "tr", -1);
  };

  const open = state.push("table_open", "table", 1);
  open.map = [startLine, table.endLine];
  if (table.caption) {
    state.push("caption_open", "caption", 1);
    const inline = state.push("inline", "", 0);
    inline.content = table.caption;
    inline.children = [];
    state.push("caption_close", "caption", -1);
  }
  if (table.header) {
    state.push("thead_open", "thead", 1);
    pushCells(table.header, "th", startLine);
    state.push("thead_close", "thead", -1);
  }
  state.push("tbody_open", "tbody", 1);
  for (const row of table.rows) pushCells(row, "td", startLine);
  state.push("tbody_close", "tbody", -1);
  state.push("table_close", "table", -1);
};

const pandocTableRule = (
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean,
) => {
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  const table = parseMultiline(state, startLine, endLine) ?? parseSimple(state, startLine, endLine);
  if (!table) return false;
  if (silent) return true;
  pushTable(state, table, startLine);
  state.line = table.endLine;
  return true;
};

export const pandocTables = (md: MarkdownIt) => {
  // Like Pandoc, a table must start after a blank line, so it never interrupts a paragraph.
  md.block.ruler.before("table", "pandoc_table", pandocTableRule);
};
