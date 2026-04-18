import {
  extractTableRefs,
  buildCouplingReport,
  findSharedTableClusters,
  type TableRef,
} from '../src/db-coupling';

// ── extractTableRefs ─────────────────────────────────────────────────────────

describe('extractTableRefs — SQLAlchemy', () => {
  it('detects __tablename__ assignment', () => {
    const src = `class User(Base):\n    __tablename__ = 'users'\n`;
    const refs = extractTableRefs('models/user.py', src);
    expect(refs.some(r => r.table === 'users' && r.kind === 'model' && r.orm === 'sqlalchemy')).toBe(true);
  });

  it('detects ForeignKey reference', () => {
    const src = `address_id = Column(Integer, ForeignKey('addresses.id'))`;
    const refs = extractTableRefs('models/user.py', src);
    expect(refs.some(r => r.table === 'addresses' && r.kind === 'relation')).toBe(true);
  });

  it('detects both tablename and FK in same file', () => {
    const src = `
      __tablename__ = 'orders'
      user_id = Column(Integer, ForeignKey('users.id'))
    `;
    const refs = extractTableRefs('models/order.py', src);
    expect(refs.some(r => r.table === 'orders' && r.kind === 'model')).toBe(true);
    expect(refs.some(r => r.table === 'users' && r.kind === 'relation')).toBe(true);
  });
});

describe('extractTableRefs — TypeORM', () => {
  it('detects @Entity decorator with table name', () => {
    const src = `@Entity('products')\nexport class Product {}`;
    const refs = extractTableRefs('src/entities/product.ts', src);
    expect(refs.some(r => r.table === 'products' && r.orm === 'typeorm')).toBe(true);
  });
});

describe('extractTableRefs — Sequelize', () => {
  it('detects .define() pattern', () => {
    const src = `const User = sequelize.define('users', { name: DataTypes.STRING });`;
    const refs = extractTableRefs('src/models/user.js', src);
    expect(refs.some(r => r.table === 'users' && r.orm === 'sequelize')).toBe(true);
  });

  it('detects tableName: option', () => {
    const src = `User.init({}, { tableName: 'user_accounts', sequelize });`;
    const refs = extractTableRefs('src/models/user.js', src);
    expect(refs.some(r => r.table === 'user_accounts' && r.orm === 'sequelize')).toBe(true);
  });
});

describe('extractTableRefs — Drizzle', () => {
  it('detects pgTable()', () => {
    const src = `export const users = pgTable('users', { id: serial('id').primaryKey() });`;
    const refs = extractTableRefs('src/schema.ts', src);
    expect(refs.some(r => r.table === 'users' && r.orm === 'drizzle')).toBe(true);
  });

  it('detects mysqlTable()', () => {
    const src = `export const posts = mysqlTable('blog_posts', { id: int('id').primaryKey() });`;
    const refs = extractTableRefs('src/schema.ts', src);
    expect(refs.some(r => r.table === 'blog_posts' && r.orm === 'drizzle')).toBe(true);
  });
});

describe('extractTableRefs — Mongoose', () => {
  it('converts model name to snake_case plural', () => {
    const src = `mongoose.model('UserProfile', userProfileSchema);`;
    const refs = extractTableRefs('src/models/user-profile.js', src);
    expect(refs.some(r => r.table === 'user_profiles' && r.orm === 'mongoose')).toBe(true);
  });
});

describe('extractTableRefs — Prisma', () => {
  it('detects model block', () => {
    const src = `model Product {\n  id Int @id\n  name String\n}`;
    const refs = extractTableRefs('prisma/schema.prisma', src);
    expect(refs.some(r => r.table === 'products' && r.orm === 'prisma')).toBe(true);
  });
});

describe('extractTableRefs — raw SQL', () => {
  it('detects SELECT FROM', () => {
    const src = `const res = await db.query('SELECT * FROM users WHERE id = $1', [id]);`;
    const refs = extractTableRefs('src/db/user-repo.ts', src);
    expect(refs.some(r => r.table === 'users' && r.kind === 'query' && r.orm === 'raw')).toBe(true);
  });

  it('detects INSERT INTO', () => {
    const src = `await db.query("INSERT INTO orders (user_id) VALUES ($1)", [userId]);`;
    const refs = extractTableRefs('src/db/orders.ts', src);
    expect(refs.some(r => r.table === 'orders' && r.kind === 'query')).toBe(true);
  });

  it('filters SQL keywords from results', () => {
    const src = `SELECT name FROM users WHERE id = 1`;
    const refs = extractTableRefs('src/q.sql', src);
    const tables = refs.map(r => r.table);
    expect(tables).not.toContain('where');
    expect(tables).not.toContain('select');
    expect(tables).toContain('users');
  });
});

describe('extractTableRefs — Knex', () => {
  it('detects knex() table ref', () => {
    const src = `return knex('customers').where({ id }).first();`;
    const refs = extractTableRefs('src/repo/customer.ts', src);
    expect(refs.some(r => r.table === 'customers' && r.orm === 'knex')).toBe(true);
  });
});

