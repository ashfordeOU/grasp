import { parseRustImports } from '../../src/parsers/rust';

test('parses crate-relative use statement', () => {
  const src = `use crate::auth::User;\nfn main() {}`;
  const result = parseRustImports(src, 'src/main.rs');
  expect(result.imports.some(i => i.module === 'auth' && i.internal)).toBe(true);
});

test('marks std imports as stdlib', () => {
  const src = `use std::collections::HashMap;`;
  const result = parseRustImports(src, 'src/lib.rs');
  expect(result.imports[0].stdlib).toBe(true);
});

test('parses extern crate', () => {
  const src = `extern crate serde;`;
  const result = parseRustImports(src, 'src/lib.rs');
  expect(result.imports.some(i => i.module === 'serde' && !i.stdlib)).toBe(true);
});

test('detects mod declarations', () => {
  const src = `mod auth;\nmod utils;`;
  const result = parseRustImports(src, 'src/lib.rs');
  expect(result.submodules).toContain('auth');
  expect(result.submodules).toContain('utils');
});

test('parses pub use re-exports', () => {
  const src = `pub use crate::db::Connection;`;
  const result = parseRustImports(src, 'src/lib.rs');
  const imp = result.imports.find(i => i.module === 'db');
  expect(imp?.reExport).toBe(true);
});
