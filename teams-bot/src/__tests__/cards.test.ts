import { buildHealthCard } from '../cards';

test('card has required AdaptiveCard structure', () => {
  const card = buildHealthCard({ repo: 'org/app', grade: 'B', score: 78, issues: [] });
  expect(card.type).toBe('AdaptiveCard');
  expect(card.body).toBeDefined();
  expect(card.version).toBe('1.4');
});

test('card contains repo name', () => {
  const card = buildHealthCard({ repo: 'my/project', grade: 'A', score: 95 });
  const body = card.body as Array<{type: string; facts?: Array<{title: string; value: string}>}>;
  const factSet = body.find(b => b.type === 'FactSet');
  expect(factSet?.facts?.some(f => f.value === 'my/project')).toBe(true);
});

test('grade A gets Good color', () => {
  const card = buildHealthCard({ repo: 'org/app', grade: 'A', score: 95 });
  const body = card.body as Array<{type: string; color?: string}>;
  const header = body[0];
  expect(header.color).toBe('Good');
});

test('grade F gets Attention color', () => {
  const card = buildHealthCard({ repo: 'org/app', grade: 'F', score: 10 });
  const body = card.body as Array<{type: string; color?: string}>;
  expect(body[0].color).toBe('Attention');
});

test('issues block added when issues present', () => {
  const card = buildHealthCard({ repo: 'org/app', grade: 'D', score: 40, issues: ['circular dep'] });
  const body = card.body as Array<{type: string; text?: string}>;
  expect(body.some(b => b.text?.includes('circular dep'))).toBe(true);
});
