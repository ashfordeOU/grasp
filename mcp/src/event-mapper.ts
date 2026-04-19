export interface EventEntry {
  name: string;
  emitters: Array<{ file: string; line: number }>;
  subscribers: Array<{ file: string; line: number }>;
  orphaned: boolean; // emitted but never subscribed
  ghost: boolean;    // subscribed but never emitted
}

export interface EventMapResult {
  events: EventEntry[];
  orphanedCount: number;
  ghostCount: number;
}

// Patterns that emit events
const EMIT_PATTERNS = [
  /\.emit\(['"]([^'"]+)['"]/g,
  /dispatchEvent\(new\s+\w*Event\(['"]([^'"]+)['"]/g,
  /dispatch\(\s*\{[^}]*type:\s*['"]([^'"]+)['"]/g,
  /\.publish\(['"]([^'"]+)['"]/g,
  /\.trigger\(['"]([^'"]+)['"]/g,
  /createAction\(['"]([^'"]+)['"]/g,
];

// Patterns that subscribe to events
const SUBSCRIBE_PATTERNS = [
  /\.on\(['"]([^'"]+)['"]/g,
  /\.once\(['"]([^'"]+)['"]/g,
  /addEventListener\(['"]([^'"]+)['"]/g,
  /\.subscribe\(['"]([^'"]+)['"]/g,
  /\.addListener\(['"]([^'"]+)['"]/g,
];

export function mapEvents(
  files: Array<{ path: string; content: string; layer: string }>,
): EventMapResult {
  const emitterMap = new Map<string, Array<{ file: string; line: number }>>();
  const subscriberMap = new Map<string, Array<{ file: string; line: number }>>();

  for (const file of files) {
    if (!file.content) continue;
    const lines = file.content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const pat of EMIT_PATTERNS) {
        pat.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = pat.exec(line)) !== null) {
          const name = m[1];
          if (!emitterMap.has(name)) emitterMap.set(name, []);
          emitterMap.get(name)!.push({ file: file.path, line: i + 1 });
        }
      }

      for (const pat of SUBSCRIBE_PATTERNS) {
        pat.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = pat.exec(line)) !== null) {
          const name = m[1];
          if (!subscriberMap.has(name)) subscriberMap.set(name, []);
          subscriberMap.get(name)!.push({ file: file.path, line: i + 1 });
        }
      }
    }
  }

  const allNames = new Set([...emitterMap.keys(), ...subscriberMap.keys()]);
  const events: EventEntry[] = [];

  for (const name of allNames) {
    const emitters = emitterMap.get(name) ?? [];
    const subscribers = subscriberMap.get(name) ?? [];
    events.push({
      name,
      emitters,
      subscribers,
      orphaned: emitters.length > 0 && subscribers.length === 0,
      ghost: subscribers.length > 0 && emitters.length === 0,
    });
  }

  return {
    events,
    orphanedCount: events.filter(e => e.orphaned).length,
    ghostCount: events.filter(e => e.ghost).length,
  };
}
