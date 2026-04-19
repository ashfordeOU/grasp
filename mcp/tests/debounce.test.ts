import { debounce } from '../src/cli';

test('debounce delays execution', done => {
  let calls = 0;
  const fn = debounce(() => { calls++; }, 50);
  fn(); fn(); fn();
  setTimeout(() => { expect(calls).toBe(1); done(); }, 100);
});
