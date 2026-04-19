export interface EnvVarResult {
  vars: EnvVar[];
  undocumented: string[];
  testOnly: string[];
  layerViolations: Array<{ name: string; file: string; layer: string }>;
}

export interface EnvVar {
  name: string;
  files: Array<{ path: string; line: number; layer: string }>;
  layers: string[];
  inEnvExample: boolean;
  testOnly: boolean;
}

const PATTERNS = [
  /process\.env\.([A-Z_][A-Z0-9_]+)/g,
  /os\.getenv\(['"]([A-Z_][A-Z0-9_]+)['"]\)/g,
  /os\.environ(?:\.get)?\[['"]([A-Z_][A-Z0-9_]+)['"]\]/g,
  /os\.environ\.get\(['"]([A-Z_][A-Z0-9_]+)['"]\)/g,
  /getenv\(['"]([A-Z_][A-Z0-9_]+)['"]\)/g,
  /config\.get\(['"]([A-Z_][A-Z0-9_]+)['"]\)/g,
  /ENV\[['"]([A-Z_][A-Z0-9_]+)['"]\]/g,
];

export function scanEnvVars(
  files: Array<{ path: string; content: string; layer: string; isTest: boolean }>,
  envExampleVars: string[],
): EnvVarResult {
  const varMap = new Map<string, EnvVar>();
  const exampleSet = new Set(envExampleVars);

  for (const file of files) {
    if (!file.content) continue;
    const lines = file.content.split('\n');

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      for (const pattern of PATTERNS) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(line)) !== null) {
          const name = match[1];
          if (!varMap.has(name)) {
            varMap.set(name, {
              name,
              files: [],
              layers: [],
              inEnvExample: exampleSet.has(name),
              testOnly: true, // start true, flip to false when seen in non-test
            });
          }
          const entry = varMap.get(name)!;
          entry.files.push({ path: file.path, line: lineIdx + 1, layer: file.layer });
          if (!entry.layers.includes(file.layer)) entry.layers.push(file.layer);
          if (!file.isTest) entry.testOnly = false;
        }
      }
    }
  }

  const vars = [...varMap.values()];
  return {
    vars,
    undocumented: vars.filter(v => !v.inEnvExample).map(v => v.name),
    testOnly: vars.filter(v => v.testOnly).map(v => v.name),
    layerViolations: [], // future: flag env reads from UI layer etc.
  };
}
