import TreeSitter from 'tree-sitter';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const BashGrammar = require('tree-sitter-bash');
import { extractDefinitions, countCalls, countBranches } from '../../src/tree-sitter/extractors/bash';

const GOLDEN = `#!/usr/bin/env bash
function deploy() {
  build
  cleanup
}

cleanup() {
  rm -rf /tmp/x
}

if [ -n "$1" ]; then
  deploy
fi
`;

describe('Bash extractor', () => {
  let parser: TreeSitter;
  beforeAll(() => { parser = new TreeSitter(); parser.setLanguage(BashGrammar); });

  test('extracts function definitions (both syntaxes)', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'deploy.sh');
      const names = fns.map((f) => f.name);
      expect(names).toContain('deploy');
      expect(names).toContain('cleanup');
      expect(fns.every((f) => f.astBacked)).toBe(true);
    } finally { if (typeof (tree as any).delete === "function") (tree as any).delete(); }
  });

  test('counts calls to known functions', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const calls = countCalls(tree, new Set(['deploy', 'cleanup', 'build']));
      expect(calls.deploy).toBeGreaterThanOrEqual(1);
      expect(calls.cleanup).toBeGreaterThanOrEqual(1);
    } finally { if (typeof (tree as any).delete === "function") (tree as any).delete(); }
  });

  test('counts branches', () => {
    const tree = parser.parse(GOLDEN);
    try { expect(countBranches(tree)).toBeGreaterThanOrEqual(1); } finally { if (typeof (tree as any).delete === "function") (tree as any).delete(); }
  });
});
