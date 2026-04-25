import { cosine } from '../src/embed';

test('cosine similarity of identical vectors is 1', () => {
  const v = new Float32Array([0.5, 0.5, 0.0]);
  expect(cosine(v, v)).toBeCloseTo(1.0, 4);
});

test('cosine similarity of orthogonal vectors is 0', () => {
  const a = new Float32Array([1, 0, 0]);
  const b = new Float32Array([0, 1, 0]);
  expect(cosine(a, b)).toBeCloseTo(0.0, 4);
});
