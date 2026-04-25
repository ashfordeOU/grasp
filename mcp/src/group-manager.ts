import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const DEFAULT_DIR = path.join(os.homedir(), '.grasp');

interface Groups { [name: string]: string[] }

export class GroupManager {
  private file: string;

  constructor(dir?: string) {
    this.file = path.join(dir ?? DEFAULT_DIR, 'groups.json');
  }

  private read(): Groups {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return (typeof data === 'object' && data !== null && !Array.isArray(data)) ? data : {};
    } catch {
      return {};
    }
  }

  private write(groups: Groups): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(groups, null, 2));
  }

  addToGroup(name: string, source: string): void {
    const groups = this.read();
    const members = groups[name] ?? [];
    if (!members.includes(source)) members.push(source);
    groups[name] = members;
    this.write(groups);
  }

  removeFromGroup(name: string, source: string): void {
    const groups = this.read();
    if (groups[name]) groups[name] = groups[name].filter(s => s !== source);
    this.write(groups);
  }

  getGroup(name: string): string[] {
    return this.read()[name] ?? [];
  }

  listGroups(): Array<{ name: string; members: string[] }> {
    const groups = this.read();
    return Object.entries(groups).map(([name, members]) => ({ name, members }));
  }
}

export const groupManager = new GroupManager();