describe('extractTableRefs — Alembic migration', () => {
  it('detects op.create_table', () => {
    const src = `op.create_table('invoice_items', sa.Column('id', sa.Integer))`;
    const refs = extractTableRefs('migrations/001_create_invoices.py', src);
    expect(refs.some(r => r.table === 'invoice_items' && r.kind === 'migration' && r.orm === 'alembic')).toBe(true);
  });
});

describe('extractTableRefs — deduplication', () => {
  it('does not emit duplicate (table, kind, orm) for same file', () => {
    const src = `
      __tablename__ = 'users'
      __tablename__ = 'users'
    `;
    const refs = extractTableRefs('models/user.py', src);
    const usersModel = refs.filter(r => r.table === 'users' && r.kind === 'model');
    expect(usersModel).toHaveLength(1);
  });
});

describe('extractTableRefs — line numbers', () => {
  it('returns approximate line number', () => {
    const src = `line1\nline2\n__tablename__ = 'users'\nline4`;
    const refs = extractTableRefs('models/user.py', src);
    const r = refs.find(r => r.table === 'users');
    expect(r?.line).toBeGreaterThanOrEqual(3);
  });
});

// ── buildCouplingReport ──────────────────────────────────────────────────────

describe('buildCouplingReport', () => {
  it('builds correct table map from multiple files', () => {
    const files = [
      { path: 'src/user.ts', content: `@Entity('users') class User {}` },
      { path: 'src/order.ts', content: `@Entity('orders') class Order {}\nForeignKey('users.id')` },
      { path: 'src/repo.ts', content: `SELECT * FROM users; SELECT * FROM orders` },
    ];
    const report = buildCouplingReport(files);
    expect(report.tables['users']).toContain('src/user.ts');
    expect(report.tables['users']).toContain('src/order.ts');
    expect(report.tables['users']).toContain('src/repo.ts');
    expect(report.tableCount).toBeGreaterThanOrEqual(2);
    expect(report.fileCount).toBe(3);
  });

  it('identifies god tables used by ≥5 files', () => {
    const files = Array.from({ length: 6 }, (_, i) => ({
      path: `src/file${i}.ts`,
      content: `const q = knex('shared_table').where({});`,
    }));
    const report = buildCouplingReport(files);
    expect(report.godTablesFiles).toContain('shared_table');
  });

  it('identifies high-coupling files with ≥10 tables', () => {
    const tables = Array.from({ length: 12 }, (_, i) => `table_${i}`);
    const content = tables.map(t => `const r = knex('${t}').first();`).join('\n');
    const files = [{ path: 'src/big-service.ts', content }];
    const report = buildCouplingReport(files);
    expect(report.highCouplingFiles).toHaveLength(1);
    expect(report.highCouplingFiles[0].tableCount).toBeGreaterThanOrEqual(10);
  });

  it('returns empty report for files with no table refs', () => {
    const files = [
      { path: 'src/utils.ts', content: `export function add(a: number, b: number) { return a + b; }` },
    ];
    const report = buildCouplingReport(files);
    expect(report.tableCount).toBe(0);
    expect(report.fileCount).toBe(0);
  });

  it('does not duplicate a file in a table entry', () => {
    const src = `knex('orders').select(); knex('orders').insert()`;
    const files = [{ path: 'src/order.ts', content: src }];
    const report = buildCouplingReport(files);
    expect(report.tables['orders']).toHaveLength(1);
  });
});

// ── findSharedTableClusters ──────────────────────────────────────────────────

describe('findSharedTableClusters', () => {
  it('finds file pairs with shared tables above threshold', () => {
    const report = buildCouplingReport([
      { path: 'src/a.ts', content: `knex('t1').x; knex('t2').x; knex('t3').x;` },
      { path: 'src/b.ts', content: `knex('t1').x; knex('t2').x; knex('t3').x;` },
      { path: 'src/c.ts', content: `knex('t4').x;` },
    ]);
    const clusters = findSharedTableClusters(report, 2);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].files).toContain('src/a.ts');
    expect(clusters[0].files).toContain('src/b.ts');
    expect(clusters[0].sharedTables.sort()).toEqual(['t1', 't2', 't3'].sort());
  });

  it('returns empty when no pair shares enough tables', () => {
    const report = buildCouplingReport([
      { path: 'src/a.ts', content: `knex('t1').x;` },
      { path: 'src/b.ts', content: `knex('t2').x;` },
    ]);
    const clusters = findSharedTableClusters(report, 3);
    expect(clusters).toHaveLength(0);
  });

  it('sorts by number of shared tables descending', () => {
    const report = buildCouplingReport([
      { path: 'a.ts', content: `knex('t1'); knex('t2'); knex('t3');` },
      { path: 'b.ts', content: `knex('t1'); knex('t2'); knex('t3');` },
      { path: 'c.ts', content: `knex('t1'); knex('t2');` },
      { path: 'd.ts', content: `knex('t1'); knex('t2');` },
    ]);
    const clusters = findSharedTableClusters(report, 2);
    expect(clusters[0].sharedTables.length).toBeGreaterThanOrEqual(clusters[clusters.length - 1].sharedTables.length);
  });
});
