import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { EditorView } from "@codemirror/view";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { SCREENSHOT_EXCLUDE_ATTR, requestScreenshot } from "../utils/screenshot";

interface MenuItem {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  run: () => void | Promise<void>;
}

interface MenuState {
  x: number;
  y: number;
  groups: MenuItem[][];
}

/** Native form fields keep the system menu (spell-check, input methods, etc.). */
const wantsNativeMenu = (target: Element) =>
  !!target.closest("input, textarea, select, [contenteditable]:not(.cm-content)");

const editorActions = (view: EditorView): MenuItem[] => {
  const { state } = view;
  const selected = state.selection.ranges
    .filter((range) => !range.empty)
    .map((range) => state.sliceDoc(range.from, range.to))
    .join(state.lineBreak);
  const readOnly = state.readOnly;
  return [
    {
      label: "Cut",
      disabled: !selected || readOnly,
      run: async () => {
        await writeText(selected);
        view.dispatch(state.replaceSelection(""));
        view.focus();
      },
    },
    {
      label: "Copy",
      disabled: !selected,
      run: async () => {
        await writeText(selected);
        view.focus();
      },
    },
    {
      label: "Paste",
      disabled: readOnly,
      run: async () => {
        const text = await readText();
        if (text) view.dispatch(view.state.replaceSelection(text));
        view.focus();
      },
    },
    {
      label: "Select All",
      run: () => {
        view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
        view.focus();
      },
    },
  ];
};

const documentActions = (target: Element): MenuItem[] => {
  const selected = window.getSelection()?.toString() ?? "";
  const preview = target.closest<HTMLElement>(".markdown-preview");
  return [
    {
      label: "Copy",
      disabled: !selected,
      run: () => writeText(selected),
    },
    ...(preview
      ? [
          {
            label: "Select All",
            run: () => {
              const range = document.createRange();
              range.selectNodeContents(preview);
              const selection = window.getSelection();
              selection?.removeAllRanges();
              selection?.addRange(range);
            },
          },
        ]
      : []),
  ];
};

interface AppContextMenuProps {
  screenshotShortcut: string;
}

/**
 * App-wide right-click menu with clipboard actions and screenshots. Menus that
 * other components open (e.g. the Explorer's) take precedence.
 */
export const AppContextMenu: React.FC<AppContextMenuProps> = ({ screenshotShortcut }) => {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setMenu(null);
    setPosition(null);
  }, []);

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      if (event.defaultPrevented) return; // another component opened its own menu
      const target = event.target instanceof Element ? event.target : null;
      if (!target || wantsNativeMenu(target)) return;
      if (target.closest(`[${SCREENSHOT_EXCLUDE_ATTR}]`)) return;
      event.preventDefault();

      const editorElement = target.closest<HTMLElement>(".cm-editor");
      const view = editorElement ? EditorView.findFromDOM(editorElement) : null;
      const clipboard = view ? editorActions(view) : documentActions(target);
      const screenshots: MenuItem[] = [
        {
          label: "Screenshot Area…",
          shortcut: screenshotShortcut,
          run: () => requestScreenshot("area"),
        },
        { label: "Screenshot Window", run: () => requestScreenshot("window") },
      ];
      setPosition(null);
      setMenu({ x: event.clientX, y: event.clientY, groups: [clipboard, screenshots] });
    };
    window.addEventListener("contextmenu", onContextMenu);
    return () => window.removeEventListener("contextmenu", onContextMenu);
  }, [screenshotShortcut]);

  // Keep the menu inside the window, then focus the first item for keyboard use.
  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const { width, height } = menuRef.current.getBoundingClientRect();
    setPosition({
      left: Math.max(4, Math.min(menu.x, window.innerWidth - width - 4)),
      top: Math.max(4, Math.min(menu.y, window.innerHeight - height - 4)),
    });
    menuRef.current.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) close();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    window.addEventListener("wheel", close, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("wheel", close, true);
    };
  }, [menu, close]);

  if (!menu) return null;

  const onKeyDown = (event: React.KeyboardEvent) => {
    const buttons = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
    );
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      buttons[(index + step + buttons.length) % buttons.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      buttons[event.key === "Home" ? 0 : buttons.length - 1]?.focus();
    }
  };

  const groups = menu.groups.filter((group) => group.length > 0);
  return (
    <div
      ref={menuRef}
      className="context-menu-content app-context-menu"
      role="menu"
      {...{ [SCREENSHOT_EXCLUDE_ATTR]: "" }}
      style={{
        position: "fixed",
        left: position?.left ?? menu.x,
        top: position?.top ?? menu.y,
        visibility: position ? "visible" : "hidden",
      }}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {groups.map((group, groupIndex) => (
        <React.Fragment key={groupIndex}>
          {groupIndex > 0 && <div className="context-menu-separator" role="separator" />}
          {group.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className="context-menu-item"
              disabled={item.disabled}
              onClick={() => {
                close();
                Promise.resolve(item.run()).catch((error) =>
                  console.error(`Context menu action "${item.label}" failed`, error),
                );
              }}
            >
              <span>{item.label}</span>
              {item.shortcut && <kbd className="app-context-menu-shortcut">{item.shortcut}</kbd>}
            </button>
          ))}
        </React.Fragment>
      ))}
    </div>
  );
};
