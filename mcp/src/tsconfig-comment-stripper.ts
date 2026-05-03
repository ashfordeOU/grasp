// Comment + trailing-comma stripper for tsconfig.json (and similar JSON5-
// dialect config files). Extracted from tsconfig-resolver.ts so each
// piece stays under the critical-complexity threshold.

export function stripJsonComments(input: string): string {
  let out = '';
  let i = 0;
  const n = input.length;
  let inString = false;
  let stringQuote = '';
  while (i < n) {
    if (inString) {
      i = consumeStringChar(input, i, n, stringQuote, (c) => { out += c; }, () => { inString = false; });
      continue;
    }
    const c = input[i];
    const next = i + 1 < n ? input[i + 1] : '';
    if (c === '"' || c === "'") {
      inString = true;
      stringQuote = c;
      out += c;
      i++;
      continue;
    }
    if (c === '/' && next === '/') {
      while (i < n && input[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(input[i] === '*' && input[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out.replace(/,(\s*[\]}])/g, '$1');
}

function consumeStringChar(
  input: string,
  i: number,
  n: number,
  quote: string,
  emit: (c: string) => void,
  closeString: () => void,
): number {
  const c = input[i];
  emit(c);
  if (c === '\\' && i + 1 < n) {
    emit(input[i + 1]);
    return i + 2;
  }
  if (c === quote) closeString();
  return i + 1;
}
