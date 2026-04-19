import { AuditLogger } from '../src/audit.js';

test('records analysis events with timestamp and repo', async () => {
  const logger = new AuditLogger();
  await logger.record({ action: 'analyze', repo: 'acme/backend', apiKey: 'gsp_abc', ip: '1.2.3.4' });
  const entries = await logger.query({ repo: 'acme/backend', limit: 10 });
  expect(entries).toHaveLength(1);
  expect(entries[0].action).toBe('analyze');
  expect(entries[0].timestamp).toBeDefined();
});

test('query filters by date range', async () => {
  const logger = new AuditLogger();
  await logger.record({ action: 'analyze', repo: 'r', apiKey: '', ip: '' });
  const entries = await logger.query({ since: new Date(Date.now() + 60000).toISOString(), limit: 10 });
  expect(entries).toHaveLength(0);
});
