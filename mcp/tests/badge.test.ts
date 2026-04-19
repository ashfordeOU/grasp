import { generateBadgeSvg } from '../src/badge';

test('generates SVG with health grade', () => {
  const svg = generateBadgeSvg('A', 95);
  expect(svg).toContain('<svg');
  expect(svg).toContain('A');
});

test('uses correct color for grade A', () => {
  expect(generateBadgeSvg('A', 95)).toContain('#4c1');
});
