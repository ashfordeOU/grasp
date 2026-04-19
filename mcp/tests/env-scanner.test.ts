import { scanEnvVars } from '../src/env-scanner';

const files = [
  { path: 'src/config.ts', content: "const x = process.env.DB_URL;\nconst y = process.env.SECRET_KEY;", layer: 'config', isTest: false },
  { path: 'src/api.ts', content: "process.env.API_KEY", layer: 'services', isTest: false },
  { path: 'tests/api.test.ts', content: "process.env.TEST_ONLY_VAR", layer: 'test', isTest: true },
];
const envExample = ['DB_URL'];

test('finds all env vars with file and layer', () => {
  const result = scanEnvVars(files, envExample);
  expect(result.vars.map(v => v.name).sort()).toEqual(['API_KEY', 'DB_URL', 'SECRET_KEY', 'TEST_ONLY_VAR'].sort());
});

test('marks undocumented vars', () => {
  const result = scanEnvVars(files, envExample);
  const undoc = result.vars.filter(v => !v.inEnvExample).map(v => v.name).sort();
  expect(undoc).toEqual(['API_KEY', 'SECRET_KEY', 'TEST_ONLY_VAR'].sort());
});

test('marks test-only vars', () => {
  const result = scanEnvVars(files, envExample);
  const testOnly = result.vars.filter(v => v.testOnly).map(v => v.name);
  expect(testOnly).toEqual(['TEST_ONLY_VAR']);
});
