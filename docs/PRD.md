# Ink Product Requirements

## Vision

Ink is a fast, local-first Markdown workspace that combines VS Code-style navigation and editor groups with a purpose-built writing and preview experience.

## Product Principles

1. Never silently lose document content.
2. Treat every opened document as untrusted input.
3. Keep typing responsive regardless of preview complexity.
4. Make all primary workflows keyboard accessible.
5. Preserve native filesystem behavior and user ownership of files.

## Target Users

- Developers maintaining project documentation
- Technical writers working across folders of related files
- Students and researchers using math, diagrams, and footnotes
- Users seeking an offline desktop alternative to web editors

## Current Release Scope

- Native open, save, Save As, folder, association, and drag-and-drop workflows
- Correct dirty-state tracking and save-race protection
- Atomic writes and content-fingerprint conflict detection
- Crash-resistant persisted drafts and session restoration
- Safe Markdown preview with Mermaid, math, tasks, footnotes, and highlighting
- Tabs, exclusive editor groups, Command Palette, Explorer, recent files, status bar, themes, fonts, and per-tab zoom
- Keyboard and screen-reader semantics for core navigation
- PDF viewing with page navigation, zoom, fit-to-width, rotation, and persisted state
- Print-ready PDF export with portrait and landscape orientation

## Functional Requirements

| ID         | Requirement                                                                 | Status                      |
| ---------- | --------------------------------------------------------------------------- | --------------------------- |
| SAFE-01    | Sanitize preview output and block active raw HTML                           | Complete                    |
| SAFE-02    | Run Mermaid in strict mode with escaped source                              | Complete                    |
| SAFE-03    | Apply a restrictive desktop CSP                                             | Complete                    |
| DATA-01    | Track saved baselines independently from current content                    | Complete                    |
| DATA-02    | Provide Save, Don't Save, and Cancel on dirty close                         | Complete                    |
| DATA-03    | Save through atomic same-directory replacement                              | Complete                    |
| DATA-04    | Detect stale external content before overwrite                              | Complete                    |
| FILE-01    | Open Markdown, text, PDF, folders, drops, and associated files consistently | Complete                    |
| EDIT-01    | Preserve cursor and scroll state by document                                | Complete                    |
| EDIT-02    | Provide document search and replace                                         | Complete through CodeMirror |
| PREV-01    | Provide Edit, Preview, and Preview to Side                                  | Complete                    |
| GROUP-01   | Support two resizable editor groups                                         | Complete                    |
| CMD-01     | Provide a searchable Command Palette                                        | Complete                    |
| UI-01      | Support light, dark, system, Nord, and Charcoal themes                      | Complete                    |
| A11Y-01    | Provide semantic tabs, trees, toolbars, dialogs, and separators             | Complete                    |
| PDF-01     | Open, navigate, zoom, and rotate PDF documents                              | Complete                    |
| EXPORT-01  | Export print-ready PDF                                                      | Complete                    |
| FILE-02    | Rename, move, duplicate, trash, and reveal files                            | Planned                     |
| PREV-02    | Synchronize editor and preview scrolling through source maps                | Planned                     |
| SEARCH-01  | Search across all files in a workspace                                      | Planned                     |
| OUTLINE-01 | Navigate document headings from an Outline view                             | Planned                     |
| PERF-01    | Move heavy rendering off the typing-critical path                           | Planned                     |

## Acceptance Criteria

- Dirty documents cannot be discarded without an explicit user decision.
- Typing during a save leaves newer content marked dirty.
- External changes are detected before a destructive overwrite.
- Malicious Markdown cannot execute scripts or invoke native commands.
- Tabs, Explorer entries, splitters, dialogs, and commands work without a pointer.
- The previous session and unsaved draft content survive an application restart.
- Frontend checks and Rust checks pass in CI on every pull request.

## Next Milestones

### Workspace Tools

- Workspace-wide search and replace
- Document Outline and heading breadcrumbs
- File rename, move, duplicate, trash, and reveal-in-folder commands
- Editor-group tab context menus and pinned tabs

### Publishing

- Semantic standalone HTML export
- Additional page sizes and export themes

### Performance

- Debounced preview updates
- Worker-based Markdown parsing for large documents
- Lazy Mermaid rendering and explicit large-document mode
- IndexedDB-backed recovery snapshots with storage limits

### PDF

- Search and thumbnails

## Success Measures

- No reproducible silent data-loss path
- No critical findings in the Markdown security fixture suite
- WCAG 2.2 AA for primary workflows
- Preview update within 300 ms for typical documents without blocking input
- Successful Windows, macOS, and Linux release builds
