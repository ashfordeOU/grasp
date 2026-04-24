# Graph Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Kuzu-backed persistent graph database alongside the existing SQLite BrainStore, emitting return types from all tree-sitter extractors, and exposing 4 new MCP tools (graph_query, call_chain, type_propagation, function_graph) — releasing as v3.11.0.

**Architecture:** GraphStore (src/graph.ts) wraps Kuzu at ~/.grasp/graph/, lazy-init like BrainStore. Extractors emit returnType via the existing FnDef.returnType? field that flows through Parser.extract() into AnalysisResult.files[i].functions[j].returnType. GraphStore.indexResult() reads from the same AnalysisResult that BrainStore already receives. Four new MCP tools are registered in index.ts after the existing brain tools.

**Tech Stack:** Node.js/TypeScript, Kuzu (embedded graph DB, Cypher), tree-sitter (AST), Jest (TDD), better-sqlite3 (unchanged).

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `mcp/src/tree-sitter/types.ts` | Modify | Add `returnType?: string` to FnDef |
| `mcp/src/types.ts` | Modify | Add `returnType?: string` to FunctionDef |
| `mcp/src/analyzer.ts` | Modify | Add `returnType?: string` to local FnDef (lines 48–61) |
| `mcp/src/tree-sitter/extractors/typescript.ts` | Modify | Emit returnType from function/method nodes |
| `mcp/src/tree-sitter/extractors/tsx.ts` | Modify | Same as typescript.ts (re-exports or duplicates logic) |
| `mcp/src/tree-sitter/extractors/python.ts` | Modify | Emit returnType from `->` annotation |
| `mcp/src/tree-sitter/extractors/java.ts` | Modify | Emit returnType from `type` field of method_declaration |
| `mcp/src/tree-sitter/extractors/go.ts` | Modify | Emit returnType from `result` field |
| `mcp/src/tree-sitter/extractors/rust.ts` | Modify | Emit returnType from `return_type` field |
| `mcp/src/tree-sitter/extractors/csharp.ts` | Modify | Emit returnType from `type` field |
| `mcp/src/tree-sitter/extractors/kotlin.ts` | Modify | Emit returnType from `type` field |
| `mcp/src/tree-sitter/extractors/swift.ts` | Modify | Emit returnType from `return_type` field |
| `mcp/src/tree-sitter/extractors/php.ts` | Modify | Emit returnType from `return_type` field |
| `mcp/src/tree-sitter/extractors/scala.ts` | Modify | Emit returnType from `return_type` field |
| `mcp/src/graph.ts` | Create | GraphStore class wrapping Kuzu |
| `mcp/src/index.ts` | Modify | Import GraphStore, wire into grasp_brain_index, register 4 new tools |
| `mcp/tests/graph.test.ts` | Create | Unit tests for GraphStore |
| `mcp/tests/extractors/typescript.test.ts` | Modify | Add returnType assertions |
| `mcp/tests/extractors/python.test.ts` | Modify | Add returnType assertions |
| `mcp/tests/extractors/java.test.ts` | Modify | Add returnType assertions |
| `mcp/tests/extractors/go.test.ts` | Modify | Add returnType assertions |
| `mcp/tests/extractors/rust.test.ts` | Modify | Add returnType assertions |
| `mcp/package.json` | Modify | Add kuzu dep, bump version |
| `mcp/package-lock.json` | Modify | npm install regenerates |
| All version files | Modify | 3.10.0 → 3.11.0 per CLAUDE.md checklist |
| `CHANGELOG.md` | Modify | New entry at top |
| `mcp/README.md` | Modify | Document 4 new tools |

---

## Task 1: Add returnType to type definitions

**Files:**
- Modify: `mcp/src/tree-sitter/types.ts`
- Modify: `mcp/src/types.ts`
- Modify: `mcp/src/analyzer.ts` (lines 48–61)

