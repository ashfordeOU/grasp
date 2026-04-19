# Grasp Neovim Plugin

Architecture intelligence for Neovim. Calls the `grasp` CLI as a subprocess.

## Requirements
- Neovim 0.9+
- `grasp` CLI: `npm install -g grasp-mcp-server`

## Install

**lazy.nvim:**
```lua
{ 'ashfordeOU/grasp', rtp = 'neovim-plugin' }
```

## Commands

| Command | Description |
|---|---|
| `:GraspAnalyze` | Analyze cwd, show health in floating window |
| `:GraspHotspots` | Top 10 hotspot files by complexity |
| `:GraspDeps` | Deps/dependents for file under cursor |
| `:GraspStale` | Files with no recent changes |

## Statusline

```lua
-- lualine:
sections = { lualine_x = { require('grasp').health_score } }
```
