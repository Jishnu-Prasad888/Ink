# Changelog

All notable changes to Ink are documented in this file.

## 1.4.0 - 2026-11-25

### GitHub remote workspaces

- Open a GitHub repository as a workspace without cloning; files are read and committed through the GitHub REST API on save.
- Sign in with GitHub's OAuth device flow; credentials are stored in a config file instead of the system keyring.

### Reading and appearance

- Restyled the Dark theme (and System in dark mode) with a Techno Dracula palette.
- Markdown files now open in Preview by default.
- Widened the readable preview column from 720px to 960px.
- Added a gear icon for Settings and a loading indicator while files open.

### Editing

- Editor and preview now scroll in sync in Split mode.

### Performance

- Mermaid now loads only when a document contains a diagram, shrinking the main bundle from 3.78 MB to 2.30 MB.
- Code highlighting bundles highlight.js's common language set.
- Preview re-renders are debounced while typing, and session state is written to storage in batches.
- Fixed task-list checkbox listeners accumulating on every preview render.

## 1.3.1 - 2026-09-12

### Interface

- Refined the UI toward a clearer Apple-inspired light visual system with stronger selection contrast.
- Made application chrome text non-selectable while keeping editor, preview, inputs, and PDF text selectable.
- Closed the Explorer sidebar by default on launch.
- Moved toolbar controls into a dedicated component.

### Editing experience

- Animated Edit, Split, and Preview mode transitions with sliding panes and fade.

### Reliability

- Fixed npm peer-dependency install issues and CI formatting/lint failures blocking release checks.

## 1.3.0 - 2026-07-31

### Workspace and appearance

- Introduced a responsive clay-inspired interface with anchored toolbar zones and consistent control styling.
- Added Light, Dark, Nord, Charcoal, and System themes with improved contrast and focus visibility.
- Added application-wide font selection and persistent per-tab document zoom.
- Added a Settings dialog for appearance, PDF orientation, and configurable keyboard shortcuts.

### Editing

- Added multiple cursors, configurable line movement, stronger selection rendering, and preserved standard keyboard selection.
- Added fenced-code completion and intelligent continuation for numbered lists, bullets, nested indentation, and blockquotes.
- Changed the default Command Palette shortcut to `Ctrl/Cmd+\`` and migrated the previous default automatically.

### Editor groups

- Assigned every tab to exactly one split pane and added drag transfers between groups.
- Added automatic split collapse when a pane becomes empty.
- Added independent Edit/Preview and Readable/Full controls for each pane.

### PDF and export

- Added PDF zoom, fit-to-width, clockwise/counterclockwise rotation, and persisted viewing state.
- Added print-ready Markdown PDF export with portrait and landscape A4 orientation.
- Added per-tab zoom controls for Markdown, preview, split, and PDF content.

### Explorer and files

- Added Close Folder and redesigned the folder tree with clearer hierarchy and active-file states.
- Added persistent recent files to the empty workspace.
- Restored native desktop drag and drop for Markdown, text, and PDF files.

### Reliability and accessibility

- Improved dark-theme link, syntax, border, muted-text, focus, and selection contrast.
- Hardened shortcut recording, split-state transitions, export cleanup, folder switching, and multiple-cursor persistence.
- Expanded automated frontend coverage to 23 tests and retained Rust filesystem safety tests.
