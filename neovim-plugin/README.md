# Grasp Neovim Plugin

Architecture intelligence for Neovim. Calls the `grasp` CLI as a subprocess.

## Requirements
- Neovim 0.9+
- `grasp` CLI: `npm install -g grasp-mcp-server`

## Installation

### lazy.nvim
```lua
{ 'ashfordeOU/grasp', branch = 'main', config = true, ft = {'javascript','typescript','python','go','rust'} }
```

### packer.nvim
```lua
use { 'ashfordeOU/grasp', config = function() require('grasp').setup() end }
```

## Commands
| Command | Action |
|---------|--------|
| `:GraspAnalyze` | Analyse current workspace |
| `:GraspOpen` | Open graph in browser |
| `:GraspHotspots` | List top 10 hotspot files |
| `:GraspDeps` | Show deps for current file |

## All Commands

| Command | Description |
|---|---|
| `:GraspAnalyze` | Analyze cwd, show health in floating window |
| `:GraspHotspots` | Top 10 hotspot files (uses cached result) |
| `:GraspDeps` | Deps for current file (uses cached result) |
| `:GraspStale` | Files with no recent changes |

## Statusline

```lua
-- lualine:
sections = { lualine_x = { require('grasp').health_score } }
```
