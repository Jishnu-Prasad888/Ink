export const shortcutDefinitions = [
  { id: "app.settings", label: "Open settings", group: "Application", defaultKey: "Mod+," },
  {
    id: "app.commandPalette",
    label: "Command palette",
    group: "Application",
    defaultKey: "Mod+Shift+P",
  },
  {
    id: "view.toggleExplorer",
    label: "Toggle Explorer",
    group: "Application",
    defaultKey: "Mod+B",
  },
  { id: "file.new", label: "New document", group: "Files", defaultKey: "Mod+N" },
  { id: "file.open", label: "Open document", group: "Files", defaultKey: "Mod+O" },
  { id: "file.save", label: "Save", group: "Files", defaultKey: "Mod+S" },
  { id: "file.saveAs", label: "Save as", group: "Files", defaultKey: "Mod+Shift+S" },
  { id: "file.close", label: "Close tab", group: "Files", defaultKey: "Mod+W" },
  { id: "file.exportPdf", label: "Export PDF", group: "Files", defaultKey: "Mod+Shift+E" },
  { id: "tabs.reopen", label: "Reopen closed tab", group: "Tabs", defaultKey: "Mod+Shift+T" },
  { id: "tabs.next", label: "Next tab", group: "Tabs", defaultKey: "Mod+Tab" },
  { id: "tabs.previous", label: "Previous tab", group: "Tabs", defaultKey: "Mod+Shift+Tab" },
  { id: "view.edit", label: "Edit mode", group: "View", defaultKey: "Mod+1" },
  { id: "view.sidePreview", label: "Preview to side", group: "View", defaultKey: "Mod+2" },
  { id: "view.preview", label: "Preview mode", group: "View", defaultKey: "Mod+3" },
  {
    id: "editor.addCursorAbove",
    label: "Add cursor above",
    group: "Editor",
    defaultKey: "Alt+Shift+ArrowUp",
  },
  {
    id: "editor.addCursorBelow",
    label: "Add cursor below",
    group: "Editor",
    defaultKey: "Alt+Shift+ArrowDown",
  },
  { id: "editor.moveLineUp", label: "Move line up", group: "Editor", defaultKey: "Alt+ArrowUp" },
  {
    id: "editor.moveLineDown",
    label: "Move line down",
    group: "Editor",
    defaultKey: "Alt+ArrowDown",
  },
] as const;

export type ShortcutId = (typeof shortcutDefinitions)[number]["id"];
export type ShortcutMap = Record<ShortcutId, string>;

export const defaultShortcuts = Object.fromEntries(
  shortcutDefinitions.map((definition) => [definition.id, definition.defaultKey]),
) as ShortcutMap;

const modifierKeys = new Set(["Control", "Shift", "Alt", "Meta"]);

const normalizeEventKey = (key: string) => {
  if (key === " ") return "Space";
  if (key.length === 1) return key.toUpperCase();
  return key;
};

export const shortcutFromEvent = (event: KeyboardEvent | React.KeyboardEvent): string | null => {
  if (modifierKeys.has(event.key)) return null;
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("Mod");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  parts.push(normalizeEventKey(event.key));
  return parts.join("+");
};

export const matchesShortcut = (event: KeyboardEvent, shortcut: string) => {
  const expected = shortcutFromEvent(event);
  return expected?.toLowerCase() === shortcut.toLowerCase();
};

export const formatShortcut = (shortcut: string) => {
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  if (!isMac) return shortcut.replace("Mod", "Ctrl");
  return shortcut.replace("Mod", "⌘").replace("Alt", "⌥").replace("Shift", "⇧").replace(/\+/g, "");
};

export const shortcutToCodeMirror = (shortcut: string) => {
  const parts = shortcut.split("+");
  const key = parts.pop() ?? "";
  const modifiers = ["Shift", "Alt", "Ctrl", "Meta", "Mod"].filter((part) => parts.includes(part));
  return [...modifiers, key].join("-");
};
