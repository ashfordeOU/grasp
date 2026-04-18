export function greet(name: string): string {
  return `Hello, ${name}!`;
}

export function formatDate(d: Date): string {
  return d.toISOString();
}
