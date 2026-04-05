import MarkdownIt from "markdown-it";
import hljs from "highlight.js";
import markdownItTaskLists from "markdown-it-task-lists";
import markdownItFootnote from "markdown-it-footnote";
import markdownItTexmath from "markdown-it-texmath";
import mermaid from "mermaid";
import katex from "katex";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github.css";

// Initialize Mermaid
mermaid.initialize({
  startOnLoad: false,
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
  html: true,
  linkify: true,
  typographer: true,
  highlight: function (str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return (
          '<pre class="hljs"><code>' +
          hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
          "</code></pre>"
        );
      } catch (__) {}
    }
    return (
      '<pre class="hljs"><code>' + md.utils.escapeHtml(str) + "</code></pre>"
    );
  },
});

// Add plugins
md.use(markdownItTaskLists);
md.use(markdownItFootnote);
md.use(markdownItTexmath, {
  engine: katex,
  delimiters: "dollars",
  katexOptions: { macros: {} },
});

// Custom renderer for mermaid
const defaultFence = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const code = token.content.trim();

  if (token.info === "mermaid") {
    const id = `mermaid-${Date.now()}-${idx}`;
    return `<div class="mermaid" id="${id}">${code}</div>`;
  }

  return defaultFence(tokens, idx, options, env, self);
};

export const renderMarkdown = async (content: string): Promise<string> => {
  const html = md.render(content);
  return html;
};

export const renderMermaidDiagrams = async () => {
  const elements = document.querySelectorAll<HTMLElement>(".mermaid");
  if (elements.length > 0) {
    await mermaid.run({
      nodes: elements,
      suppressErrors: true,
    });
  }
};
