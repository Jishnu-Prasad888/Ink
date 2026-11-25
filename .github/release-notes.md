# Ink 1.4.0

Ink 1.4.0 adds GitHub remote workspaces, synced scrolling in Split mode, a Techno Dracula dark theme, and faster startup.

## GitHub remote workspaces

- Open a GitHub repository as a workspace without cloning; files are read and committed through the GitHub REST API on save.
- Sign in with GitHub's OAuth device flow; credentials are stored in a config file instead of the system keyring.

## Reading and appearance

- Restyled the Dark theme (and System in dark mode) with a Techno Dracula palette.
- Markdown files now open in Preview by default.
- Widened the readable preview column from 720px to 960px.
- Added a gear icon for Settings and a loading indicator while files open.

## Editing

- Editor and preview now scroll in sync in Split mode.

## Performance

- Mermaid now loads only when a document contains a diagram, shrinking the main bundle from 3.78 MB to 2.30 MB.
- Code highlighting bundles highlight.js's common language set.
- Preview re-renders are debounced while typing, and session state is written to storage in batches.
- Fixed task-list checkbox listeners accumulating on every preview render.

## Upgrade notes

- Existing documents, drafts, themes, shortcuts, and session data remain compatible.
- Markdown files now open in Preview; switch to Edit or Split from the toolbar or with the view shortcuts.
- Code blocks in less common languages outside highlight.js's common set render without syntax colors.

Download the Linux or Windows installer/package below.
