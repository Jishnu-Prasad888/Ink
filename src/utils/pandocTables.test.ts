// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isMermaidFence, renderMarkdown } from "./markdown";

const parse = async (source: string) => {
  const container = document.createElement("div");
  container.innerHTML = await renderMarkdown(source);
  return container;
};

const cellText = (row: Element) =>
  Array.from(row.querySelectorAll("th, td")).map((cell) => cell.textContent?.replace(/\s+/g, " "));

describe("Pandoc tables", () => {
  it("renders a multiline table with wrapped cells", async () => {
    const container = await parse(
      [
        "Intro:",
        "",
        "  ------------------------------------------------",
        "  Area            Technology     Responsibility",
        "  --------------- -------------- -----------------",
        "  Experiment DSL  Groovy         Expressive",
        "                                 workflows",
        "",
        "  Dashboard       React + Chart  Result",
        "                  or Plotly      visualisation",
        "  ------------------------------------------------",
        "",
        "After.",
      ].join("\n"),
    );
    const rows = container.querySelectorAll("tr");
    expect(rows).toHaveLength(3);
    expect(cellText(rows[0])).toEqual(["Area", "Technology", "Responsibility"]);
    expect(cellText(rows[1])).toEqual(["Experiment DSL", "Groovy", "Expressive workflows"]);
    expect(cellText(rows[2])).toEqual([
      "Dashboard",
      "React + Chart or Plotly",
      "Result visualisation",
    ]);
    expect(container.querySelector("h2")).toBeNull();
    expect(container.querySelector("hr")).toBeNull();
    expect(container.lastElementChild?.textContent).toBe("After.");
  });

  it("renders a simple table with alignment taken from the header", async () => {
    const container = await parse(
      [
        "  Right     Left     Center     Default",
        "-------     ------ ----------   -------",
        "     12     12        12            12",
      ].join("\n"),
    );
    const headers = Array.from(container.querySelectorAll("th"));
    expect(headers.map((th) => th.getAttribute("style"))).toEqual([
      "text-align:right",
      "text-align:left",
      "text-align:center",
      null,
    ]);
    expect(cellText(container.querySelectorAll("tr")[1])).toEqual(["12", "12", "12", "12"]);
  });

  it("leaves horizontal rules and setext headings alone", async () => {
    const container = await parse("Title\n-----\n\ntext\n\n---\n\nmore");
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector("h2")?.textContent).toBe("Title");
    expect(container.querySelector("hr")).not.toBeNull();
  });
});

describe("isMermaidFence", () => {
  it("accepts common Mermaid fence spellings", () => {
    expect(isMermaidFence("mermaid", "graph TD")).toBe(true);
    expect(isMermaidFence("Mermaid", "graph TD")).toBe(true);
    expect(isMermaidFence("{.mermaid}", "graph TD")).toBe(true);
    expect(isMermaidFence("", "sequenceDiagram\n A->>B: hi")).toBe(true);
  });

  it("does not treat other code as Mermaid", () => {
    expect(isMermaidFence("js", "graph TD")).toBe(false);
    expect(isMermaidFence("", "const graph = 1;")).toBe(false);
  });
});
