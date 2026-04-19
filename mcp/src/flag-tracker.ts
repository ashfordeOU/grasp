export interface FlagEntry {
  name: string;
  files: Array<{ path: string; line: number; layer: string }>;
  source: 'launchdarkly' | 'growthbook' | 'openfeature' | 'env' | 'custom';
}

export interface FlagTrackResult {
  flags: FlagEntry[];
  totalFlags: number;
}

type FlagPattern = { re: RegExp; source: FlagEntry['source'] };

const FLAG_PATTERNS: FlagPattern[] = [
  { re: /ldClient\.variation\(['"]([^'"]+)['"]/g, source: 'launchdarkly' },
  { re: /useFlags\(\)\.([a-zA-Z_][a-zA-Z0-9_-]*)/g, source: 'launchdarkly' },
  { re: /gb\.isOn\(['"]([^'"]+)['"]/g, source: 'growthbook' },
  { re: /gb\.getFeatureValue\(['"]([^'"]+)['"]/g, source: 'growthbook' },
  { re: /client\.getBooleanValue\(['"]([^'"]+)['"]/g, source: 'openfeature' },
  { re: /process\.env\.(FEATURE_[A-Z0-9_]+|FF_[A-Z0-9_]+|ENABLE_[A-Z0-9_]+)/g, source: 'env' },
  { re: /flags\.get\(['"]([^'"]+)['"]/g, source: 'custom' },
  { re: /features\.enabled\(['"]([^'"]+)['"]/g, source: 'custom' },
  { re: /isFeatureEnabled\(['"]([^'"]+)['"]/g, source: 'custom' },
];

export function trackFlags(
  files: Array<{ path: string; content: string; layer: string }>,
): FlagTrackResult {
  const flagMap = new Map<string, FlagEntry>();

  for (const file of files) {
    if (!file.content) continue;
    const lines = file.content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { re, source } of FLAG_PATTERNS) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(line)) !== null) {
          const name = m[1];
          if (!flagMap.has(name)) {
            flagMap.set(name, { name, files: [], source });
          }
          flagMap.get(name)!.files.push({ path: file.path, line: i + 1, layer: file.layer });
        }
      }
    }
  }

  const flags = [...flagMap.values()];
  return { flags, totalFlags: flags.length };
}
