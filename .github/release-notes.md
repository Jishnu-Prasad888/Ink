# Ink 1.5.0

Ink 1.5.0 adds in-app screenshots, resizable Split mode panes, new line editing shortcuts and smooth wheel zoom, and renders Pandoc tables and more Mermaid diagrams.

## Screenshots

- Press Alt+Shift+S (configurable in Settings) to drag-select an area of the window; click or press Enter to capture the whole window.
- Right-click anywhere for Screenshot Area and Screenshot Window.
- Copy the result to the clipboard or save it as a PNG.

## Editing

- Drag the divider between the editor and preview in Split mode to resize them; double-click to reset. The width is remembered.
- New right-click menu with Cut, Copy, Paste and Select All in the editor and preview.
- Shortcuts that use Alt now work on macOS.
- Alt+Shift+Up/Down duplicates the current line (or selection) above or below.
- Ctrl+Alt+Up/Down adds a cursor on the line above or below (previously Alt+Shift+Up/Down; customised bindings are kept).
- Alt+Up/Down moves the current line up or down.

## Zoom

- Ctrl+wheel (Cmd+wheel on macOS) zoom is now smooth: it follows how far the wheel or touchpad moves instead of jumping a fixed step per event.
- The text under the pointer stays in place while zooming, and in Split mode the other pane follows.
- PDFs scale smoothly while zooming and re-render sharply when you stop.

## Preview

- Pandoc multiline and simple tables (common in documents converted from Word) now render as tables.
- Mermaid diagrams fenced as `Mermaid`, `{.mermaid}` or without a language now render.
- Mermaid diagrams follow the app theme, redraw when it changes, and no longer clip their labels.

## Security

- Updated Vite, markdown-it, DOMPurify and several transitive dependencies to resolve high-severity npm advisories.

## Upgrade notes

- Existing documents, drafts, themes, shortcuts, and session data remain compatible.
- Right-clicking in the editor or preview now shows Ink's menu instead of the system one; text fields keep the system menu.

Download the Linux or Windows installer/package below.
