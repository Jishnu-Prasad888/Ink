// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { useTabStore } from "./tabStore";

const addSavedTab = () => {
  useTabStore.getState().addTab({
    type: "markdown",
    filePath: "/notes.md",
    fileName: "notes.md",
    content: "saved",
    mode: "edit",
    isDirty: false,
  });
  return useTabStore.getState().activeTabId!;
};

describe("tab document state", () => {
  beforeEach(() => {
    localStorage.clear();
    useTabStore.setState({ tabs: [], activeTabId: null, closedTabs: [] });
  });

  it("clears dirty state when content returns to the saved baseline", () => {
    const id = addSavedTab();

    useTabStore.getState().saveTabContent(id, "changed");
    expect(useTabStore.getState().tabs[0].isDirty).toBe(true);

    useTabStore.getState().saveTabContent(id, "saved");
    expect(useTabStore.getState().tabs[0].isDirty).toBe(false);
  });

  it("keeps newer edits dirty when an older revision finishes saving", () => {
    const id = addSavedTab();
    useTabStore.getState().saveTabContent(id, "first edit");
    useTabStore.getState().saveTabContent(id, "newer edit");

    useTabStore.getState().markTabSaved(id, "first edit");

    const tab = useTabStore.getState().tabs[0];
    expect(tab.savedContent).toBe("first edit");
    expect(tab.content).toBe("newer edit");
    expect(tab.isDirty).toBe(true);
  });
});
