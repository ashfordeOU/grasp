// Tests for countBranches — AST-backed cyclomatic complexity decision-point counting.
// Each test verifies that the extractor counts branch nodes correctly and does NOT
// count keywords inside string literals (the key advantage over regex).

import TreeSitter from 'tree-sitter';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PythonGrammar = require('tree-sitter-python');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const GoGrammar = require('tree-sitter-go');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const JavaGrammar = require('tree-sitter-java');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const JSGrammar = require('tree-sitter-javascript');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TSGrammar = require('tree-sitter-typescript').typescript;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SwiftGrammar = require('tree-sitter-swift');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PHPGrammar = require('tree-sitter-php');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ScalaGrammar = require('tree-sitter-scala');

import { countBranches as pyBranches } from '../../src/tree-sitter/extractors/python';
import { countBranches as goBranches } from '../../src/tree-sitter/extractors/go';
import { countBranches as javaBranches } from '../../src/tree-sitter/extractors/java';
import { countBranches as jsBranches } from '../../src/tree-sitter/extractors/javascript';
import { countBranches as tsBranches } from '../../src/tree-sitter/extractors/typescript';
import { countBranches as swiftBranches } from '../../src/tree-sitter/extractors/swift';
import { countBranches as phpBranches } from '../../src/tree-sitter/extractors/php';
import { countBranches as scalaBranches } from '../../src/tree-sitter/extractors/scala';
import { countBranches as zigBranches } from '../../src/tree-sitter/extractors/zig';

function makeParser(grammar: unknown): TreeSitter {
  const p = new TreeSitter();
  p.setLanguage(grammar as TreeSitter.Language);
  return p;
}

describe('countBranches — null safety', () => {
  test('python: null tree returns 0', () => expect(pyBranches(null as any)).toBe(0));
  test('go: null tree returns 0', () => expect(goBranches(null as any)).toBe(0));
  test('java: null tree returns 0', () => expect(javaBranches(null as any)).toBe(0));
  test('js: null tree returns 0', () => expect(jsBranches(null as any)).toBe(0));
  test('ts: null tree returns 0', () => expect(tsBranches(null as any)).toBe(0));
  test('swift: null tree returns 0', () => expect(swiftBranches(null as any)).toBe(0));
  test('php: null tree returns 0', () => expect(phpBranches(null as any)).toBe(0));
  test('scala: null tree returns 0', () => expect(scalaBranches(null as any)).toBe(0));
  test('zig: null tree returns 0', () => expect(zigBranches(null as any)).toBe(0));
});

describe('countBranches — Python', () => {
  let p: TreeSitter;
  beforeAll(() => { p = makeParser(PythonGrammar); });

  test('counts if/elif/else/for/while', () => {
    const src = `
def foo(x):
    if x > 0:
        pass
    elif x < 0:
        pass
    for i in range(10):
        pass
    while x > 0:
        x -= 1
`;
    const t = p.parse(src);
    try { expect(pyBranches(t)).toBe(4); } finally { if ((t as any).delete) (t as any).delete(); }
  });

  test('does not count keywords inside strings', () => {
    const src = `x = "if x > 0 and y > 0 or z"`;
    const t = p.parse(src);
    try { expect(pyBranches(t)).toBe(0); } finally { if ((t as any).delete) (t as any).delete(); }
  });

  test('counts boolean_operator (and/or)', () => {
    const src = `
def foo(x, y):
    if x > 0 and y > 0:
        pass
`;
    const t = p.parse(src);
    // if_statement + boolean_operator
    try { expect(pyBranches(t)).toBeGreaterThanOrEqual(2); } finally { if ((t as any).delete) (t as any).delete(); }
  });

  test('empty source returns 0', () => {
    const t = p.parse('');
    try { expect(pyBranches(t)).toBe(0); } finally { if ((t as any).delete) (t as any).delete(); }
  });
});

describe('countBranches — Go', () => {
  let p: TreeSitter;
  beforeAll(() => { p = makeParser(GoGrammar); });

  test('counts if/for', () => {
    const src = `
package main
func foo(x int) int {
    if x > 0 {
        return 1
    }
    for i := 0; i < 10; i++ {}
    return 0
}
`;
    const t = p.parse(src);
    try { expect(goBranches(t)).toBe(2); } finally { if ((t as any).delete) (t as any).delete(); }
  });

  test('does not count keywords inside strings', () => {
    const src = `package main\nvar x = "if x > 0 && y > 0"`;
    const t = p.parse(src);
    try { expect(goBranches(t)).toBe(0); } finally { if ((t as any).delete) (t as any).delete(); }
  });
});

describe('countBranches — Java', () => {
  let p: TreeSitter;
  beforeAll(() => { p = makeParser(JavaGrammar); });

  test('counts if/for/while/catch', () => {
    const src = `
class Foo {
    void bar(int x) {
        if (x > 0) {}
        for (int i = 0; i < 10; i++) {}
        while (x > 0) { x--; }
        try {} catch (Exception e) {}
    }
}
`;
    const t = p.parse(src);
    try { expect(javaBranches(t)).toBe(4); } finally { if ((t as any).delete) (t as any).delete(); }
  });

  test('does not count keywords inside strings', () => {
    const src = `class Foo { String s = "if (x > 0 && y < 10) {}"; }`;
    const t = p.parse(src);
    try { expect(javaBranches(t)).toBe(0); } finally { if ((t as any).delete) (t as any).delete(); }
  });
});

