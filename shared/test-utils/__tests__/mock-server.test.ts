import { setupMockServer } from '../mock-server/index';

const server = setupMockServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

test('github mock returns repo data', async () => {
  const res = await fetch('https://api.github.com/repos/test/repo');
  const json = await res.json() as { full_name: string };
  expect(json.full_name).toBe('test/repo');
});

test('slack mock accepts chat.postMessage', async () => {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: 'C123', text: 'hello' }),
  });
  const json = await res.json() as { ok: boolean };
  expect(json.ok).toBe(true);
});

test('bitbucket mock returns repo data', async () => {
  const res = await fetch('https://api.bitbucket.org/2.0/repositories/testuser/testrepo');
  const json = await res.json() as { full_name: string };
  expect(json.full_name).toBe('testuser/testrepo');
});

test('linear mock returns issue data', async () => {
  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '{ teams { nodes { id } } }' }),
  });
  const json = await res.json() as { data: { teams: { nodes: Array<{id: string}> } } };
  expect(json.data.teams.nodes[0].id).toBe('team-123');
});
