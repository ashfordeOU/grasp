export interface RenameMatch {
  file: string;
  line: number;
  col: number;
  before: string;
  after: string;
}

export interface RenameResult {
  old_name: string;
  new_name: string;
  matches: RenameMatch[];
  files_affected: string[];
  diff_preview: string;
}

export function computeRename(
  files: Record<string, string>,  // filePath → content
  oldName: string,
  newName: string
): RenameResult {
  const escapedOldName = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${escapedOldName}\\b`, 'g');
  const matches: RenameMatch[] = [];
  const changed: Record<string, string> = {};

  for (const [filePath, content] of Object.entries(files)) {
    const lines = content.split('\n');
    let fileChanged = false;
    const newLines = lines.map((line, lineIdx) => {
      let newLine = line;
      let m: RegExpExecArray | null;
      re.lastIndex = 0;
      while ((m = re.exec(line)) !== null) {
        matches.push({
          file: filePath,
          line: lineIdx + 1,
          col: m.index + 1,
          before: line.trim(),
          after: line.replace(new RegExp(`\\b${escapedOldName}\\b`, 'g'), () => newName).trim(),
        });
        fileChanged = true;
      }
      return newLine.replace(re, () => newName);
    });
    if (fileChanged) changed[filePath] = newLines.join('\n');
  }

  const filesAffected = Object.keys(changed);
  const diffLines: string[] = [];
  for (const [fp, newContent] of Object.entries(changed)) {
    diffLines.push(`--- a/${fp}`, `+++ b/${fp}`);
    const oldLines = files[fp].split('\n');
    const newLinesArr = newContent.split('\n');
    oldLines.forEach((l, i) => {
      if (l !== newLinesArr[i]) {
        diffLines.push(`-${l}`, `+${newLinesArr[i]}`);
      }
    });
  }

  return {
    old_name: oldName,
    new_name: newName,
    matches,
    files_affected: filesAffected,
    diff_preview: diffLines.join('\n'),
  };
}

export function applyRename(
  files: Record<string, string>,
  oldName: string,
  newName: string
): Record<string, string> {
  const re = new RegExp(`\\b${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
  const result: Record<string, string> = {};
  for (const [fp, content] of Object.entries(files)) {
    const newContent = content.replace(re, () => newName);
    if (newContent !== content) result[fp] = newContent;
  }
  return result;
}
