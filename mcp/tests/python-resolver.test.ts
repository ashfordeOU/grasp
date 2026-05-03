import { resolvePythonImport } from '../src/python-resolver';

describe('resolvePythonImport', () => {
  it('resolves single-dot relative: from .utils import x → pkg/utils.py', () => {
    const files = ['pkg/__init__.py', 'pkg/main.py', 'pkg/utils.py'];
    expect(resolvePythonImport('pkg/main.py', '.utils', files)).toBe('pkg/utils.py');
  });

  it('resolves single-dot to subpackage __init__.py', () => {
    const files = ['pkg/__init__.py', 'pkg/main.py', 'pkg/utils/__init__.py'];
    expect(resolvePythonImport('pkg/main.py', '.utils', files)).toBe('pkg/utils/__init__.py');
  });

  it('resolves double-dot relative: from ..core import y → core.py', () => {
    const files = ['pkg/sub/__init__.py', 'pkg/sub/main.py', 'pkg/core.py', 'pkg/__init__.py'];
    expect(resolvePythonImport('pkg/sub/main.py', '..core', files)).toBe('pkg/core.py');
  });

  it('resolves package import: from pkg import module → pkg/module.py', () => {
    const files = ['app/main.py', 'pkg/__init__.py', 'pkg/module.py'];
    expect(resolvePythonImport('app/main.py', 'pkg.module', files)).toBe('pkg/module.py');
  });

  it('resolves dotted package import to __init__.py', () => {
    const files = ['app/main.py', 'pkg/__init__.py', 'pkg/sub/__init__.py'];
    expect(resolvePythonImport('app/main.py', 'pkg.sub', files)).toBe('pkg/sub/__init__.py');
  });

  it('returns null when no file matches', () => {
    const files = ['pkg/main.py'];
    expect(resolvePythonImport('pkg/main.py', '.nonexistent', files)).toBeNull();
    expect(resolvePythonImport('pkg/main.py', 'unknown.module', files)).toBeNull();
  });

  it('returns null when relative dots exceed directory depth', () => {
    const files = ['main.py'];
    expect(resolvePythonImport('main.py', '..core', files)).toBeNull();
  });
});
