import { parseTsconfig, resolveTsImport, TsconfigEntry } from '../src/tsconfig-resolver';

describe('parseTsconfig', () => {
  it('parses simple @/* → src/* mapping', () => {
    const json = `{
      "compilerOptions": {
        "baseUrl": ".",
        "paths": {
          "@/*": ["src/*"]
        }
      }
    }`;
    const out = parseTsconfig(json, '/repo');
    expect(out).not.toBeNull();
    expect(out!.baseUrl).toBe('/repo');
    expect(out!.paths['@/*']).toEqual(['src/*']);
  });

  it('handles multiple paths in same config', () => {
    const json = `{
      "compilerOptions": {
        "baseUrl": "./",
        "paths": {
          "@/*": ["src/*"],
          "@components/*": ["src/components/*"],
          "@utils": ["src/utils/index.ts"]
        }
      }
    }`;
    const out = parseTsconfig(json, '/repo');
    expect(out).not.toBeNull();
    expect(Object.keys(out!.paths).length).toBe(3);
    expect(out!.paths['@components/*']).toEqual(['src/components/*']);
    expect(out!.paths['@utils']).toEqual(['src/utils/index.ts']);
  });

  it('resolves nested baseUrl relative to tsconfig dir', () => {
    const json = `{
      "compilerOptions": {
        "baseUrl": "./src",
        "paths": { "@/*": ["*"] }
      }
    }`;
    const out = parseTsconfig(json, '/repo/packages/web');
    expect(out!.baseUrl).toBe('/repo/packages/web/src');
  });

  it('tolerates // and /* */ comments and trailing commas', () => {
    const json = `{
      // top comment
      "compilerOptions": {
        /* block comment */
        "baseUrl": ".",
        "paths": {
          "@/*": ["src/*"], // trailing inline comment
        },
      },
    }`;
    const out = parseTsconfig(json, '/repo');
    expect(out).not.toBeNull();
    expect(out!.paths['@/*']).toEqual(['src/*']);
  });

  it('returns null when no compilerOptions block', () => {
    expect(parseTsconfig('{}', '/repo')).toBeNull();
    expect(parseTsconfig('{"include": ["src"]}', '/repo')).toBeNull();
  });

  it('returns null on invalid JSON', () => {
    expect(parseTsconfig('{ not json', '/repo')).toBeNull();
  });
});

describe('resolveTsImport', () => {
  const cfg: TsconfigEntry = {
    baseUrl: 'src',
    paths: {
      '@/*': ['*'],
      '@components/*': ['components/*'],
      '@utils': ['utils/index.ts'],
    },
    configDir: '.',
  };

  it('resolves @/components/Button → src/components/Button', () => {
    expect(resolveTsImport('@/components/Button', [cfg])).toBe('src/components/Button');
  });

  it('resolves @components/Header → src/components/Header', () => {
    expect(resolveTsImport('@components/Header', [cfg])).toBe('src/components/Header');
  });

  it('resolves exact (no-star) @utils → src/utils/index.ts', () => {
    expect(resolveTsImport('@utils', [cfg])).toBe('src/utils/index.ts');
  });

  it('returns null when no pattern matches', () => {
    expect(resolveTsImport('react', [cfg])).toBeNull();
    expect(resolveTsImport('@unknown/foo', [cfg])).toBeNull();
  });

  it('walks tsconfig list in order (most-specific first)', () => {
    const inner: TsconfigEntry = {
      baseUrl: 'packages/web/src',
      paths: { '@/*': ['*'] },
      configDir: 'packages/web',
    };
    const root: TsconfigEntry = {
      baseUrl: 'src',
      paths: { '@/*': ['*'] },
      configDir: '.',
    };
    expect(resolveTsImport('@/foo', [inner, root])).toBe('packages/web/src/foo');
  });
});
