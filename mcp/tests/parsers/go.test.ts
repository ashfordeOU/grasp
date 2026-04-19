import { parseGoImports } from '../../src/parsers/go';

test('parses single import', () => {
  const src = `package main\nimport "fmt"\nfunc main() {}`;
  const result = parseGoImports(src, 'main.go');
  expect(result.imports).toContainEqual(expect.objectContaining({ path: 'fmt', stdlib: true }));
});

test('parses grouped import block', () => {
  const src = `package main\nimport (\n  "fmt"\n  "github.com/pkg/errors"\n)\n`;
  const result = parseGoImports(src, 'main.go');
  const paths = result.imports.map(i => i.path);
  expect(paths).toContain('fmt');
  expect(paths).toContain('github.com/pkg/errors');
});

test('parses aliased import', () => {
  const src = `import myalias "github.com/example/pkg"`;
  const result = parseGoImports(src, 'main.go');
  const imp = result.imports.find(i => i.path === 'github.com/example/pkg');
  expect(imp?.alias).toBe('myalias');
});

test('detects internal imports using module name', () => {
  const src = `import "github.com/myorg/myrepo/internal/auth"`;
  const result = parseGoImports(src, 'cmd/main.go', 'github.com/myorg/myrepo');
  const imp = result.imports.find(i => i.path === 'github.com/myorg/myrepo/internal/auth');
  expect(imp?.internal).toBe(true);
  expect(imp?.localPath).toBe('internal/auth');
});

test('marks stdlib imports', () => {
  const src = `import (\n  "os"\n  "net/http"\n  "github.com/external/pkg"\n)`;
  const result = parseGoImports(src, 'main.go');
  expect(result.imports.find(i => i.path === 'os')?.stdlib).toBe(true);
  expect(result.imports.find(i => i.path === 'github.com/external/pkg')?.stdlib).toBe(false);
});
