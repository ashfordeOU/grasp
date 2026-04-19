export interface HealthEmbed {
  title: string;
  color: number;
  fields: Array<{ name: string; value: string; inline?: boolean }>;
  footer: { text: string };
  timestamp?: string;
}

const GRADE_COLORS: Record<string, number> = {
  A: 0x38a169, // green
  B: 0x68d391, // light green
  C: 0xf6e05e, // yellow
  D: 0xed8936, // orange
  F: 0xe53e3e, // red
};

export function buildHealthEmbed(result: {
  repo: string;
  grade: string;
  score: number;
  issues?: string[];
}): HealthEmbed {
  const fields: HealthEmbed['fields'] = [
    { name: 'Grade', value: result.grade, inline: true },
    { name: 'Score', value: `${result.score}/100`, inline: true },
  ];

  if (result.issues && result.issues.length > 0) {
    fields.push({
      name: 'Issues',
      value: result.issues.slice(0, 5).join('\n'),
    });
  }

  return {
    title: `Grasp Health Report — ${result.repo}`,
    color: GRADE_COLORS[result.grade] ?? 0x718096,
    fields,
    footer: { text: 'Grasp Code Architecture Suite' },
    timestamp: new Date().toISOString(),
  };
}
