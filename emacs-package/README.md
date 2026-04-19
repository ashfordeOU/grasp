# Grasp — Emacs Package

Dependency graph, health score, and security scanner for your codebase, integrated into Emacs.

## Requirements

- Emacs 27.1+
- Grasp CLI: `npm install -g grasp-mcp-server`

## Installation

### MELPA (recommended)

```emacs-lisp
(use-package grasp
  :ensure t
  :hook (prog-mode . grasp-mode))
```

Or with `package-install`:

```
M-x package-install RET grasp RET
```

### straight.el

```emacs-lisp
(use-package grasp
  :straight (:host github :repo "ashfordeOU/grasp"
             :files ("emacs-package/grasp.el"))
  :hook (prog-mode . grasp-mode))
```

### Manual

```bash
cp emacs-package/grasp.el ~/.emacs.d/lisp/grasp.el
```

Then in your `init.el`:

```emacs-lisp
(add-to-list 'load-path "~/.emacs.d/lisp")
(require 'grasp)
```

## Usage

Enable `grasp-mode` in any buffer:

```
M-x grasp-mode
```

Or enable globally for all programming modes:

```emacs-lisp
(add-hook 'prog-mode-hook #'grasp-mode)
```

## Key Bindings (grasp-mode)

| Key | Command | Description |
|-----|---------|-------------|
| `C-c g a` | `grasp-analyze` | Analyse the current project |
| `C-c g d` | `grasp-show-deps` | Show dependencies for current file |
| `C-c g h` | `grasp-show-health` | Show health score for current file |

## Commands

- `M-x grasp-analyze` — Run full project analysis (opens `*Grasp Analysis*` buffer)
- `M-x grasp-show-deps` — Show file dependencies in minibuffer
- `M-x grasp-show-health` — Show file health score in minibuffer

## Configuration

```emacs-lisp
(use-package grasp
  :custom
  ;; Path to grasp executable (default: "grasp")
  (grasp-executable "grasp")
  ;; Auto-analyze on save (default: nil)
  (grasp-auto-analyze nil))
```

## Testing

Tests use ERT (built into Emacs):

```bash
emacs --batch \
  -l emacs-package/grasp.el \
  -l emacs-package/test/test-grasp.el \
  -f ert-run-tests-batch-and-exit
```

## License

Elastic License 2.0 — see [LICENSE](../LICENSE)
