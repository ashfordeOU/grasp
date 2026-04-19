import { CollabRoom } from '../src/collab.js';

test('CollabRoom tracks connected clients', () => {
  const room = new CollabRoom('session-abc');
  const fakeSocket = { send: jest.fn(), readyState: 1, on: jest.fn() };
  room.join('user-1', fakeSocket as any);
  expect(room.clientCount).toBe(1);
  room.broadcast('user-1', { type: 'selection', file: 'src/auth.ts' });
  expect(fakeSocket.send).not.toHaveBeenCalled();
});

test('CollabRoom broadcasts to other clients', () => {
  const room = new CollabRoom('session-abc');
  const s1 = { send: jest.fn(), readyState: 1, on: jest.fn() };
  const s2 = { send: jest.fn(), readyState: 1, on: jest.fn() };
  room.join('user-1', s1 as any);
  room.join('user-2', s2 as any);
  room.broadcast('user-1', { type: 'selection', file: 'src/auth.ts' });
  expect(s2.send).toHaveBeenCalledWith(expect.stringContaining('auth.ts'));
  expect(s1.send).not.toHaveBeenCalled();
});
