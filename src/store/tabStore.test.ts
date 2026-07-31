// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { useTabStore } from "./tabStore";

const addSavedTab = (fileName = "notes.md") => {
  useTabStore.getState().addTab({
    type: "markdown",
    filePath: `/${fileName}`,
    fileName,
    content: "saved",
    mode: "edit",
    isDirty: false,
  });
  return useTabStore.getState().activeTabId!;
};

describe("tab document state", () => {
  beforeEach(() => {
    localStorage.clear();
    useTabStore.setState({
      tabs: [],
      activeTabId: null,
      closedTabs: [],
      splitLayout: {
        enabled: false,
        direction: "horizontal",
        panels: [{ tabId: null }, { tabId: null }],
        activePanelIndex: 0,
        tabPanelAssignments: {},
      },
    });
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

describe("split tab ownership", () => {
  beforeEach(() => {
    localStorage.clear();
    useTabStore.setState({
      tabs: [],
      activeTabId: null,
      closedTabs: [],
      splitLayout: {
        enabled: false,
        direction: "horizontal",
        panels: [{ tabId: null }, { tabId: null }],
        activePanelIndex: 0,
        tabPanelAssignments: {},
      },
    });
  });

  it("keeps the active tab in the first pane and all other tabs in the second", () => {
    const first = addSavedTab("one.md");
    const second = addSavedTab("two.md");
    const third = addSavedTab("three.md");
    useTabStore.getState().setActiveTab(first);

    useTabStore.getState().enableSplitLayout("horizontal");

    const layout = useTabStore.getState().splitLayout;
    expect(layout.panels).toEqual([{ tabId: first }, { tabId: second }]);
    expect(layout.tabPanelAssignments).toEqual({
      [first]: 0,
      [second]: 1,
      [third]: 1,
    });
  });

  it("moves a tab between panes instead of showing it in both", () => {
    const first = addSavedTab("one.md");
    const second = addSavedTab("two.md");
    const third = addSavedTab("three.md");
    useTabStore.getState().setActiveTab(first);
    useTabStore.getState().enableSplitLayout("horizontal");

    useTabStore.getState().setPanelTab(0, second);

    const layout = useTabStore.getState().splitLayout;
    expect(layout.tabPanelAssignments[second]).toBe(0);
    expect(layout.panels).toEqual([{ tabId: second }, { tabId: third }]);
  });

  it("assigns new tabs only to the focused pane", () => {
    const first = addSavedTab("one.md");
    addSavedTab("two.md");
    useTabStore.getState().setActiveTab(first);
    useTabStore.getState().enableSplitLayout("horizontal");
    useTabStore.getState().setActiveSplitPanel(1);

    const third = addSavedTab("three.md");

    const layout = useTabStore.getState().splitLayout;
    expect(layout.tabPanelAssignments[third]).toBe(1);
    expect(layout.panels[1].tabId).toBe(third);
  });
});
