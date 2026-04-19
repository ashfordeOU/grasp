import tiny from '../fixtures/tiny.json';
import medium from '../fixtures/medium.json';
import large from '../fixtures/large.json';

test('tiny fixture has required shape', () => {
  expect(tiny).toHaveProperty('files');
  expect(tiny).toHaveProperty('healthScore');
  expect(tiny).toHaveProperty('dependencies');
});
test('medium fixture has >50 files', () => expect(medium.files.length).toBeGreaterThan(50));
test('large fixture has >200 files', () => expect(large.files.length).toBeGreaterThan(200));
