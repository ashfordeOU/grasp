import { renderProgressBar } from '../src/cli';

test('renderProgressBar fills proportionally', () => {
  const bar = renderProgressBar(5, 10, 'src/auth.ts', 20);
  expect(bar).toContain('█');
  expect(bar).toContain('░');
  expect(bar).toContain('5/10');
});

test('full bar at 100%', () => {
  const bar = renderProgressBar(10, 10, 'done', 20);
  expect(bar).not.toContain('░');
});
