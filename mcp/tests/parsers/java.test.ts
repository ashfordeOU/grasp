import { parseJavaImports } from '../../src/parsers/java';

test('parses standard import', () => {
  const src = `package com.example.service;\nimport com.example.model.User;\npublic class UserService {}`;
  const result = parseJavaImports(src, 'UserService.java');
  expect(result.imports.some(i => i.className === 'User' && i.package === 'com.example.model')).toBe(true);
});

test('parses static import', () => {
  const src = `import static com.example.Utils.helperMethod;`;
  const result = parseJavaImports(src, 'MyClass.java');
  expect(result.imports[0].isStatic).toBe(true);
  expect(result.imports[0].className).toBe('helperMethod');
});

test('parses wildcard import', () => {
  const src = `import com.example.model.*;`;
  const result = parseJavaImports(src, 'MyClass.java');
  expect(result.imports[0].wildcard).toBe(true);
  expect(result.imports[0].package).toBe('com.example.model');
});

test('detects package declaration', () => {
  const src = `package com.example.service;`;
  const result = parseJavaImports(src, 'MyClass.java');
  expect(result.packageName).toBe('com.example.service');
});

test('marks java.* imports as stdlib', () => {
  const src = `import java.util.List;\nimport javax.inject.Inject;`;
  const result = parseJavaImports(src, 'MyClass.java');
  expect(result.imports.every(i => i.stdlib)).toBe(true);
});