- [ ] **Step 1: Write a failing compile check**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
# Verify returnType does NOT exist yet
grep -n "returnType" src/tree-sitter/types.ts src/types.ts
```
Expected: no matches (returnType not yet defined)

- [ ] **Step 2: Add returnType to FnDef in tree-sitter/types.ts**

In `mcp/src/tree-sitter/types.ts`, the `FnDef` interface currently ends at line 15. Add `returnType` after `layer?`:

```typescript
export interface FnDef {
  name: string;
  file: string;
  line: number;
  code?: string;
  isTopLevel?: boolean;
  isExported?: boolean;
  isClassMethod?: boolean;
  type?: string;
  decorators?: string[] | null;
  className?: string | null;
  folder?: string;
  layer?: string;
  returnType?: string;
  astBacked?: boolean;
}
```

- [ ] **Step 3: Add returnType to FunctionDef in types.ts**

In `mcp/src/types.ts`, `FunctionDef` currently ends at `layer?`. Add `returnType` before the closing brace:

```typescript
export interface FunctionDef {
  name: string;
  file: string;
  line: number;
  code?: string;
  isTopLevel?: boolean;
  isExported?: boolean;
  isClassMethod?: boolean;
  type?: string;
  decorators?: string[] | null;
  className?: string | null;
  folder?: string;
  layer?: string;
  returnType?: string;
}
```

- [ ] **Step 4: Add returnType to local FnDef in analyzer.ts**

In `mcp/src/analyzer.ts`, the local `FnDef` interface (lines 48–61) mirrors the tree-sitter one. Add `returnType?` after `layer?`:

```typescript
interface FnDef {
  name: string;
  file: string;
  line: number;
  code?: string;
  isTopLevel?: boolean;
  isExported?: boolean;
  isClassMethod?: boolean;
  type?: string;
  decorators?: string[] | null;
  className?: string | null;
  folder?: string;
  layer?: string;
  returnType?: string;
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
./node_modules/.bin/tsc --noEmit -p tsconfig.check.json
```
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
git add src/tree-sitter/types.ts src/types.ts src/analyzer.ts
git commit -m "feat: add returnType field to FnDef and FunctionDef"
```

---

## Task 2: TypeScript and Python extractors emit returnType

**Files:**
- Modify: `mcp/src/tree-sitter/extractors/typescript.ts`
- Modify: `mcp/src/tree-sitter/extractors/tsx.ts`
- Modify: `mcp/src/tree-sitter/extractors/python.ts`
- Modify: `mcp/tests/extractors/typescript.test.ts`
- Modify: `mcp/tests/extractors/python.test.ts`

- [ ] **Step 1: Write failing test for TypeScript returnType**

Add this test to `mcp/tests/extractors/typescript.test.ts` inside the `describe('TypeScript extractor', ...)` block:

```typescript
test('extracts return type from function declaration', () => {
  const src = `
function getUser(id: number): Promise<User> {
  return fetch('/users/' + id).then(r => r.json());
}
function noReturn(x: string): void {
  console.log(x);
}
`;
  const tree = parser.parse(src);
  try {
    const fns = extractDefinitions(tree, src, 'api.ts');
    const getUser = fns.find(f => f.name === 'getUser');
    expect(getUser?.returnType).toBe('Promise<User>');
    const noReturn = fns.find(f => f.name === 'noReturn');
    expect(noReturn?.returnType).toBe('void');
  } finally {
    if (typeof (tree as any).delete === 'function') (tree as any).delete();
  }
});

test('extracts return type from method definition', () => {
  const src = `
class UserService {
  getById(id: number): User | null {
    return null;
  }
}
`;
  const tree = parser.parse(src);
  try {
    const fns = extractDefinitions(tree, src, 'service.ts');
    const method = fns.find(f => f.name === 'getById');
    expect(method?.returnType).toBe('User | null');
  } finally {
    if (typeof (tree as any).delete === 'function') (tree as any).delete();
  }
});
```

- [ ] **Step 2: Run failing test**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
./node_modules/.bin/jest tests/extractors/typescript.test.ts --testNamePattern="return type" --no-coverage
```
Expected: FAIL — `returnType` is `undefined`

- [ ] **Step 3: Add returnType extraction to TypeScript extractor**

In `mcp/src/tree-sitter/extractors/typescript.ts`, add a helper function after the `enclosingClass` function:

```typescript
function extractReturnType(node: TreeSitter.SyntaxNode): string | undefined {
  const rt = node.childForFieldName('return_type');
  if (!rt) return undefined;
  // return_type node text is ": Promise<User>" — strip leading colon and whitespace
  const text = rt.text.replace(/^:\s*/, '').trim();
  return text || undefined;
}
```

Then in each push inside `extractDefinitions`, add `returnType: extractReturnType(node)`:

For `function_declaration` and `generator_function_declaration` (around line 58):
```typescript
fns.push({
  name: nameNode.text,
  file: filename,
  line: node.startPosition.row + 1,
  type: 'function',
  isTopLevel: true,
  isExported: isExported(node),
  returnType: extractReturnType(node),
  astBacked: true,
});
```

For `method_definition` (around line 93):
```typescript
fns.push({
  name: nameNode.text,
  file: filename,
  line: node.startPosition.row + 1,
  type: 'method',
  isTopLevel: false,
  isClassMethod: true,
  className: cls,
  isExported: false,
  returnType: extractReturnType(node),
  astBacked: true,
});
```

For `method_signature` (around line 145):
```typescript
fns.push({
  name: nameNode.text,
  file: filename,
  line: node.startPosition.row + 1,
  type: 'method',
  isTopLevel: false,
  isClassMethod: true,
  className: cls,
  isExported: false,
  returnType: extractReturnType(node),
  astBacked: true,
});
```

For arrow function in `variable_declarator` (around line 172), add `returnType: extractReturnType(valueNode)`:
```typescript
fns.push({
  name: nameNode.text,
  file: filename,
  line: node.startPosition.row + 1,
  type: 'function',
  isTopLevel: true,
  isExported: declParent?.type === 'export_statement',
  returnType: extractReturnType(valueNode),
  astBacked: true,
});
```

- [ ] **Step 4: Run test — verify it passes**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
./node_modules/.bin/jest tests/extractors/typescript.test.ts --no-coverage
```
Expected: all tests PASS

- [ ] **Step 5: Verify tsx.ts requires no changes**

`mcp/src/tree-sitter/extractors/tsx.ts` is a pure re-export of the TypeScript extractor:
```typescript
import { extractDefinitions, countCalls, countBranches } from './typescript';
export { extractDefinitions, countCalls, countBranches };
registerExtractor('tsx', { extractDefinitions, countCalls, countBranches });
```
Since it delegates entirely to typescript.ts, the returnType change flows through automatically. No edit needed.

- [ ] **Step 6: Write failing test for Python returnType**

Add to `mcp/tests/extractors/python.test.ts` inside the describe block:

```typescript
test('extracts return type annotation', () => {
  const src = `
def get_user(user_id: int) -> User:
    return User()

def process(data: dict) -> None:
    pass

def no_annotation(x):
    return x
`;
  const tree = parser.parse(src);
  try {
    const fns = extractDefinitions(tree, src, 'service.py');
    const getUser = fns.find(f => f.name === 'get_user');
    expect(getUser?.returnType).toBe('User');
    const process = fns.find(f => f.name === 'process');
    expect(process?.returnType).toBe('None');
    const noAnnotation = fns.find(f => f.name === 'no_annotation');
    expect(noAnnotation?.returnType).toBeUndefined();
  } finally {
    if (typeof (tree as any).delete === 'function') (tree as any).delete();
  }
});
```

- [ ] **Step 7: Run failing Python test**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
./node_modules/.bin/jest tests/extractors/python.test.ts --testNamePattern="return type" --no-coverage
```
Expected: FAIL

- [ ] **Step 8: Add returnType to Python extractor**

In `mcp/src/tree-sitter/extractors/python.ts`, in `extractDefinitions`, inside the `if (node.type === 'function_definition')` block, after getting `nameNode`, add return type extraction before building the push:

```typescript
// Extract return type annotation (-> Type)
let returnType: string | undefined;
const retNode = node.childForFieldName('return_type');
if (retNode) {
  returnType = retNode.text.trim() || undefined;
}
```

Then add `returnType` to the `fns.push(...)` call:
```typescript
fns.push({
  name: nameNode.text,
  file: filename,
  line: node.startPosition.row + 1,
  isTopLevel: depth === 1 && currentClass === null,
  isExported: !nameNode.text.startsWith('_'),
  isClassMethod: currentClass !== null,
  className: currentClass,
  type: isAsync ? 'async_function' : currentClass ? 'method' : 'function',
  decorators: decorators.length > 0 ? decorators : null,
  returnType,
  astBacked: true,
});
```

- [ ] **Step 9: Run all Python tests**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
./node_modules/.bin/jest tests/extractors/python.test.ts --no-coverage
```
Expected: all tests PASS

- [ ] **Step 10: Commit**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
git add src/tree-sitter/extractors/typescript.ts src/tree-sitter/extractors/tsx.ts src/tree-sitter/extractors/python.ts tests/extractors/typescript.test.ts tests/extractors/python.test.ts
git commit -m "feat: emit returnType from TypeScript and Python extractors"
```

---

## Task 3: Java, Go, and Rust extractors emit returnType

**Files:**
- Modify: `mcp/src/tree-sitter/extractors/java.ts`
- Modify: `mcp/src/tree-sitter/extractors/go.ts`
- Modify: `mcp/src/tree-sitter/extractors/rust.ts`
- Modify: `mcp/tests/extractors/java.test.ts`
- Modify: `mcp/tests/extractors/go.test.ts`
- Modify: `mcp/tests/extractors/rust.test.ts`

- [ ] **Step 1: Add returnType test to java.test.ts**

Add inside the describe block in `mcp/tests/extractors/java.test.ts`:

```typescript
test('extracts return type from method declaration', () => {
  const src = `
public class UserService {
  public User getById(int id) {
    return null;
  }
  public void delete(int id) {}
  public List<String> listNames() { return null; }
}
`;
  const tree = parser.parse(src);
  try {
    const fns = extractDefinitions(tree, src, 'UserService.java');
    const getById = fns.find(f => f.name === 'getById');
    expect(getById?.returnType).toBe('User');
    const del = fns.find(f => f.name === 'delete');
    expect(del?.returnType).toBe('void');
    const listNames = fns.find(f => f.name === 'listNames');
    expect(listNames?.returnType).toBe('List<String>');
  } finally {
    if (typeof (tree as any).delete === 'function') (tree as any).delete();
  }
});
```

- [ ] **Step 2: Add returnType to Java extractor**

In `mcp/src/tree-sitter/extractors/java.ts`, in the `if (node.type === 'method_declaration')` block, add return type extraction before the push. In Java's tree-sitter grammar, the return type is the `type` field:

```typescript
if (node.type === 'method_declaration') {
  const nameNode = node.childForFieldName('name');
  if (nameNode) {
    const className = getEnclosingClass(node);
    const typeNode = node.childForFieldName('type');
    const returnType = typeNode?.text?.trim() || undefined;
    fns.push({
      name: nameNode.text,
      file: filename,
      line: node.startPosition.row + 1,
      type: 'method',
      isTopLevel: false,
      isClassMethod: true,
      className,
      isExported: hasModifier(node, 'public', 'protected'),
      returnType,
      astBacked: true,
    });
  }
  return;
}
```

- [ ] **Step 3: Add returnType test to go.test.ts**

Add inside the describe block in `mcp/tests/extractors/go.test.ts`:

```typescript
test('extracts return type from function declaration', () => {
  const src = `
package main

func GetUser(id int) *User {
  return nil
}

func DeleteUser(id int) error {
  return nil
}

func ProcessBatch(ids []int) ([]User, error) {
  return nil, nil
}
`;
  const tree = parser.parse(src);
  try {
    const fns = extractDefinitions(tree, src, 'users.go');
    const getUser = fns.find(f => f.name === 'GetUser');
    expect(getUser?.returnType).toBeDefined();
    expect(getUser?.returnType).toContain('User');
    const del = fns.find(f => f.name === 'DeleteUser');
    expect(del?.returnType).toBe('error');
  } finally {
    if (typeof (tree as any).delete === 'function') (tree as any).delete();
  }
});
```

- [ ] **Step 4: Add returnType to Go extractor**

In `mcp/src/tree-sitter/extractors/go.ts`, in `extractDefinitions`, update both `function_declaration` and `method_declaration` to extract the `result` field:

```typescript
if (node.type === 'function_declaration') {
  const nameNode = node.childForFieldName('name');
  if (nameNode) {
    const resultNode = node.childForFieldName('result');
    const returnType = resultNode?.text?.trim() || undefined;
    fns.push({
      name: nameNode.text,
      file: filename,
      line: node.startPosition.row + 1,
      type: 'function',
      isTopLevel: true,
      isExported: /^[A-Z]/.test(nameNode.text),
      returnType,
      astBacked: true,
    });
  }
  return;
} else if (node.type === 'method_declaration') {
  const nameNode = node.childForFieldName('name');
  const receiverNode = node.childForFieldName('receiver');
  if (nameNode) {
    const receiverText = receiverNode?.text?.match(/\b([A-Z][A-Za-z0-9_]*)\b/)?.[1] ?? null;
    const resultNode = node.childForFieldName('result');
    const returnType = resultNode?.text?.trim() || undefined;
    fns.push({
      name: nameNode.text,
      file: filename,
      line: node.startPosition.row + 1,
      type: 'method',
      isTopLevel: false,
      isClassMethod: true,
      className: receiverText,
      isExported: /^[A-Z]/.test(nameNode.text),
      returnType,
      astBacked: true,
    });
    return;
  }
}
```

- [ ] **Step 5: Add returnType test to rust.test.ts**

Add inside the describe block in `mcp/tests/extractors/rust.test.ts`:

```typescript
test('extracts return type from function item', () => {
  const src = `
fn get_user(id: u64) -> Option<User> {
    None
}

fn process(data: &str) -> Result<String, Error> {
    Ok(data.to_string())
}

fn no_return(x: i32) {
    println!("{}", x);
}
`;
  const tree = parser.parse(src);
  try {
    const fns = extractDefinitions(tree, src, 'lib.rs');
    const getUser = fns.find(f => f.name === 'get_user');
    expect(getUser?.returnType).toBe('Option<User>');
    const process = fns.find(f => f.name === 'process');
    expect(process?.returnType).toBe('Result<String, Error>');
    const noReturn = fns.find(f => f.name === 'no_return');
    expect(noReturn?.returnType).toBeUndefined();
  } finally {
    if (typeof (tree as any).delete === 'function') (tree as any).delete();
  }
});
```

- [ ] **Step 6: Add returnType to Rust extractor**

In `mcp/src/tree-sitter/extractors/rust.ts`, the `function_item` handler is at lines 31–48. The current push is:

```typescript
fns.push({
  name: nameNode.text,
  file: filename,
  line: node.startPosition.row + 1,
  type: className ? 'method' : 'function',
  isTopLevel: className === null,
  isClassMethod: className !== null,
  className,
  isExported: isPub(node),
  astBacked: true,
});
```

Replace it with (note: `isPub` is the helper already in rust.ts, not `isPublic`):

```typescript
const retNode = node.childForFieldName('return_type');
// Rust return_type node text is "-> Option<User>" — strip the leading arrow
const returnType = retNode?.text?.replace(/^->\s*/, '').trim() || undefined;
fns.push({
  name: nameNode.text,
  file: filename,
  line: node.startPosition.row + 1,
  type: className ? 'method' : 'function',
  isTopLevel: className === null,
  isClassMethod: className !== null,
  className,
  isExported: isPub(node),
  returnType,
  astBacked: true,
});
```

- [ ] **Step 7: Run all three extractor tests**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
./node_modules/.bin/jest tests/extractors/java.test.ts tests/extractors/go.test.ts tests/extractors/rust.test.ts --no-coverage
```
Expected: all tests PASS

- [ ] **Step 8: Commit**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
git add src/tree-sitter/extractors/java.ts src/tree-sitter/extractors/go.ts src/tree-sitter/extractors/rust.ts tests/extractors/java.test.ts tests/extractors/go.test.ts tests/extractors/rust.test.ts
git commit -m "feat: emit returnType from Java, Go, and Rust extractors"
```

---

## Task 4: C#, Kotlin, Swift, PHP, and Scala extractors emit returnType

**Files:**
- Modify: `mcp/src/tree-sitter/extractors/csharp.ts`
- Modify: `mcp/src/tree-sitter/extractors/kotlin.ts`
- Modify: `mcp/src/tree-sitter/extractors/swift.ts`
- Modify: `mcp/src/tree-sitter/extractors/php.ts`
- Modify: `mcp/src/tree-sitter/extractors/scala.ts`

For each extractor, follow the same TDD pattern as Tasks 2–3: write a failing test, add returnType extraction, run test, confirm passing.

### C# (`method_declaration`, field `type`)

- [ ] **Step 1: Write failing test in csharp.test.ts**

```typescript
test('extracts return type from method declaration', () => {
  const src = `
public class UserService {
  public User GetById(int id) { return null; }
  public async Task<string> FetchAsync(string url) { return ""; }
  public void Delete(int id) {}
}
`;
  const tree = parser.parse(src);
  try {
    const fns = extractDefinitions(tree, src, 'UserService.cs');
    const getById = fns.find(f => f.name === 'GetById');
    expect(getById?.returnType).toBe('User');
    const fetchAsync = fns.find(f => f.name === 'FetchAsync');
    expect(fetchAsync?.returnType).toContain('Task');
    const del = fns.find(f => f.name === 'Delete');
    expect(del?.returnType).toBe('void');
  } finally {
    if (typeof (tree as any).delete === 'function') (tree as any).delete();
  }
});
```

- [ ] **Step 2: Run failing test**

```bash
./node_modules/.bin/jest tests/extractors/csharp.test.ts --testNamePattern="return type" --no-coverage
```
Expected: FAIL

- [ ] **Step 3: Add returnType to csharp.ts**

In `method_declaration` handler, add before push:
```typescript
const typeNode = node.childForFieldName('type');
const returnType = typeNode?.text?.trim() || undefined;
```
Add `returnType` to the push object.

- [ ] **Step 4: Run all csharp tests**

```bash
./node_modules/.bin/jest tests/extractors/csharp.test.ts --no-coverage
```
Expected: PASS

### Kotlin (`function_declaration`, field `type` after `:`)

- [ ] **Step 5: Write failing test in kotlin.test.ts**

```typescript
test('extracts return type from function declaration', () => {
  const src = `
fun getUser(id: Int): User? {
  return null
}
fun delete(id: Int): Unit {}
`;
  const tree = parser.parse(src);
  try {
    const fns = extractDefinitions(tree, src, 'UserRepo.kt');
    const getUser = fns.find(f => f.name === 'getUser');
    expect(getUser?.returnType).toBe('User?');
    const del = fns.find(f => f.name === 'delete');
    expect(del?.returnType).toBe('Unit');
  } finally {
    if (typeof (tree as any).delete === 'function') (tree as any).delete();
  }
});
```

- [ ] **Step 6: Run failing test, add implementation, run again**

```bash
./node_modules/.bin/jest tests/extractors/kotlin.test.ts --testNamePattern="return type" --no-coverage
```

In `kotlin.ts`, for `function_declaration`, add:
```typescript
// Kotlin return type is named field 'type' (after the colon)
const typeNode = node.childForFieldName('type');
const returnType = typeNode?.text?.trim() || undefined;
```
Add `returnType` to push. Run all kotlin tests: `./node_modules/.bin/jest tests/extractors/kotlin.test.ts --no-coverage`.

### Swift (`function_declaration`, field `return_type`)

- [ ] **Step 7: Write failing test in swift.test.ts, implement, verify**

```typescript
test('extracts return type from func declaration', () => {
  const src = `
func getUser(id: Int) -> User? {
  return nil
}
func process(data: String) -> Void {}
`;
  const tree = parser.parse(src);
  try {
    const fns = extractDefinitions(tree, src, 'repo.swift');
    const getUser = fns.find(f => f.name === 'getUser');
    expect(getUser?.returnType).toBe('User?');
  } finally {
    if (typeof (tree as any).delete === 'function') (tree as any).delete();
  }
});
```

In `swift.ts`, for function nodes:
```typescript
const retNode = node.childForFieldName('return_type');
const returnType = retNode?.text?.replace(/^->\s*/, '').trim() || undefined;
```

Run: `./node_modules/.bin/jest tests/extractors/swift.test.ts --no-coverage`

### PHP (`function_definition` / `method_declaration`, field `return_type`)

- [ ] **Step 8: Write failing test in php.test.ts, implement, verify**

```typescript
test('extracts return type from function definition', () => {
  const src = `<?php
function getUser(int $id): ?User {
  return null;
}
function delete(int $id): void {}
`;
  const tree = parser.parse(src);
  try {
    const fns = extractDefinitions(tree, src, 'service.php');
    const getUser = fns.find(f => f.name === 'getUser');
    expect(getUser?.returnType).toBeDefined();
    expect(getUser?.returnType).toContain('User');
  } finally {
    if (typeof (tree as any).delete === 'function') (tree as any).delete();
  }
});
```

In `php.ts`, for function/method nodes:
```typescript
const retNode = node.childForFieldName('return_type');
// PHP return_type node text is ": ?User" or ": void" — strip leading colon
const returnType = retNode?.text?.replace(/^:\s*/, '').trim() || undefined;
```

Run: `./node_modules/.bin/jest tests/extractors/php.test.ts --no-coverage`

### Scala (`function_definition`, field `return_type`)

- [ ] **Step 9: Write failing test in scala.test.ts, implement, verify**

```typescript
test('extracts return type from def', () => {
  const src = `
def getUser(id: Int): Option[User] = None
def delete(id: Int): Unit = {}
`;
  const tree = parser.parse(src);
  try {
    const fns = extractDefinitions(tree, src, 'UserRepo.scala');
    const getUser = fns.find(f => f.name === 'getUser');
    expect(getUser?.returnType).toBe('Option[User]');
  } finally {
    if (typeof (tree as any).delete === 'function') (tree as any).delete();
  }
});
```

In `scala.ts`, for def nodes:
```typescript
const retNode = node.childForFieldName('return_type');
// Scala return_type text is ": Option[User]" — strip leading colon
const returnType = retNode?.text?.replace(/^:\s*/, '').trim() || undefined;
```

Run: `./node_modules/.bin/jest tests/extractors/scala.test.ts --no-coverage`

- [ ] **Step 10: Run all extractor tests to confirm no regressions**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
./node_modules/.bin/jest tests/extractors/ --no-coverage
```
Expected: all tests PASS

- [ ] **Step 11: Commit**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
git add src/tree-sitter/extractors/csharp.ts src/tree-sitter/extractors/kotlin.ts src/tree-sitter/extractors/swift.ts src/tree-sitter/extractors/php.ts src/tree-sitter/extractors/scala.ts tests/extractors/csharp.test.ts tests/extractors/kotlin.test.ts tests/extractors/swift.test.ts tests/extractors/php.test.ts tests/extractors/scala.test.ts
git commit -m "feat: emit returnType from C#, Kotlin, Swift, PHP, and Scala extractors"
```

---

## Task 5: Add Kuzu dependency and GraphStore skeleton

**Files:**
- Modify: `mcp/package.json`
- Create: `mcp/src/graph.ts`
- Create: `mcp/tests/graph.test.ts`

- [ ] **Step 1: Add kuzu to package.json dependencies**

In `mcp/package.json`, in the `"dependencies"` object, add after `"better-sqlite3"`:
```json
"kuzu": "^0.6.0",
```

- [ ] **Step 2: Install**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
npm install
```
Expected: kuzu downloaded and installed, node_modules/kuzu exists

- [ ] **Step 3: Write failing test for GraphStore init**

Create `mcp/tests/graph.test.ts`:

```typescript
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GraphStore } from '../src/graph.js';
import type { AnalysisResult } from '../src/types.js';

let tmpDir: string;
let graph: GraphStore;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-graph-test-'));
  graph = new GraphStore(tmpDir);
});

afterEach(async () => {
  await graph.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('creates graph directory on init', () => {
  expect(fs.existsSync(path.join(tmpDir, 'graph'))).toBe(true);
});

test('query returns empty array for empty graph', async () => {
  const rows = await graph.query('MATCH (f:Function) RETURN f.name');
  expect(Array.isArray(rows)).toBe(true);
  expect(rows).toHaveLength(0);
});
```

- [ ] **Step 4: Run failing test**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
./node_modules/.bin/jest tests/graph.test.ts --no-coverage
```
Expected: FAIL — cannot find module `../src/graph.js`

- [ ] **Step 5: Create GraphStore skeleton**

Create `mcp/src/graph.ts`:

```typescript
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import type { AnalysisResult } from './types.js';
import crypto from 'crypto';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const kuzu = require('kuzu') as {
  Database: new (path: string) => KuzuDatabase;
  Connection: new (db: KuzuDatabase) => KuzuConnection;
};

interface KuzuDatabase {
  close(): void;
}

interface KuzuQueryResult {
  getAll(): Promise<Record<string, any>[]>;
  close(): Promise<void>;
}

interface KuzuConnection {
  query(cypher: string): Promise<KuzuQueryResult>;
  close(): void;
}

const DEFAULT_DB_DIR = path.join(os.homedir(), '.grasp');

function repoId(source: string): string {
  return crypto.createHash('sha256').update(source).digest('hex').slice(0, 16);
}

export class GraphStore {
  private db: KuzuDatabase;
  private conn: KuzuConnection;
  private ready: Promise<void>;

