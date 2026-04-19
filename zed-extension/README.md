# Grasp — Zed Extension

Dependency graph, health score, and security scanner for your codebase, integrated into [Zed](https://zed.dev).

## Requirements

- [Zed](https://zed.dev) editor
- Grasp CLI: `npm install -g grasp-mcp-server`

## Installation

### From Zed Extension Marketplace

1. Open Zed and press `Cmd+Shift+P` (macOS) or `Ctrl+Shift+P` (Linux)
2. Run **Extensions: Install Extension**
3. Search for **Grasp** and click Install

### Manual Installation

1. Clone this repository or download the extension directory
2. In Zed, open the Command Palette and run **Extensions: Install Dev Extension**
3. Select the `zed-extension/` directory

## Features

- **Language Server Integration** — Grasp runs as a language server via `grasp-mcp --lsp`
- **Dependency Graph** — Visualise module dependencies directly in Zed
- **Health Score** — File-level and project-level architecture health metrics
- **Security Scanner** — Detect vulnerable dependency patterns

## Configuration

Add to your Zed `settings.json`:

```json
{
  "lsp": {
    "grasp": {
      "initialization_options": {
        "auto_analyze": true,
        "health_threshold": 70
      }
    }
  }
}
```

## Building from Source

Requires Rust with the `wasm32-wasi` target:

```bash
rustup target add wasm32-wasi
cargo build --target wasm32-wasi --release
```

## License

Elastic License 2.0 — see [LICENSE](../LICENSE)
