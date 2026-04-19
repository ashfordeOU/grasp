import { evaluateRules } from '../src/config.js';

test('forbidden layer rule placeholder evaluates cleanly', () => {
  const cfg = { rules: [{ min_health_score: 90 }] };
  const result = evaluateRules(cfg, { score: 50, blastMap: {}, layers: [] });
  expect(result[0].message).toMatch(/50.*90/);
});
