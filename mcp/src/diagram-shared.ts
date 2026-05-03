export function sanitizeId(p: string): string {
  return p.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+/, '') || 'node';
}

export function sanitizeLabel(p: string): string {
  return p.split('/').pop() ?? p;
}
