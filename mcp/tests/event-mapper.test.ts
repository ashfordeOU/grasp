import { mapEvents } from '../src/event-mapper';

const files = [
  { path: 'src/emitter.ts', content: `emitter.emit('user:created', data);\nemitter.emit('order:placed', order);`, layer: 'services' },
  { path: 'src/handler.ts', content: `emitter.on('user:created', handler);\nemitter.on('payment:failed', onFail);`, layer: 'services' },
  { path: 'src/ui.ts', content: `addEventListener('click', fn);\ndispatchEvent(new Event('resize'));`, layer: 'ui' },
];

test('finds emitters and subscribers', () => {
  const result = mapEvents(files);
  const userCreated = result.events.find(e => e.name === 'user:created');
  expect(userCreated).toBeDefined();
  expect(userCreated!.emitters.length).toBe(1);
  expect(userCreated!.subscribers.length).toBe(1);
});

test('detects orphaned events (emitted but never subscribed)', () => {
  const result = mapEvents(files);
  const orphaned = result.events.filter(e => e.orphaned).map(e => e.name);
  expect(orphaned).toContain('order:placed');
});

test('detects ghost subscribers (subscribed but never emitted)', () => {
  const result = mapEvents(files);
  const ghosts = result.events.filter(e => e.ghost).map(e => e.name);
  expect(ghosts).toContain('payment:failed');
});
