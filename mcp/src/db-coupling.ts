/**
 * Grasp DB Schema Coupling Detector
 *
 * Scans source files for ORM model definitions and raw SQL/query patterns,
 * then maps source files to the database tables they touch.
 *
 * Supported patterns:
 *   - SQLAlchemy  (Python): __tablename__ = 'table', Column(...), relationship(...)
 *   - TypeORM     (TS/JS):  @Entity('table'), @Column, @ManyToOne, @OneToMany
 *   - Sequelize   (TS/JS):  define('table', ...), Model.init({...}, {tableName: 'table'})
 *   - Prisma      (schema): model ModelName { ... }  → snake_cases to table name
 *   - Drizzle     (TS/JS):  pgTable('table', ...), mysqlTable('table', ...), sqliteTable('table', ...)
 *   - Mongoose    (TS/JS):  new Schema({...}), model('ModelName', ...)
 *   - Raw SQL                SELECT/INSERT/UPDATE/DELETE FROM table
 *   - knex/Objection:       knex('table'), table('table')
 */

export interface TableRef {
  table: string;
  file: string;
  line?: number;
  kind: 'model' | 'query' | 'relation' | 'migration';
  orm?: string;     // 'sqlalchemy' | 'typeorm' | 'sequelize' | 'prisma' | 'drizzle' | 'mongoose' | 'raw' | 'knex'
}

export interface FileTableCoupling {
  file: string;
  tables: string[];
  kinds: Record<string, string>;  // tableName → kind
  orms: Record<string, string>;   // tableName → orm
}

export interface TableCouplingReport {
  tables: Record<string, string[]>;    // tableName → files that use it
  fileCouplings: FileTableCoupling[];
  highCouplingFiles: Array<{ file: string; tableCount: number }>;
  highCouplingTables: Array<{ table: string; fileCount: number }>;
  godTablesFiles: string[];            // tables touched by ≥5 files
  tableCount: number;
  fileCount: number;
}

// ── Pattern Matchers ─────────────────────────────────────────────────────────

interface ExtractedRef {
  table: string;
  kind: TableRef['kind'];
  orm: string;
}

