import {
  formatTicketSummary,
  buildAtlassianDocDescription,
  createJiraTicket,
} from '../index';

test('formats ticket summary for circular-dep', () => {
  const summary = formatTicketSummary({ file: 'src/db.ts', violation: 'circular-dep', grade: 'F' });
  expect(summary).toBe('[Grasp] Circular dependency in src/db.ts — Grade: F');
});

test('formats ticket summary for security-issue', () => {
  const summary = formatTicketSummary({ file: 'src/api.ts', violation: 'security-issue', grade: 'D' });
  expect(summary).toContain('[Grasp]');
  expect(summary).toContain('src/api.ts');
  expect(summary).toContain('Grade: D');
});

test('buildAtlassianDocDescription creates ADF structure', () => {
  const doc = buildAtlassianDocDescription('Test description') as {
    type: string;
    version: number;
    content: Array<{ type: string; content: Array<{ type: string; text: string }> }>;
  };
  expect(doc.type).toBe('doc');
  expect(doc.version).toBe(1);
  expect(doc.content[0].type).toBe('paragraph');
  expect(doc.content[0].content[0].text).toBe('Test description');
});

test('createJiraTicket calls httpPost with correct structure', async () => {
  const mockPost = jest.fn().mockResolvedValue({ key: 'PROJ-1', id: '10001' });
  const result = await createJiraTicket(
    { summary: 'test', description: 'test desc', projectKey: 'PROJ' },
    mockPost
  );
  expect(mockPost).toHaveBeenCalledWith(
    expect.stringContaining('/rest/api/3/issue'),
    expect.objectContaining({
      fields: expect.objectContaining({
        project: { key: 'PROJ' },
        summary: 'test',
      }),
    }),
    expect.objectContaining({ 'Content-Type': 'application/json' })
  );
  expect(result.key).toBe('PROJ-1');
});
