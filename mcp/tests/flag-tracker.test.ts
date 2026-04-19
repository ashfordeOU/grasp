import { trackFlags } from '../src/flag-tracker';

const files = [
  { path: 'src/payments.ts', content: `ldClient.variation('new-checkout', false);\ngb.isOn('dark-mode');`, layer: 'services' },
  { path: 'src/app.ts', content: `process.env.FEATURE_NEW_UI;\nprocess.env.FF_BETA;`, layer: 'ui' },
  { path: 'src/legacy.ts', content: `features.enabled('old-feature');\nisFeatureEnabled('deprecated-flow')`, layer: 'services' },
];

test('finds LaunchDarkly flags', () => {
  const result = trackFlags(files);
  const names = result.flags.map(f => f.name);
  expect(names).toContain('new-checkout');
});

test('finds GrowthBook flags', () => {
  const result = trackFlags(files);
  expect(result.flags.map(f => f.name)).toContain('dark-mode');
});

test('finds env-var feature flags', () => {
  const result = trackFlags(files);
  const names = result.flags.map(f => f.name);
  expect(names).toContain('FEATURE_NEW_UI');
  expect(names).toContain('FF_BETA');
});

test('finds custom feature flag patterns', () => {
  const result = trackFlags(files);
  const names = result.flags.map(f => f.name);
  expect(names).toContain('old-feature');
  expect(names).toContain('deprecated-flow');
});