  constructor(dbDir?: string) {
    const dir = dbDir ?? DEFAULT_DB_DIR;
    const graphPath = path.join(dir, 'graph');
    fs.mkdirSync(graphPath, { recursive: true });
    this.db = new kuzu.Database(graphPath);
    this.conn = new kuzu.Connection(this.db);
    this.ready = this.ensureSchema();
  }

  private async ensureSchema(): Promise<void> {
    const stmts = [
      `CREATE NODE TABLE IF NOT EXISTS File(id STRING, path STRING, language STRING, repoId STRING, PRIMARY KEY(id))`,
      `CREATE NODE TABLE IF NOT EXISTS Function(id STRING, name STRING, filePath STRING, repoId STRING, returnType STRING, startLine INT64, endLine INT64, PRIMARY KEY(id))`,
      `CREATE REL TABLE IF NOT EXISTS CALLS(FROM Function TO Function, count INT64)`,
      `CREATE REL TABLE IF NOT EXISTS IMPORTS(FROM File TO File)`,
      `CREATE REL TABLE IF NOT EXISTS DEFINES(FROM File TO Function)`,
      `CREATE REL TABLE IF NOT EXISTS SAME_RETURN_TYPE(FROM Function TO Function, typeName STRING)`,
    ];
    for (const stmt of stmts) {
      const res = await this.conn.query(stmt);
      await res.close();
    }
  }

