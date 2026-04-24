interface GrammarEntry {
  wasmFile: string;
  nodeModule: string;
}

export const GRAMMAR_REGISTRY: Record<string, GrammarEntry> = {
  python:  { wasmFile: 'tree-sitter-python.wasm',   nodeModule: 'tree-sitter-python'  },
  go:      { wasmFile: 'tree-sitter-go.wasm',       nodeModule: 'tree-sitter-go'      },
  java:    { wasmFile: 'tree-sitter-java.wasm',     nodeModule: 'tree-sitter-java'    },
  kotlin:  { wasmFile: 'tree-sitter-kotlin.wasm',   nodeModule: 'tree-sitter-kotlin'  },
  rust:    { wasmFile: 'tree-sitter-rust.wasm',     nodeModule: 'tree-sitter-rust'    },
  c:       { wasmFile: 'tree-sitter-c.wasm',        nodeModule: 'tree-sitter-c'       },
  cpp:     { wasmFile: 'tree-sitter-cpp.wasm',      nodeModule: 'tree-sitter-cpp'     },
  csharp:  { wasmFile: 'tree-sitter-c_sharp.wasm',  nodeModule: 'tree-sitter-c-sharp' },
  ruby:       { wasmFile: 'tree-sitter-ruby.wasm',       nodeModule: 'tree-sitter-ruby'       },
  javascript: { wasmFile: 'tree-sitter-javascript.wasm', nodeModule: 'tree-sitter-javascript' },
  typescript: { wasmFile: 'tree-sitter-typescript.wasm', nodeModule: 'tree-sitter-typescript' },
  tsx:        { wasmFile: 'tree-sitter-tsx.wasm',        nodeModule: 'tree-sitter-typescript' },
};

export const EXT_TO_LANG: Record<string, string> = {
  '.py': 'python', '.pyw': 'python', '.pyi': 'python',
  '.go': 'go',
  '.java': 'java',
  '.kt': 'kotlin', '.kts': 'kotlin',
  '.rs': 'rust',
  '.c': 'c', '.h': 'c',
  '.cpp': 'cpp', '.cc': 'cpp', '.hpp': 'cpp',
  '.cs': 'csharp',
  '.rb': 'ruby',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'tsx',
};