describe('countBranches — JavaScript', () => {
  let p: TreeSitter;
  beforeAll(() => { p = makeParser(JSGrammar); });

  test('counts if/for/while/switch/catch/ternary/&&/||', () => {
    const src = `
function foo(x) {
    if (x > 0) {}
    for (let i = 0; i < 10; i++) {}
    while (x > 0) { x--; }
    const a = x > 0 ? 1 : 0;
    if (x > 0 && x < 10) {}
    if (x > 0 || x < 0) {}
    try {} catch (e) {}
    switch (x) { case 1: break; }
}
`;
    const t = p.parse(src);
    // if(1) + for(1) + while(1) + ternary(1) + if_with_&&(1 if_stmt + 1 &&) + if_with_||(1 if_stmt + 1 ||) + catch(1) + switch_case(1) = 9
    try { expect(jsBranches(t)).toBeGreaterThanOrEqual(8); } finally { if ((t as any).delete) (t as any).delete(); }
  });

  test('does not count keywords inside strings', () => {
    const src = `const msg = "if (x > 0 && y < 10) { while (true) {} }"`;
    const t = p.parse(src);
    try { expect(jsBranches(t)).toBe(0); } finally { if ((t as any).delete) (t as any).delete(); }
  });

  test('does not count keywords inside comments', () => {
    const src = `
// if (x > 0 && y < 10) {}
/* while (true) { for (;;) {} } */
function noop() {}
`;
    const t = p.parse(src);
    try { expect(jsBranches(t)).toBe(0); } finally { if ((t as any).delete) (t as any).delete(); }
  });
});

describe('countBranches — TypeScript', () => {
  let p: TreeSitter;
  beforeAll(() => { p = makeParser(TSGrammar); });

  test('counts if/for/while', () => {
    const src = `
function foo(x: number): number {
    if (x > 0) { return 1; }
    for (let i = 0; i < 10; i++) {}
    while (x > 0) { x--; }
    return 0;
}
`;
    const t = p.parse(src);
    try { expect(tsBranches(t)).toBe(3); } finally { if ((t as any).delete) (t as any).delete(); }
  });

  test('does not count keywords inside strings', () => {
    const src = `const s: string = "if (x > 0 && y > 0) { while (true) {} }"`;
    const t = p.parse(src);
    try { expect(tsBranches(t)).toBe(0); } finally { if ((t as any).delete) (t as any).delete(); }
  });
});

describe('countBranches — Swift', () => {
  let p: TreeSitter;
  beforeAll(() => { p = makeParser(SwiftGrammar); });

  test('counts if/for/while/guard', () => {
    const src = `
func foo(x: Int) -> Int {
    if x > 0 { return 1 }
    for i in 0..<10 { print(i) }
    while x > 0 { }
    guard x > 0 else { return 0 }
    return x
}
`;
    const t = p.parse(src);
    try { expect(swiftBranches(t)).toBe(4); } finally { if ((t as any).delete) (t as any).delete(); }
  });

  test('does not count keywords inside strings', () => {
    const src = `let s = "if x > 0 { while true { } }"`;
    const t = p.parse(src);
    try { expect(swiftBranches(t)).toBe(0); } finally { if ((t as any).delete) (t as any).delete(); }
  });
});

describe('countBranches — PHP', () => {
  let p: TreeSitter;
  beforeAll(() => {
    const mod = PHPGrammar;
    p = makeParser(mod.php ?? mod.php_only ?? mod);
  });

  test('counts if/for/foreach/while/catch', () => {
    const src = `<?php
function foo($x) {
    if ($x > 0) {}
    for ($i = 0; $i < 10; $i++) {}
    foreach ($arr as $v) {}
    while ($x > 0) { $x--; }
    try {} catch (Exception $e) {}
}
?>`;
    const t = p.parse(src);
    try { expect(phpBranches(t)).toBe(5); } finally { if ((t as any).delete) (t as any).delete(); }
  });

  test('does not count keywords inside strings', () => {
    const src = `<?php $s = "if ($x > 0 && $y < 10) { while (true) {} }"; ?>`;
    const t = p.parse(src);
    try { expect(phpBranches(t)).toBe(0); } finally { if ((t as any).delete) (t as any).delete(); }
  });
});

describe('countBranches — Scala', () => {
  let p: TreeSitter;
  beforeAll(() => { p = makeParser(ScalaGrammar); });

  test('counts if/for/while/match-cases', () => {
    const src = `
def foo(x: Int): Int = {
    if (x > 0) 1
    else {
        for (i <- 0 until 10) println(i)
        while (x > 0) { }
        x match {
            case 1 => 1
            case 2 => 2
            case _ => 0
        }
    }
}
`;
    const t = p.parse(src);
    // if(1) + for(1) + while(1) + 3 case_clause = 6
    try { expect(scalaBranches(t)).toBe(6); } finally { if ((t as any).delete) (t as any).delete(); }
  });

  test('does not count keywords inside strings', () => {
    const src = `val s = "if (x > 0 && y > 0) { while (true) {} }"`;
    const t = p.parse(src);
    try { expect(scalaBranches(t)).toBe(0); } finally { if ((t as any).delete) (t as any).delete(); }
  });
});
