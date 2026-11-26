import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import markdownItTaskLists from "markdown-it-task-lists";
import markdownItFootnote from "markdown-it-footnote";
import markdownItTexmath from "markdown-it-texmath";
import type { Mermaid } from "mermaid";
import katex from "katex";
import { pandocTables } from "./pandocTables";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github.css";

if (import.meta.env.DEV) {
  console.log("[markdown] Initializing with highlight.js, mermaid, katex");
}

// Mermaid is large (~3 MB with its diagram chunks), so load it only when a
// document actually contains a diagram.
let mermaidPromise: Promise<Mermaid> | null = null;
const loadMermaid = () => {
  mermaidPromise ??= import("mermaid").then(({ default: mermaid }) => mermaid);
  return mermaidPromise;
};

const LIGHT_MERMAID_COLORS = {
  background: "#FFFFFF",
  primaryColor: "#DDF4FF",
  primaryBorderColor: "#0969DA",
  primaryTextColor: "#1F2328",
  lineColor: "#57606A",
  secondaryColor: "#F6F8FA",
  tertiaryColor: "#EAEEF2",
};

/** Mermaid colours taken from the app theme so diagrams stay legible in dark themes. */
const mermaidThemeVariables = (root: ParentNode) => {
  const element = root instanceof Element ? root : document.documentElement;
  const style = getComputedStyle(element);
  const read = (name: string, fallback: string) => {
    const value = style.getPropertyValue(name).trim();
    return /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback;
  };
  const darkMode = style.colorScheme.includes("dark");
  return {
    darkMode,
    // Must match the font the diagram is drawn in, or Mermaid sizes boxes for the
    // wrong text width and clips the labels.
    fontFamily: style.fontFamily || "sans-serif",
    background: read("--surface", LIGHT_MERMAID_COLORS.background),
    edgeLabelBackground: read("--surface", LIGHT_MERMAID_COLORS.background),
    primaryColor: read("--accent-bg", LIGHT_MERMAID_COLORS.primaryColor),
    primaryBorderColor: read("--accent-border", LIGHT_MERMAID_COLORS.primaryBorderColor),
    primaryTextColor: read("--text-primary", LIGHT_MERMAID_COLORS.primaryTextColor),
    lineColor: read("--text-muted", LIGHT_MERMAID_COLORS.lineColor),
    secondaryColor: read("--surface-raised", LIGHT_MERMAID_COLORS.secondaryColor),
    tertiaryColor: read("--surface-hover", LIGHT_MERMAID_COLORS.tertiaryColor),
  };
};

const MERMAID_SOURCE_START =
  /^\s*(?:%%\{|graph\b|flowchart\b|sequenceDiagram\b|classDiagram\b|stateDiagram(?:-v2)?\b|erDiagram\b|gantt\b|pie\b|journey\b|gitGraph\b|mindmap\b|timeline\b|quadrantChart\b|requirementDiagram\b|C4(?:Context|Container|Component|Dynamic|Deployment)\b|(?:xychart|sankey|block|packet|architecture|kanban)(?:-beta)?\b)/;

/**
 * Accepts the common ways a Mermaid fence is written: `mermaid`, `Mermaid`,
 * Pandoc's `{.mermaid}`, and an untagged fence whose body is clearly a diagram.
 */
export const isMermaidFence = (info: string, content: string) => {
  const language = info
    .trim()
    .replace(/^\{\s*\.?/, "")
    .split(/[\s}]/)[0]
    .toLowerCase();
  if (language === "mermaid") return true;
  return language === "" && MERMAID_SOURCE_START.test(content);
};

const md: MarkdownIt = new MarkdownIt({
  // Documents are untrusted input. Raw HTML is rendered as text rather than
  // being allowed to execute inside the privileged Tauri webview.
  html: false,
  linkify: true,
  typographer: true,
  highlight: function (str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        if (import.meta.env.DEV) console.log(`[highlight] Lang: ${lang}, length: ${str.length}`);
        return (
          '<pre class="hljs"><code>' +
          hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
          "</code></pre>"
        );
      } catch (error) {
        if (import.meta.env.DEV) console.warn("Failed to highlight code block", error);
      }
    }
    return '<pre class="hljs"><code>' + md.utils.escapeHtml(str) + "</code></pre>";
  },
});

md.use(markdownItTaskLists, { enabled: true, label: true });
md.use(markdownItFootnote);
md.use(pandocTables);
md.use(markdownItTexmath, {
  engine: katex,
  delimiters: "dollars",
  katexOptions: { macros: {} },
});

// Tag block elements with their 0-based source line so the editor and the
// preview can keep their scroll positions in sync.
export const SOURCE_LINE_ATTR = "data-source-line";
md.core.ruler.push("source_line", (state) => {
  for (const token of state.tokens) {
    if (token.map && token.level === 0 && token.nesting !== -1) {
      token.attrSet(SOURCE_LINE_ATTR, String(token.map[0]));
    }
  }
});

const defaultFence = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const code = token.content.trim();
  const line = token.attrGet(SOURCE_LINE_ATTR);
  const lineAttr = line === null ? "" : ` ${SOURCE_LINE_ATTR}="${line}"`;

  if (isMermaidFence(token.info, code)) {
    return `<pre class="mermaid"${lineAttr}>${md.utils.escapeHtml(code)}</pre>`;
  }
  // The highlighter returns its own <pre>, which markdown-it emits without attrs.
  return defaultFence(tokens, idx, options, env, self).replace(/^<pre\b/, `<pre${lineAttr}`);
};

export const renderMarkdown = async (content: string): Promise<string> => {
  if (import.meta.env.DEV) console.log(`[renderMarkdown] Input length: ${content.length}`);
  let html = md.render(content);
  html = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: [SOURCE_LINE_ATTR],
    FORBID_TAGS: ["form", "iframe", "object", "style", "template"],
  });

  if (import.meta.env.DEV) console.log(`[renderMarkdown] Output HTML length: ${html.length}`);
  return html;
};

/**
 * Renders every Mermaid block under `root`. Safe to call repeatedly: blocks
 * already drawn with the current theme are skipped, and blocks drawn with a
 * different theme are redrawn from their saved source.
 */
export const renderMermaidDiagrams = async (root: ParentNode) => {
  const elements = Array.from(root.querySelectorAll<HTMLElement>(".mermaid"));
  if (import.meta.env.DEV) console.log(`[renderMermaid] Found ${elements.length} mermaid elements`);
  if (elements.length === 0) return;

  const themeVariables = mermaidThemeVariables(root);
  const themeKey = JSON.stringify(themeVariables);
  const pending = elements.filter((element) => {
    element.dataset.mermaidSource ??= element.textContent ?? "";
    if (element.dataset.mermaidTheme === themeKey) return false;
    element.textContent = element.dataset.mermaidSource;
    element.removeAttribute("data-processed");
    element.dataset.mermaidTheme = themeKey;
    return true;
  });
  if (pending.length === 0) return;

  const mermaid = await loadMermaid();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    themeVariables,
  });
  await mermaid.run({ nodes: pending, suppressErrors: true });
  if (import.meta.env.DEV) console.log("[renderMermaid] Diagrams rendered");
};
