import { computeRename } from '../src/rename';

const FILES: Record<string, string> = {
  'src/auth.ts': 'export function validateToken(t: string) { return checkToken(t); }\nfunction checkToken(t: string) { return t.length > 0; }',
  'src/server.ts': 'import { validateToken } from "./auth";\nif (!validateToken(req.headers.token)) throw new Error();',
};

test('computeRename finds all references to validateToken', () => {
  const result = computeRename(FILES, 'validateToken', 'verifyToken');
  expect(result.matches).toHaveLength(2); // auth.ts (definition) + server.ts (usage)
  expect(result.files_affected).toHaveLength(2);
});

test('computeRename uses whole-word match only', () => {
  const files = { 'a.ts': 'const validateTokenFoo = 1; const validateToken = 2;' };
  const result = computeRename(files, 'validateToken', 'verifyToken');
  expect(result.matches).toHaveLength(1); // only the exact match, not validateTokenFoo
});
