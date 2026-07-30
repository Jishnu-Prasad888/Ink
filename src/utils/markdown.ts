import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
import hljs from "highlight.js";
import markdownItTaskLists from "markdown-it-task-lists";
import markdownItFootnote from "markdown-it-footnote";
import markdownItTexmath from "markdown-it-texmath";
import mermaid from "mermaid";
import katex from "katex";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github.css";

if (import.meta.env.DEV) {
  console.log("[markdown] Initializing with highlight.js, mermaid, katex");
}

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

const defaultFence = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const code = token.content.trim();

  if (token.info === "mermaid") {
    return `<pre class="mermaid">${md.utils.escapeHtml(code)}</pre>`;
  }
  return defaultFence(tokens, idx, options, env, self);
};

export const renderMarkdown = async (content: string): Promise<string> => {
  if (import.meta.env.DEV) console.log(`[renderMarkdown] Input length: ${content.length}`);
  let html = md.render(content);
  html = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["form", "iframe", "object", "style", "template"],
  });

  if (import.meta.env.DEV) console.log(`[renderMarkdown] Output HTML length: ${html.length}`);
  return html;
};

export const renderMermaidDiagrams = async (root: ParentNode) => {
  const elements = root.querySelectorAll<HTMLElement>(".mermaid");
  if (import.meta.env.DEV) console.log(`[renderMermaid] Found ${elements.length} mermaid elements`);
  if (elements.length > 0) {
    await mermaid.run({
      nodes: elements,
      suppressErrors: true,
    });
    if (import.meta.env.DEV) console.log("[renderMermaid] Diagrams rendered");
  }
};