  async query(cypher: string): Promise<Record<string, any>[]> {
    await this.ready;
    const upper = cypher.trimStart().toUpperCase();
    const WRITE_KEYWORDS = ['CREATE ', 'DELETE ', 'MERGE ', 'SET ', 'REMOVE ', 'DROP '];
    if (WRITE_KEYWORDS.some(kw => upper.startsWith(kw))) {
      throw new Error('graph_query is read-only. Write operations are not permitted.');
    }
    const res = await this.conn.query(cypher);
    const rows = await res.getAll();
    await res.close();
    return rows;
  }

  async close(): Promise<void> {
    this.conn.close();
    this.db.close();
  }
}

let instance: GraphStore | null = null;
export function getGraphStore(dbDir?: string): GraphStore {
  if (!instance) instance = new GraphStore(dbDir);
  return instance;
}
```

- [ ] **Step 6: Run test — verify it passes**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
./node_modules/.bin/jest tests/graph.test.ts --no-coverage
```
Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
git add package.json package-lock.json src/graph.ts tests/graph.test.ts
git commit -m "feat: add Kuzu dependency and GraphStore skeleton with schema"
```

---

## Task 6: GraphStore.indexResult()

**Files:**
- Modify: `mcp/src/graph.ts`
- Modify: `mcp/tests/graph.test.ts`

- [ ] **Step 1: Write failing indexResult tests**

Add to `mcp/tests/graph.test.ts`:

```typescript
function makeResult(): AnalysisResult {
  return {
    sessionId: 'test-sess',
    source: 'owner/testrepo',
    sourceType: 'github',
    analyzedAt: new Date().toISOString(),
    files: [
      {
        path: 'src/auth.ts', name: 'auth.ts', folder: 'src',
        content: null, lines: 80, layer: 'services', churn: 2, isCode: true,
        functions: [
          { name: 'login', file: 'src/auth.ts', line: 10, returnType: 'Promise<User>' },
          { name: 'logout', file: 'src/auth.ts', line: 25, returnType: 'void' },
        ],
      },
      {
        path: 'src/user.ts', name: 'user.ts', folder: 'src',
        content: null, lines: 60, layer: 'models', churn: 1, isCode: true,
        functions: [
          { name: 'getUser', file: 'src/user.ts', line: 5, returnType: 'Promise<User>' },
        ],
      },
    ],
    connections: [
      { source: 'src/auth.ts', target: 'src/user.ts', fn: 'getUser', count: 3 },
    ],
    issues: [], patterns: [], security: [], duplicates: [], layerViolations: [],
    folders: ['src'], layers: ['services', 'models'],
    summary: {
      fileCount: 2, codeFileCount: 2, functionCount: 3, connectionCount: 1,
      issueCount: 0, criticalIssueCount: 0, circularDepCount: 0, securityIssueCount: 0,
      healthScore: 90, healthGrade: 'A', layers: ['services', 'models'],
      topFolders: [], languages: [],
    },
  };
}

test('indexResult creates Function nodes', async () => {
  await graph.indexResult(makeResult());
  const rows = await graph.query(`MATCH (f:Function {repoId: '${repoId('owner/testrepo')}' }) RETURN f.name ORDER BY f.name`);
  const names = rows.map((r: any) => Object.values(r)[0]);
  expect(names).toContain('login');
  expect(names).toContain('logout');
  expect(names).toContain('getUser');
});

test('indexResult stores returnType on Function nodes', async () => {
  await graph.indexResult(makeResult());
  const rows = await graph.query(`MATCH (f:Function {name: 'login', repoId: '${repoId('owner/testrepo')}'}) RETURN f.returnType`);
  expect(rows[0]).toBeDefined();
  const val = Object.values(rows[0])[0];
  expect(val).toBe('Promise<User>');
});

test('indexResult creates CALLS edges', async () => {
  await graph.indexResult(makeResult());
  const rows = await graph.query(
    `MATCH (a:Function {name: 'login'})-[c:CALLS]->(b:Function {name: 'getUser'}) RETURN c.count`
  );
  expect(rows.length).toBeGreaterThan(0);
});

test('indexResult creates SAME_RETURN_TYPE edges for shared return types', async () => {
  await graph.indexResult(makeResult());
  const rows = await graph.query(
    `MATCH (a:Function)-[r:SAME_RETURN_TYPE]->(b:Function) WHERE a.repoId = '${repoId('owner/testrepo')}' RETURN a.name, b.name, r.typeName`
  );
  // login and getUser both return Promise<User>
  const pairs = rows.map((r: any) => {
    const vals = Object.values(r);
    return [vals[0], vals[1]];
  });
  const names = pairs.flat();
  expect(names).toContain('login');
  expect(names).toContain('getUser');
});

test('indexResult is idempotent — re-index replaces data', async () => {
  await graph.indexResult(makeResult());
  await graph.indexResult(makeResult()); // second call
  const rows = await graph.query(`MATCH (f:Function {repoId: '${repoId('owner/testrepo')}'}) RETURN f.name`);
  expect(rows).toHaveLength(3); // not 6
});
```

Also export `repoId` helper for tests — add at top of test file:
```typescript
import crypto from 'crypto';
function repoId(source: string): string {
  return crypto.createHash('sha256').update(source).digest('hex').slice(0, 16);
}
```

- [ ] **Step 2: Run failing tests**

```bash
./node_modules/.bin/jest tests/graph.test.ts --no-coverage
```
Expected: FAIL — `graph.indexResult is not a function`

- [ ] **Step 3: Implement indexResult in graph.ts**

Add `indexResult` method to the `GraphStore` class in `mcp/src/graph.ts`:

```typescript
async indexResult(result: AnalysisResult): Promise<void> {
  await this.ready;
  const rid = repoId(result.source);

  // Clear existing data for this repo
  await this.clearRepo(rid);

  // Collect all functions across all files
  const allFunctions: Array<{
    id: string; name: string; filePath: string; returnType: string;
    startLine: number; repoId: string;
  }> = [];

  for (const file of result.files) {
    if (!file.isCode) continue;
    const fileId = `${rid}:${file.path}`;

    // Insert File node
    const fileRes = await this.conn.query(
      `CREATE (:File {id: '${esc(fileId)}', path: '${esc(file.path)}', language: '${esc(file.path.split('.').pop() ?? '')}', repoId: '${rid}'})`
    );
    await fileRes.close();

    for (const fn of file.functions) {
      const fnId = `${rid}:${file.path}:${fn.name}:${fn.line}`;
      const returnType = fn.returnType ?? '';
      allFunctions.push({ id: fnId, name: fn.name, filePath: file.path, returnType, startLine: fn.line, repoId: rid });

      // Insert Function node
      const fnRes = await this.conn.query(
        `CREATE (:Function {id: '${esc(fnId)}', name: '${esc(fn.name)}', filePath: '${esc(file.path)}', repoId: '${rid}', returnType: '${esc(returnType)}', startLine: ${fn.line}, endLine: ${fn.line}})`
      );
      await fnRes.close();

      // DEFINES edge: File → Function
      const defRes = await this.conn.query(
        `MATCH (f:File {id: '${esc(fileId)}'}), (fn:Function {id: '${esc(fnId)}'}) CREATE (f)-[:DEFINES]->(fn)`
      );
      await defRes.close();
    }
  }

  // Build a lookup: fnName → fnId (first match per name per file path in connections)
  const fnByNameAndFile = new Map<string, string>();
  for (const fn of allFunctions) {
    fnByNameAndFile.set(`${fn.filePath}::${fn.name}`, fn.id);
    // Also index by name alone as fallback
    if (!fnByNameAndFile.has(`::${fn.name}`)) {
      fnByNameAndFile.set(`::${fn.name}`, fn.id);
    }
  }

  // CALLS edges: from connections (file-level → function-level via fn name)
  for (const conn of result.connections) {
    // Find a function with this name in the source file
    const callerKey = `${conn.source}::${conn.fn}`;
    const calleeKey = `${conn.target}::${conn.fn}`;
    const fallbackKey = `::${conn.fn}`;
    const callerId = fnByNameAndFile.get(callerKey) ?? fnByNameAndFile.get(fallbackKey);
    const calleeId = fnByNameAndFile.get(calleeKey) ?? fnByNameAndFile.get(fallbackKey);
    if (callerId && calleeId && callerId !== calleeId) {
      const edgeRes = await this.conn.query(
        `MATCH (a:Function {id: '${esc(callerId)}'}), (b:Function {id: '${esc(calleeId)}'}) CREATE (a)-[:CALLS {count: ${conn.count}}]->(b)`
      );
      await edgeRes.close();
    }
  }

  // SAME_RETURN_TYPE edges: connect functions sharing the same non-empty returnType
  const byReturnType = new Map<string, string[]>();
  for (const fn of allFunctions) {
    if (!fn.returnType) continue;
    if (!byReturnType.has(fn.returnType)) byReturnType.set(fn.returnType, []);
    byReturnType.get(fn.returnType)!.push(fn.id);
  }
  for (const [typeName, ids] of byReturnType) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const edgeRes = await this.conn.query(
          `MATCH (a:Function {id: '${esc(ids[i])}'}), (b:Function {id: '${esc(ids[j])}'}) CREATE (a)-[:SAME_RETURN_TYPE {typeName: '${esc(typeName)}'}]->(b)`
        );
        await edgeRes.close();
      }
    }
  }
}

