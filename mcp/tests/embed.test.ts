import { cosine, vecToBlob, blobToVec } from '../src/embed';

test('cosine similarity of identical vectors is 1', () => {
  const v = new Float32Array([0.5, 0.5, 0.0]);
  expect(cosine(v, v)).toBeCloseTo(1.0, 4);
});

test('cosine similarity of orthogonal vectors is 0', () => {
  const a = new Float32Array([1, 0, 0]);
  const b = new Float32Array([0, 1, 0]);
  expect(cosine(a, b)).toBeCloseTo(0.0, 4);
});

test('vecToBlob / blobToVec round-trips a vector exactly', () => {
  const original = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
  const buf = vecToBlob(original);
  const recovered = blobToVec(buf);
  expect(recovered.length).toBe(5);
  expect(recovered[0]).toBeCloseTo(original[0], 6);
  expect(recovered[4]).toBeCloseTo(original[4], 6);
});
