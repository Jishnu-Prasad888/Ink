// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("renders raw HTML as inert text", async () => {
    const html = await renderMarkdown('<img src=x onerror="alert(1)">');
    const container = document.createElement("div");
    container.innerHTML = html;

    expect(container.querySelector("img")).toBeNull();
    expect(html).toContain("&lt;img");
  });

  it("rejects unsafe link protocols", async () => {
    const html = await renderMarkdown("[unsafe](javascript:alert(1))");

    const container = document.createElement("div");
    container.innerHTML = html;

    expect(container.querySelector("a")).toBeNull();
  });

  it("escapes Mermaid source before inserting it into the preview", async () => {
    const html = await renderMarkdown("```mermaid\n</pre><img src=x onerror=alert(1)>\n```");
    const container = document.createElement("div");
    container.innerHTML = html;

    expect(html).toContain('class="mermaid"');
    expect(container.querySelector("img")).toBeNull();
    expect(html).toContain("&lt;/pre&gt;");
  });

  it("tags top-level blocks with their source line for scroll sync", async () => {
    const html = await renderMarkdown(
      "# Title\n\nPara\n\n- a\n- b\n\n```js\nlet x = 1;\n```\n\n```mermaid\ngraph TD\n```\n",
    );
    const container = document.createElement("div");
    container.innerHTML = html;
    const lines = Array.from(container.querySelectorAll("[data-source-line]")).map((el) => [
      el.tagName,
      el.getAttribute("data-source-line"),
    ]);

    expect(lines).toEqual([
      ["H1", "0"],
      ["P", "2"],
      ["UL", "4"],
      ["PRE", "7"],
      ["PRE", "11"],
    ]);
  });
});
