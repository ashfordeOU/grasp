import { buildHealthEmbed } from '../embeds';
import { parseAnalyzeCommand } from '../index';

test('embed has title and colour', () => {
  const embed = buildHealthEmbed({ repo: 'org/app', grade: 'A', score: 95 });
  expect(embed.title).toContain('Grasp');
  expect(embed.color).toBe(0x38a169);
});

test('grade F embed is red', () => {
  const embed = buildHealthEmbed({ repo: 'org/app', grade: 'F', score: 12 });
  expect(embed.color).toBe(0xe53e3e);
});

test('grade D embed is orange', () => {
  const embed = buildHealthEmbed({ repo: 'org/app', grade: 'D', score: 45 });
  expect(embed.color).toBe(0xed8936);
});

test('embed includes grade and score fields', () => {
  const embed = buildHealthEmbed({ repo: 'org/app', grade: 'B', score: 80 });
  expect(embed.fields.some(f => f.name === 'Grade' && f.value === 'B')).toBe(true);
  expect(embed.fields.some(f => f.name === 'Score' && f.value === '80/100')).toBe(true);
});

test('parseAnalyzeCommand extracts repo', () => {
  expect(parseAnalyzeCommand('/grasp analyze owner/repo')).toBe('owner/repo');
});

test('parseAnalyzeCommand returns null for non-analyze', () => {
  expect(parseAnalyzeCommand('/grasp help')).toBeNull();
});
