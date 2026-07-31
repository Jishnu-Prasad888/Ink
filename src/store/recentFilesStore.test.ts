// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { useRecentFilesStore } from "./recentFilesStore";

describe("recent files", () => {
  beforeEach(() => {
    localStorage.clear();
    useRecentFilesStore.setState({ recentFiles: [] });
  });

  it("moves reopened files to the front without duplicates", () => {
    const store = useRecentFilesStore.getState();
    store.addRecentFile("/one.md", "one.md");
    store.addRecentFile("/two.md", "two.md");
    store.addRecentFile("/one.md", "one.md");

    expect(useRecentFilesStore.getState().recentFiles.map((file) => file.path)).toEqual([
      "/one.md",
      "/two.md",
    ]);
  });

  it("keeps only the eight most recent files", () => {
    for (let index = 0; index < 10; index += 1) {
      useRecentFilesStore.getState().addRecentFile(`/${index}.md`, `${index}.md`);
    }
    expect(useRecentFilesStore.getState().recentFiles).toHaveLength(8);
    expect(useRecentFilesStore.getState().recentFiles[0].path).toBe("/9.md");
  });
});
