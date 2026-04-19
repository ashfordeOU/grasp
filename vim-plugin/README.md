# Grasp — Vim Plugin

Dependency graph, health score, and security scanner for your codebase, integrated into Vim/Neovim.

## Requirements

- Vim 8.0+ or Neovim 0.5+
- Grasp CLI: `npm install -g grasp-mcp-server`

## Installation

### vim-plug

```vim
Plug 'ashfordeOU/grasp', { 'rtp': 'vim-plugin' }
```

### Vundle

```vim
Plugin 'ashfordeOU/grasp'
" After install, add to runtimepath:
set rtp+=~/.vim/bundle/grasp/vim-plugin
```

### Pathogen

```bash
cd ~/.vim/bundle
git clone https://github.com/ashfordeOU/grasp
# The plugin dir is inside vim-plugin/
ln -s ~/.vim/bundle/grasp/vim-plugin ~/.vim/bundle/grasp-vim
```

### Manual

Copy `plugin/grasp.vim` and `autoload/grasp.vim` into your Vim config directory:

```bash
cp plugin/grasp.vim ~/.vim/plugin/
cp autoload/grasp.vim ~/.vim/autoload/
```

## Commands

| Command | Description |
|---------|-------------|
| `:GraspAnalyze` | Analyse the current project |
| `:GraspDeps` | Show dependencies for the current file |
| `:GraspHealth` | Show health score for the current file |
| `:GraspBlast` | Show blast radius (files affected if this file changes) |

## Configuration

```vim
" Path to grasp executable (default: 'grasp')
let g:grasp_executable = 'grasp'

" Show health grade in statusline (default: 1)
let g:grasp_statusline = 1

" Auto-analyze on save (default: 0)
let g:grasp_auto_analyze = 0
```

## Statusline

The plugin adds `[Grasp:A]` (grade) to your statusline automatically when `g:grasp_statusline = 1`.

To use with a custom statusline:

```vim
let g:grasp_statusline = 0
set statusline+=%{grasp#statusline()}
```

## Testing

Tests use [Vader.vim](https://github.com/junegunn/vader.vim):

```bash
vim -u NONE \
  -c "source plugin/grasp.vim" \
  -c "Vader! test/test_grasp.vader" \
  -c "qa!"
```

## License

Elastic License 2.0 — see [LICENSE](../LICENSE)