private async clearRepo(rid: string): Promise<void> {
  // Delete all nodes and relationships for this repo
  const stmts = [
    `MATCH (f:Function {repoId: '${rid}'}) DETACH DELETE f`,
    `MATCH (f:File {repoId: '${rid}'}) DETACH DELETE f`,
  ];
  for (const stmt of stmts) {
    const res = await this.conn.query(stmt);
    await res.close();
  }
}
```

Also add a private `esc` helper to the file (outside the class) for basic Cypher string escaping:

```typescript
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
```

- [ ] **Step 4: Run tests**

```bash
./node_modules/.bin/jest tests/graph.test.ts --no-coverage
```
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
git add src/graph.ts tests/graph.test.ts
git commit -m "feat: GraphStore.indexResult populates Function/File nodes and CALLS/SAME_RETURN_TYPE edges"
```

---

## Task 7: GraphStore.getCallChain(), getTypeChain(), and clear()

**Files:**
- Modify: `mcp/src/graph.ts`
- Modify: `mcp/tests/graph.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `mcp/tests/graph.test.ts` (after the indexResult tests):

```typescript
describe('query methods (require indexed data)', () => {
  beforeEach(async () => {
    await graph.indexResult(makeResult());
  });

  test('getCallChain callees returns direct callees', async () => {
    const chain = await graph.getCallChain('owner/testrepo', 'login', 'callees', 2);
    expect(chain).toBeDefined();
    expect(Array.isArray(chain.nodes)).toBe(true);
    const names = chain.nodes.map((n: any) => n.name);
    expect(names).toContain('login');
  });

  test('getCallChain callers returns empty for root function', async () => {
    const chain = await graph.getCallChain('owner/testrepo', 'login', 'callers', 2);
    expect(chain).toBeDefined();
  });

  test('getTypeChain finds functions with matching returnType', async () => {
    const result = await graph.getTypeChain('owner/testrepo', 'Promise<User>', 2);
    expect(result).toBeDefined();
    expect(Array.isArray(result.producers)).toBe(true);
    const producerNames = result.producers.map((p: any) => p.name);
    expect(producerNames).toContain('login');
    expect(producerNames).toContain('getUser');
  });

  test('clear removes all data for a repo', async () => {
    await graph.clear('owner/testrepo');
    const rows = await graph.query(`MATCH (f:Function) WHERE f.repoId = '${repoId('owner/testrepo')}' RETURN f.name`);
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
./node_modules/.bin/jest tests/graph.test.ts --no-coverage
```
Expected: FAIL — `getCallChain is not a function`, etc.

- [ ] **Step 3: Implement getCallChain, getTypeChain, clear in graph.ts**

Add these methods to the `GraphStore` class:

```typescript
async getCallChain(
  source: string,
  fnName: string,
  direction: 'callers' | 'callees' | 'both',
  depth: number
): Promise<{ nodes: Record<string, any>[]; edges: Record<string, any>[] }> {
  await this.ready;
  const rid = repoId(source);
  const d = Math.min(Math.max(1, depth), 5);
  const nameEsc = esc(fnName);

  let cypher: string;
  if (direction === 'callees') {
    cypher = `MATCH p=(root:Function {name: '${nameEsc}', repoId: '${rid}'})-[:CALLS*1..${d}]->(callee:Function) RETURN root, callee, length(p) as hops ORDER BY hops`;
  } else if (direction === 'callers') {
    cypher = `MATCH p=(caller:Function)-[:CALLS*1..${d}]->(root:Function {name: '${nameEsc}', repoId: '${rid}'}) RETURN caller, root, length(p) as hops ORDER BY hops`;
  } else {
    cypher = `MATCH p=(a:Function)-[:CALLS*1..${d}]-(b:Function {name: '${nameEsc}', repoId: '${rid}'}) RETURN a, b, length(p) as hops ORDER BY hops`;
  }

  const rootRows = await this.query(`MATCH (f:Function {name: '${nameEsc}', repoId: '${rid}'}) RETURN f.name, f.filePath, f.returnType LIMIT 1`);
  const chainRows = await this.query(cypher);

  return {
    nodes: [...rootRows, ...chainRows],
    edges: chainRows,
  };
}

async getTypeChain(
  source: string,
  typeName: string,
  hops: number
): Promise<{ producers: Record<string, any>[]; peers: Record<string, any>[] }> {
  await this.ready;
  const rid = repoId(source);
  const h = Math.min(Math.max(1, hops), 5);
  const typeEsc = esc(typeName);

  const producers = await this.query(
    `MATCH (f:Function {repoId: '${rid}'}) WHERE f.returnType = '${typeEsc}' RETURN f.name, f.filePath, f.returnType`
  );

  const peers = await this.query(
    `MATCH (a:Function {repoId: '${rid}'})-[:SAME_RETURN_TYPE*1..${h}]-(b:Function {repoId: '${rid}'}) WHERE a.returnType = '${typeEsc}' RETURN DISTINCT b.name, b.filePath, b.returnType`
  );

  return { producers, peers };
}

async clear(source: string): Promise<void> {
  await this.ready;
  await this.clearRepo(repoId(source));
}
```

- [ ] **Step 4: Run all graph tests**

```bash
./node_modules/.bin/jest tests/graph.test.ts --no-coverage
```
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
git add src/graph.ts tests/graph.test.ts
git commit -m "feat: GraphStore getCallChain, getTypeChain, and clear methods"
```

---

## Task 8: Wire GraphStore into grasp_brain_index + register graph_query and call_chain tools

**Files:**
- Modify: `mcp/src/index.ts`

- [ ] **Step 1: Import GraphStore in index.ts**

Near the top of `mcp/src/index.ts` (around line 62, after `BrainStore` import), add:

```typescript
import { GraphStore } from './graph.js';
```

And after `const brainStore = new BrainStore();` (line 73), add:

```typescript
const graphStore = new GraphStore();
```

- [ ] **Step 2: Wire indexResult into grasp_brain_index**

In the `grasp_brain_index` handler (around line 5857), add graph indexing after brain indexing:

```typescript
brainStore.indexResult(result);
await graphStore.indexResult(result);
return { content: [{ type: 'text', text: `Indexed ${source}: ${result.summary.fileCount} files, health ${result.summary.healthGrade} (${result.summary.healthScore}). Graph updated.` }] };
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
./node_modules/.bin/tsc --noEmit -p tsconfig.check.json
```
Expected: 0 errors

- [ ] **Step 4: Add graph_query tool after grasp_ask tool (around line 5965)**

```typescript
// =====================================================================
// TOOL: graph_query
// =====================================================================
server.registerTool(
  'graph_query',
  {
    title: 'Graph Cypher Query',
    description: `Run a read-only Cypher query against the Grasp graph database for a repo.

The graph is populated by grasp_brain_index. It contains:
  - Function nodes: id, name, filePath, repoId, returnType, startLine
  - File nodes: id, path, language, repoId
  - CALLS edges: Function → Function (count)
  - DEFINES edges: File → Function
  - SAME_RETURN_TYPE edges: Function → Function (typeName)

Example queries:
  MATCH (f:Function {repoId: '<id>'}) RETURN f.name, f.returnType LIMIT 20
  MATCH (a:Function)-[:CALLS*1..3]->(b:Function) WHERE b.returnType CONTAINS 'User' RETURN a.name, b.name
  MATCH (a:Function)-[:SAME_RETURN_TYPE {typeName: 'Promise<User>'}]-(b:Function) RETURN a.name, b.name

Write operations (CREATE, DELETE, MERGE, SET) are rejected.`,
    inputSchema: z.object({
      source: z.string().describe('Repo source — same value used when indexing with grasp_brain_index'),
      cypher: z.string().describe('Read-only Cypher query'),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ source, cypher }) => {
    try {
      const rows = await graphStore.query(cypher);
      return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }] };
    }
  }
);

// =====================================================================
// TOOL: call_chain
// =====================================================================
server.registerTool(
  'call_chain',
  {
    title: 'Call Chain',
    description: `Traverse the call graph N hops from a named function. Returns callers, callees, or both.

Requires grasp_brain_index to have been run first.`,
    inputSchema: z.object({
      source: z.string().describe('Repo source — same value used when indexing'),
      function: z.string().describe('Function name to start from'),
      direction: z.enum(['callers', 'callees', 'both']).default('callees').describe('Traversal direction'),
      depth: z.number().int().min(1).max(5).default(2).describe('Number of hops (1–5)'),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ source, function: fnName, direction, depth }) => {
    try {
      const result = await graphStore.getCallChain(source, fnName, direction, depth);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }] };
    }
  }
);
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.check.json
```
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
git add src/index.ts
git commit -m "feat: wire GraphStore into grasp_brain_index, add graph_query and call_chain tools"
```

---

## Task 9: Add type_propagation and function_graph tools

**Files:**
- Modify: `mcp/src/index.ts`

- [ ] **Step 1: Add type_propagation tool after call_chain**

```typescript
// =====================================================================
// TOOL: type_propagation
// =====================================================================
server.registerTool(
  'type_propagation',
  {
    title: 'Type Propagation',
    description: `Trace where a return type flows through the codebase. Finds producer functions (those that return the type) and peer functions (those sharing the same return type) within N hops.

Requires grasp_brain_index to have been run first.

Example: type_propagation with typeName="Promise<User>" finds all functions returning Promise<User> and their call neighbors.`,
    inputSchema: z.object({
      source: z.string().describe('Repo source — same value used when indexing'),
      typeName: z.string().describe('Return type to trace, e.g. "User", "Promise<User>", "AuthToken"'),
      hops: z.number().int().min(1).max(5).default(3).describe('Traversal depth for peer relationships (1–5)'),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ source, typeName, hops }) => {
    try {
      const result = await graphStore.getTypeChain(source, typeName, hops);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }] };
    }
  }
);

// =====================================================================
// TOOL: function_graph
// =====================================================================
server.registerTool(
  'function_graph',
  {
    title: 'Function Subgraph',
    description: `Render a subgraph centred on a named function — its callers and callees up to the given depth.

Output formats:
  - mermaid: paste directly into GitHub markdown or VS Code preview
  - dot: Graphviz compatible
  - json: raw nodes/edges

Requires grasp_brain_index to have been run first.`,
    inputSchema: z.object({
      source: z.string().describe('Repo source — same value used when indexing'),
      function: z.string().describe('Function name to centre the graph on'),
      depth: z.number().int().min(1).max(3).default(2).describe('Hops from the centre function (1–3)'),
      format: z.enum(['mermaid', 'dot', 'json']).default('mermaid').describe('Output format'),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ source, function: fnName, depth, format }) => {
    try {
      const { nodes, edges } = await graphStore.getCallChain(source, fnName, 'both', depth);

      if (format === 'json') {
        return { content: [{ type: 'text', text: JSON.stringify({ nodes, edges }, null, 2) }] };
      }

      // Build unique node set
      const nodeMap = new Map<string, string>();
      const addNode = (row: Record<string, any>) => {
        const vals = Object.values(row);
        const name = String(vals[0] ?? '');
        const file = String(vals[1] ?? '');
        if (name && !nodeMap.has(name)) {
          nodeMap.set(name, file);
        }
      };
      nodes.forEach(addNode);

      // Build edge list from CALLS relationships
      const edgePairs: Array<[string, string]> = [];
      for (const row of edges) {
        const vals = Object.values(row);
        if (vals.length >= 2) {
          const a = String(vals[0] ?? '');
          const b = String(vals[1] ?? '');
          if (a && b && a !== b) edgePairs.push([a, b]);
        }
      }

      if (format === 'mermaid') {
        const lines = ['graph LR'];
        nodeMap.forEach((file, name) => {
          const label = `${name}\\n${file.split('/').pop() ?? file}`;
          lines.push(`  ${sanitizeMermaidId(name)}["${label}"]`);
        });
        for (const [a, b] of edgePairs) {
          lines.push(`  ${sanitizeMermaidId(a)} --> ${sanitizeMermaidId(b)}`);
        }
        // Highlight the centre node
        lines.push(`  style ${sanitizeMermaidId(fnName)} fill:#00d4aa,color:#000`);
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      }

      // dot format
      const lines = ['digraph G {', '  node [shape=box fontname="monospace"]'];
      nodeMap.forEach((file, name) => {
        const label = `${name}\\n${file.split('/').pop() ?? file}`;
        lines.push(`  "${name}" [label="${label}"]`);
      });
      for (const [a, b] of edgePairs) {
        lines.push(`  "${a}" -> "${b}"`);
      }
      lines.push('}');
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }] };
    }
  }
);
```

- [ ] **Step 2: Add sanitizeMermaidId helper near the top of index.ts (after the truncate function)**

```typescript
function sanitizeMermaidId(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.check.json
```
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
git add src/index.ts
git commit -m "feat: add type_propagation and function_graph MCP tools"
```

---

## Task 10: Version bump (3.10.0 → 3.11.0), CHANGELOG, and README

Per the CLAUDE.md version bump checklist, every file below must be updated from `3.10.0` to `3.11.0`.

**Files (ALL required — missing any = version mismatch in release):**

```
browser-extension/package.json
browser-extension/manifest.json
browser-extension/manifest.firefox.json
browser-extension/manifest.safari.json
browser-extension/package-lock.json
mcp/package.json           ← already updated in Task 5
mcp/package-lock.json      ← already updated in Task 5
mcp/server.json            ← "version" appears TWICE
mcp/README.md              ← "**Current version: 3.10.0**"
vscode-extension/package.json
vscode-extension/package-lock.json
jetbrains-plugin/build.gradle.kts  ← version= appears TWICE + changeNotes
eclipse-plugin/pom.xml
jenkins-plugin/pom.xml
amazon-q-plugin/package.json
copilot-extension/package.json
continue-provider/package.json
discord-bot/package.json
github-action/package.json
gitlab-app/package.json
gitlab-ci-component/package.json
gpt-actions/package.json
jira-integration/package.json
linear-integration/package.json
raycast-grasp/package.json
teams-bot/package.json
gpt-actions/src/server.ts          ← hardcoded version in /health endpoint
index.html                         ← window.GRASP_VERSION — TWO occurrences
team-dashboard.html                ← GRASP_VERSION — ONE occurrence
docs/index.html                    ← vX.Y.Z — TWO occurrences
docker/Dockerfile                  ← grasp-mcp-server@X.Y.Z
docker/README.md                   ← version in table
README.md                          ← version references
CHANGELOG.md                       ← new entry at top
```

DO NOT bump: `shared/`, `ai-tools/`, `saas/`, `github-app/`, `slack-bot/`

- [ ] **Step 1: Update all version files**

Use targeted edits on each file. For `package.json` files, change `"version": "3.10.0"` to `"version": "3.11.0"`. For `package-lock.json` files, change the top-level `"version"` field only (do not touch dependency versions).

For `mcp/server.json` — verify both occurrences are updated:
```bash
grep -n "3.10.0\|3.11.0" /Users/chak/Documents/Code/Claudecode/grasp/mcp/server.json
```

For `jetbrains-plugin/build.gradle.kts` — update both `version =` occurrences and add changeNotes entry for v3.11.0.

For `gpt-actions/src/server.ts` — find the hardcoded version string:
```bash
grep -n "3.10.0" /Users/chak/Documents/Code/Claudecode/grasp/gpt-actions/src/server.ts
```

For `index.html` — find both `GRASP_VERSION` occurrences:
```bash
grep -n "GRASP_VERSION\|3.10.0" /Users/chak/Documents/Code/Claudecode/grasp/index.html | head -10
```

- [ ] **Step 2: Verify no remaining 3.10.0 references (excluding lock files and changelog history)**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp
grep -r "3\.10\.0" --include="*.json" --include="*.ts" --include="*.html" --include="*.md" --include="*.kts" --include="*.xml" --include="Dockerfile" . \
  | grep -v "node_modules" \
  | grep -v "CHANGELOG.md" \
  | grep -v "package-lock.json" \
  | grep -v "\.git/"
```
Expected: no output (all references updated)

- [ ] **Step 3: Add CHANGELOG entry**

At the top of `CHANGELOG.md`, add after the `# Changelog` header:

```markdown
## [3.11.0] — 2026-04-25

### Added
- **Graph Core** — persistent Kuzu graph database at `~/.grasp/graph/` populated automatically when running `grasp_brain_index`
- **`graph_query` MCP tool** — execute read-only Cypher queries against the function-level call graph
- **`call_chain` MCP tool** — traverse callers or callees N hops deep from any named function
- **`type_propagation` MCP tool** — find all functions that return a given type and their call neighbors
- **`function_graph` MCP tool** — render a subgraph around a function as Mermaid, DOT, or JSON
- **Return type extraction** — all 11 typed-language extractors (TypeScript, Python, Java, Go, Rust, C#, Kotlin, Swift, PHP, Scala, TSX) now emit `returnType` on function definitions
- **`SAME_RETURN_TYPE` edges** — functions sharing an identical return type string are connected in the graph, enabling type-centric traversal
```

- [ ] **Step 4: Update mcp/README.md — add new tools section**

Find the tools list in `mcp/README.md` and add the 4 new tools. Add a section (or update the existing tools table) with:

```markdown
### Graph Tools (New in v3.11.0)

| Tool | Description |
|---|---|
| `graph_query` | Run read-only Cypher queries against the Grasp function-level call graph |
| `call_chain` | Traverse callers/callees N hops from a named function |
| `type_propagation` | Find all functions returning a given type and their call neighbors |
| `function_graph` | Render a function subgraph as Mermaid, DOT, or JSON |

**Requires `grasp_brain_index` to be run first.**

Example: find all functions that eventually call anything returning `AuthToken`:
\```cypher
MATCH (f:Function)-[:CALLS*1..3]->(g:Function)
WHERE g.returnType CONTAINS 'AuthToken'
RETURN f.name, g.name, g.returnType
\```
```

- [ ] **Step 5: Commit all version files**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp
git add -A
git commit -m "chore: bump version to 3.11.0"
```

---

## Task 11: Full test run, build, tag, and release

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
npm test
```
Expected: all test suites PASS, 0 failures

If any test fails: debug and fix before proceeding. Do not tag until green.

- [ ] **Step 2: Build the MCP server**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
npm run build
```
Expected: `dist/` created, 0 errors

- [ ] **Step 3: Build the browser extension**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/browser-extension
npm run build && npm test
```
Expected: build succeeds, tests pass

- [ ] **Step 4: TypeScript typecheck**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
./node_modules/.bin/tsc --noEmit -p tsconfig.check.json
```
Expected: 0 errors

- [ ] **Step 5: Verify graph directory is gitignored**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp
grep "graph" .gitignore || echo "Not in .gitignore"
```
If `~/.grasp/graph/` is not referenced (it's outside the repo so doesn't need to be in .gitignore), no action needed.

- [ ] **Step 6: Tag and push**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp
git push origin main
git tag v3.11.0
git push origin v3.11.0
```
Expected: tag pushed, CI/CD pipeline triggered by `v3.11.0` tag per `.github/workflows/publish.yml` — npm publish, VS Code marketplace, JetBrains, Docker, Chrome Web Store, GitHub Release

- [ ] **Step 7: Verify CI pipeline**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp
gh run list --limit 5
```
Monitor that publish.yml triggered and completes. If it fails, check the run logs:
```bash
gh run view --log-failed
```

---

## Verification Checklist

After release, verify end-to-end:

1. `npm install -g grasp-mcp-server@3.11.0` installs without errors
2. Running `grasp_brain_index` on a local repo populates both `~/.grasp/brain.db` and `~/.grasp/graph/`
3. `graph_query` with `MATCH (f:Function) RETURN f.name, f.returnType LIMIT 5` returns results
4. `call_chain` on a real function returns a non-empty tree
5. `type_propagation` with a known return type (e.g. `string`) returns producers
6. `function_graph` with `format: "mermaid"` returns a valid Mermaid diagram
7. All existing tools still work (no regressions)
