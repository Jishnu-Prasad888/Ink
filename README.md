# Ink

Ink is a secure, local-first Markdown workspace for Windows, macOS, and Linux. It combines a focused Markdown editor and live preview with familiar desktop-editor navigation.

## Features

- CodeMirror 6 editor with syntax highlighting, folding, search, undo, and autocomplete
- Edit, Preview, and Preview to Side modes
- Multi-document tabs and resizable editor groups
- Folder Explorer with Markdown, text, and PDF support
- Mermaid, KaTeX, footnotes, task lists, tables, and highlighted code blocks
- Command Palette with `Ctrl+Shift+P` / `Cmd+Shift+P`
- Light, dark, and system themes
- Document status with cursor position and word count
- Session restoration and recently closed tabs
- Atomic saves, stale-file detection, and unsaved-change protection
- Sanitized previews and a restrictive Tauri content security policy
- Keyboard-accessible tabs, Explorer, dialogs, and splitters

## Shortcuts

| Shortcut             | Action                 |
| -------------------- | ---------------------- |
| `Ctrl/Cmd+N`         | New document           |
| `Ctrl/Cmd+O`         | Open documents         |
| `Ctrl/Cmd+S`         | Save                   |
| `Ctrl/Cmd+Shift+S`   | Save As                |
| `Ctrl/Cmd+W`         | Close document         |
| `Ctrl/Cmd+Tab`       | Next document          |
| `Ctrl/Cmd+Shift+Tab` | Previous document      |
| `Ctrl/Cmd+Shift+T`   | Reopen closed document |
| `Ctrl/Cmd+B`         | Toggle Explorer        |
| `Ctrl/Cmd+Shift+P`   | Command Palette        |
| `Ctrl/Cmd+1`         | Edit mode              |
| `Ctrl/Cmd+2`         | Preview to Side        |
| `Ctrl/Cmd+3`         | Preview mode           |

CodeMirror provides standard editor shortcuts such as `Ctrl/Cmd+F`, undo, redo, and selection commands.

## Development

### Requirements

- Node.js 24 or newer
- Rust stable
- Tauri v2 platform prerequisites

```bash
npm ci
npm run tauri dev
```

## Quality Checks

```bash
npm run check
cd src-tauri
cargo fmt --check
cargo test
cargo clippy --all-targets -- -D warnings
```

## Build

```bash
npm run tauri build
```

The product requirements and remaining roadmap are documented in [`docs/PRD.md`](docs/PRD.md).

## Security

Markdown files are treated as untrusted input. Raw HTML is disabled, generated preview markup is sanitized, Mermaid runs in strict mode, remote preview resources are blocked by CSP, and filesystem mutations are handled by explicit native commands.

Security issues should be reported privately to the repository owner rather than opened as public exploit reports.

## License

MIT
