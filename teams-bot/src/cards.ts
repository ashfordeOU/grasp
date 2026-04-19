export interface HealthResult {
  repo: string;
  grade: string;
  score: number;
  issues?: string[];
}

export function buildHealthCard(result: HealthResult): Record<string, unknown> {
  const color =
    result.grade === 'A' ? 'Good' : result.grade <= 'C' ? 'Warning' : 'Attention';

  const facts = [
    { title: 'Repository', value: result.repo },
    { title: 'Grade', value: result.grade },
    { title: 'Score', value: `${result.score}/100` },
  ];

  const body: unknown[] = [
    {
      type: 'TextBlock',
      text: 'Grasp Health Report',
      weight: 'Bolder',
      size: 'Large',
      color,
    },
    { type: 'FactSet', facts },
  ];

  if (result.issues && result.issues.length > 0) {
    body.push({
      type: 'TextBlock',
      text: `Issues: ${result.issues.join(', ')}`,
      wrap: true,
      color: 'Warning',
    });
  }

  return {
    type: 'AdaptiveCard',
    version: '1.4',
    body,
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
  };
}
