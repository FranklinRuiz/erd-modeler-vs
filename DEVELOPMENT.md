# Developing SchemaCraft

Notes for contributors working on the extension itself. For what SchemaCraft does and how to use it, see [README.md](./README.md).

## Project layout

- `src/extension.ts` — extension host. Registers `erdModeler.diagramEditor` as a `CustomTextEditorProvider` for `*.asto` files: it owns the `vscode.TextDocument` (the file's JSON text is the single source of truth) and keeps the webview in sync with it.
- `webview-ui/` — the React/Vite app (copied from the standalone `erd-modeler` project), plus:
  - `src/lib/vscode-bridge.ts` — detects whether it's running inside a VS Code webview.
  - `src/hooks/use-vscode-bridge.ts` — on load, hydrates the store from the document's JSON text; on every edit (debounced 400ms), serializes the active diagram and posts it back to the extension host, which applies it to the document via `WorkspaceEdit`. That's what makes `Ctrl+S` and the tab's dirty dot work — they're VS Code's normal document machinery, not anything custom-built here.
  - `src/utils/export.ts` — serializes/parses the `.asto` JSON format used for document sync.

## First-time setup

```sh
npm install
npm run build:webview   # installs webview-ui deps and builds webview-ui/dist
npm run compile         # bundles src/extension.ts -> dist/extension.js
```

## Debugging

Open this folder in VS Code and press **F5** (`Run Extension`). This launches an Extension Development Host with the extension loaded. `F5` only rebuilds the extension host (fast); if you change files under `webview-ui/src`, re-run `npm run build:webview` first.

In the dev host:
- **Right-click a folder in Explorer → "SchemaCraft: New Diagram..."** (or run it from `Ctrl+Shift+P`) — prompts for a filename, creates an empty `.asto` file, and opens it.
- **Double-click any `.asto` file** in Explorer — opens it with the SchemaCraft editor (it's the default editor for that extension).
- **`SchemaCraft: Open Diagram File...`** (`Ctrl+Shift+P`) — file picker alternative to double-clicking in Explorer.
- **`Ctrl+S`** saves the file normally. **`Ctrl+Z`**/**`Ctrl+Shift+Z`** undo/redo through VS Code's document history (in addition to the app's own in-canvas undo for things like table drags).

## Packaging

```sh
npm run package   # builds webview + extension host, produces a .vsix via @vscode/vsce
```

## Known limitations

- No live-diff/merge UI for concurrent external edits to the same file (e.g. two VS Code windows, or a git checkout while the tab is open) — the webview just re-hydrates from the new text, discarding any not-yet-synced in-webview state. Fine for the common case (nobody else is editing while you have it open).
- The bundled JS is a single ~725KB chunk (not code-split) — fine for a local extension, would be worth splitting if this ever needs faster cold-open.
