export interface OrmQuery {
  file: string;
  line: number;
  orm: 'prisma' | 'typeorm' | 'sequelize' | 'sqlalchemy';
  model: string;
  operation: string;
  confidence: number;
}

const ORM_PATTERNS: Array<{
  orm: OrmQuery['orm'];
  re: RegExp;
  extractModel: (m: RegExpExecArray) => string;
  extractOp: (m: RegExpExecArray) => string;
}> = [
  {
    orm: 'prisma',
    re: /prisma\.(\w+)\.(findMany|findFirst|findUnique|create|update|delete|upsert|count|aggregate)/g,
    extractModel: m => m[1],
    extractOp: m => m[2],
  },
  {
    orm: 'typeorm',
    re: /(?:repository|getRepository)\((\w+)\)\.(find|findOne|save|delete|count)/g,
    extractModel: m => m[1],
    extractOp: m => m[2],
  },
  {
    orm: 'sequelize',
    re: /(\w+)\.(findAll|findOne|create|update|destroy|count)\s*\(/g,
    extractModel: m => m[1],
    extractOp: m => m[2],
  },
  {
    orm: 'sqlalchemy',
    re: /(?:session|db)\.(query|execute|add|delete)\s*\(/g,
    extractModel: () => 'unknown',
    extractOp: m => m[1],
  },
];

export function detectOrmQueries(filePath: string, content: string): OrmQuery[] {
  const results: OrmQuery[] = [];

  for (const pattern of ORM_PATTERNS) {
    pattern.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.re.exec(content)) !== null) {
      const lineNum = content.slice(0, m.index).split('\n').length;
      results.push({
        file: filePath,
        line: lineNum,
        orm: pattern.orm,
        model: pattern.extractModel(m),
        operation: pattern.extractOp(m),
        confidence: 0.85,
      });
    }
  }

  return results;
}