const PATTERNS: Array<{
  name: string;
  regex: RegExp;
  extract: (match: RegExpExecArray) => ExtractedRef | null;
}> = [
  // SQLAlchemy: __tablename__ = 'users'
  {
    name: 'sqlalchemy-tablename',
    regex: /__tablename__\s*=\s*['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]/g,
    extract: (m) => ({ table: m[1], kind: 'model', orm: 'sqlalchemy' }),
  },
  // SQLAlchemy relationship / ForeignKey
  {
    name: 'sqlalchemy-fk',
    regex: /ForeignKey\(['"]([a-zA-Z_][a-zA-Z0-9_]*)\.[\w]+['"]\)/g,
    extract: (m) => ({ table: m[1], kind: 'relation', orm: 'sqlalchemy' }),
  },
  // TypeORM @Entity('table') or @Entity()
  {
    name: 'typeorm-entity',
    regex: /@Entity\(\s*['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]\s*\)/g,
    extract: (m) => ({ table: m[1], kind: 'model', orm: 'typeorm' }),
  },
  // TypeORM @JoinTable / @JoinColumn with name
  {
    name: 'typeorm-jointable',
    regex: /@(?:JoinTable|RelationId)\(\s*\{\s*name\s*:\s*['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]/g,
    extract: (m) => ({ table: m[1], kind: 'relation', orm: 'typeorm' }),
  },
  // Sequelize: define('table', ...) or Model.init({...}, { tableName: 'table' })
  {
    name: 'sequelize-define',
    regex: /\.define\(\s*['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]/g,
    extract: (m) => ({ table: m[1], kind: 'model', orm: 'sequelize' }),
  },
  {
    name: 'sequelize-tablename',
    regex: /tableName\s*:\s*['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]/g,
    extract: (m) => ({ table: m[1], kind: 'model', orm: 'sequelize' }),
  },
  // Drizzle: pgTable('table', ...) / mysqlTable / sqliteTable
  {
    name: 'drizzle-table',
    regex: /(?:pgTable|mysqlTable|sqliteTable)\(\s*['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]/g,
    extract: (m) => ({ table: m[1], kind: 'model', orm: 'drizzle' }),
  },
  // Mongoose: model('ModelName', schema) → snake_case + pluralize heuristic
  {
    name: 'mongoose-model',
    regex: /\.model\(\s*['"]([A-Za-z][a-zA-Z0-9_]*)['"]/g,
    extract: (m) => ({
      table: toSnakePlural(m[1]),
      kind: 'model',
      orm: 'mongoose',
    }),
  },
  // Prisma schema: model ModelName { — table name is snake_case of ModelName
  {
    name: 'prisma-model',
    regex: /^model\s+([A-Z][a-zA-Z0-9_]*)\s*\{/gm,
    extract: (m) => ({
      table: toSnakePlural(m[1]),
      kind: 'model',
      orm: 'prisma',
    }),
  },
  // Raw SQL: FROM table / JOIN table / UPDATE table SET / INSERT INTO table
  {
    name: 'sql-from',
    regex: /\b(?:FROM|JOIN|UPDATE|INTO)\s+([a-zA-Z_][a-zA-Z0-9_.]*)\b/gi,
    extract: (m) => {
      const t = m[1].toLowerCase();
      // Skip SQL keywords and very generic names
      if (SQL_KEYWORDS.has(t) || t.length < 2) return null;
      return { table: t, kind: 'query', orm: 'raw' };
    },
  },
  // knex('table') / this.knex('table')
  {
    name: 'knex-table',
    regex: /\bknex\(\s*['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]\s*\)/g,
    extract: (m) => ({ table: m[1], kind: 'query', orm: 'knex' }),
  },
  // Objection: .table('name') or table = 'name'
  {
    name: 'objection-table',
    regex: /static\s+(?:get\s+)?tableName\s*(?:=|:)\s*['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]/g,
    extract: (m) => ({ table: m[1], kind: 'model', orm: 'objection' }),
  },
  // Alembic / raw migration: op.create_table('name'), op.add_column('name')
  {
    name: 'alembic-migration',
    regex: /op\.(?:create_table|drop_table|add_column|drop_column|alter_column|create_index)\s*\(\s*['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]/g,
    extract: (m) => ({ table: m[1], kind: 'migration', orm: 'alembic' }),
  },
  // TypeORM migration: table.createColumn('name') / createTable name
  {
    name: 'typeorm-migration',
    regex: /await\s+queryRunner\.(?:createTable|dropTable|addColumn|dropColumn)\s*\(\s*(?:new\s+Table\(\s*\{[^}]*name\s*:\s*)?['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]/g,
    extract: (m) => ({ table: m[1], kind: 'migration', orm: 'typeorm' }),
  },
];

const SQL_KEYWORDS = new Set([
  'select', 'where', 'and', 'or', 'not', 'null', 'true', 'false',
  'values', 'set', 'on', 'as', 'by', 'order', 'group', 'having',
  'limit', 'offset', 'returning', 'with', 'case', 'when', 'then',
  'else', 'end', 'distinct', 'all', 'any', 'exists', 'in', 'like',
  'between', 'is', 'using', 'natural', 'cross', 'inner', 'outer',
  'left', 'right', 'full', 'union', 'intersect', 'except',
]);

/** Convert CamelCase to snake_case and naive pluralize. */
function toSnakePlural(name: string): string {
  const snake = name
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .toLowerCase();
  // Naive pluralization: append 's' if not already plural
  if (!snake.endsWith('s')) return snake + 's';
  return snake;
}

// ── Core extractor ───────────────────────────────────────────────────────────

/**
 * Scan a single file's source for table references.
 */
export function extractTableRefs(filePath: string, source: string): TableRef[] {
  const refs: TableRef[] = [];
  const seen = new Set<string>();

  for (const pattern of PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(source)) !== null) {
      const extracted = pattern.extract(match);
      if (!extracted) continue;
      const key = `${extracted.table}:${extracted.kind}:${extracted.orm}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Estimate line number
      const line = source.slice(0, match.index).split('\n').length;
      refs.push({
        table: extracted.table,
        file: filePath,
        line,
        kind: extracted.kind,
        orm: extracted.orm,
      });
    }
  }

  return refs;
}

/**
 * Analyze a collection of files and return the DB coupling report.
 */
export function buildCouplingReport(
  fileContents: Array<{ path: string; content: string }>,
): TableCouplingReport {
  const tableMap: Record<string, string[]> = {};
  const fileCouplings: FileTableCoupling[] = [];

  for (const { path, content } of fileContents) {
    const refs = extractTableRefs(path, content);
    if (refs.length === 0) continue;

    const tables = [...new Set(refs.map(r => r.table))];
    const kinds: Record<string, string> = {};
    const orms: Record<string, string> = {};

    for (const ref of refs) {
      // Prefer model > relation > migration > query for kind
      const existing = kinds[ref.table];
      if (!existing || kindRank(ref.kind) > kindRank(existing as TableRef['kind'])) {
        kinds[ref.table] = ref.kind;
      }
      if (!orms[ref.table]) orms[ref.table] = ref.orm ?? 'unknown';
    }

    fileCouplings.push({ file: path, tables, kinds, orms });

    for (const table of tables) {
      if (!tableMap[table]) tableMap[table] = [];
      if (!tableMap[table].includes(path)) tableMap[table].push(path);
    }
  }

  const GOD_TABLE_THRESHOLD = 5;
  const HIGH_COUPLING_FILE_THRESHOLD = 10;

  const highCouplingFiles = fileCouplings
    .filter(f => f.tables.length >= HIGH_COUPLING_FILE_THRESHOLD)
    .sort((a, b) => b.tables.length - a.tables.length)
    .map(f => ({ file: f.file, tableCount: f.tables.length }));

  const highCouplingTables = Object.entries(tableMap)
    .filter(([, files]) => files.length >= 3)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([table, files]) => ({ table, fileCount: files.length }));

  const godTablesFiles = Object.entries(tableMap)
    .filter(([, files]) => files.length >= GOD_TABLE_THRESHOLD)
    .map(([table]) => table);

  return {
    tables: tableMap,
    fileCouplings,
    highCouplingFiles,
    highCouplingTables,
    godTablesFiles,
    tableCount: Object.keys(tableMap).length,
    fileCount: fileCouplings.length,
  };
}

function kindRank(kind: TableRef['kind']): number {
  return { model: 4, relation: 3, migration: 2, query: 1 }[kind] ?? 0;
}

/**
 * Return files that share the most tables — potential coupling hotspots.
 */
export function findSharedTableClusters(
  report: TableCouplingReport,
  minSharedTables = 3,
): Array<{ files: string[]; sharedTables: string[] }> {
  const clusters: Array<{ files: string[]; sharedTables: string[] }> = [];
  const couplings = report.fileCouplings;

  for (let i = 0; i < couplings.length; i++) {
    for (let j = i + 1; j < couplings.length; j++) {
      const a = new Set(couplings[i].tables);
      const b = new Set(couplings[j].tables);
      const shared = [...a].filter(t => b.has(t));
      if (shared.length >= minSharedTables) {
        clusters.push({
          files: [couplings[i].file, couplings[j].file],
          sharedTables: shared,
        });
      }
    }
  }

  return clusters.sort((a, b) => b.sharedTables.length - a.sharedTables.length);
}
