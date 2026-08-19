# SchemaCraft

**Design, visualize, and export SQL Server database schemas — without ever leaving VS Code.**

SchemaCraft brings a full visual ER (Entity-Relationship) diagram editor straight into your editor. Model tables, define relationships, and preview the generated SQL — all next to your code, with no external tools, no browser tabs, no context switching.

## ✨ Features

- 🎨 **Visual schema design** — build your database model on an interactive drag-and-drop canvas: tables, columns, keys, and relationships
- 🧩 **Native VS Code editor experience** — `.asto` diagram files behave like any other file: real `Ctrl+S`, a dirty-state indicator, full undo/redo, and hot exit
- 🗄️ **Live T-SQL preview** — instantly see the Microsoft SQL Server–compatible DDL generated from your diagram, ready to copy
- 🧬 **DBML preview** — generate `dbdiagram.io`-compatible DBML for documentation or sharing, one click to copy
- 🗂️ **Multi-diagram workspace** — create, switch between, duplicate, or delete diagrams without breaking flow
- ⚡ **Fast and lightweight** — runs entirely inside VS Code with no external services, accounts, or network calls required
- 🔒 **Local-first by design** — your diagrams are plain files in your workspace, versioned with the rest of your code

## Getting Started

1. Right-click a folder in Explorer → **SchemaCraft: New Diagram...**
2. Design your schema visually — add tables, columns, and relationships
3. Save with `Ctrl+S`, just like any other file
4. Open **SQL Preview** or **DBML** in the toolbar to see and copy the generated code

## One file = one diagram

Each `.asto` file backs exactly one diagram, always open as its own editor tab — so it fits naturally into your existing project structure and version control.

## Contributing

See [DEVELOPMENT.md](./DEVELOPMENT.md) for project layout, local setup, debugging, and packaging.
