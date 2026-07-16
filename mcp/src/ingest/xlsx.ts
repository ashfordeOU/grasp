/** Spreadsheet (.xlsx/.xls) extraction via the optional `xlsx` (SheetJS) dependency. */
import { OptionalDependencyError } from './types.js';

export async function extractXlsx(buf: Buffer): Promise<{ text: string; metadata: Record<string, unknown> }> {
  let XLSX: any;
  try {
    XLSX = await import('xlsx');
  } catch {
    throw new OptionalDependencyError('xlsx', 'spreadsheet', 'npm i xlsx');
  }
  const lib = XLSX.default || XLSX;
  const wb = lib.read(buf, { type: 'buffer' });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const csv = lib.utils.sheet_to_csv(wb.Sheets[name]);
    if (csv.trim()) parts.push(`## Sheet: ${name}\n${csv}`);
  }
  return { text: parts.join('\n\n'), metadata: { sheets: wb.SheetNames } };
}
