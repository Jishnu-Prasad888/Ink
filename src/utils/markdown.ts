import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import markdownItTaskLists from "markdown-it-task-lists";
import markdownItFootnote from "markdown-it-footnote";
import markdownItTexmath from "markdown-it-texmath";
import type { Mermaid } from "mermaid";
import katex from "katex";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github.css";

if (import.meta.env.DEV) {
  console.log("[markdown] Initializing with highlight.js, mermaid, katex");
}

// Mermaid is large (~3 MB with its diagram chunks), so load it only when a
// document actually contains a diagram.
let mermaidPromise: Promise<Mermaid> | null = null;
const loadMermaid = () => {
  mermaidPromise ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      themeVariables: {
        background: "#FFFFFF",
        primaryColor: "#0969DA",
        primaryBorderColor: "#0969DA",
        primaryTextColor: "#1F2328",
        lineColor: "#57606A",
        secondaryColor: "#F6F8FA",
        tertiaryColor: "#D0D7DE",
      },
    });
    return mermaid;
  });
  return mermaidPromise;
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

  if (token.info === "mermaid") {
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

export const renderMermaidDiagrams = async (root: ParentNode) => {
  const elements = root.querySelectorAll<HTMLElement>(".mermaid");
  if (import.meta.env.DEV) console.log(`[renderMermaid] Found ${elements.length} mermaid elements`);
  if (elements.length > 0) {
    const mermaid = await loadMermaid();
    await mermaid.run({
      nodes: elements,
      suppressErrors: true,
    });
    if (import.meta.env.DEV) console.log("[renderMermaid] Diagrams rendered");
  }
};
