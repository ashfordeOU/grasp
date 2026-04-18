import { buildComment, findExistingComment, upsertComment } from '../src/comment.js';

const baseSummary = {
  score: 82,
  grade: 'B',
  fileCount: 120,
  functionCount: 450,
  issueCount: 3,
  criticalIssueCount: 0,
  circularDepCount: 1,
  securityIssueCount: 0,
  layers: ['ui', 'services', 'utils'],
};

describe('buildComment', () => {
  test('contains the Grasp marker for upsert detection', () => {
    const comment = buildComment(baseSummary, 'owner/repo', 'My PR', 'https://grasp.dev/');
    expect(comment).toContain('<!-- grasp-health-report -->');
  });

  test('includes health score', () => {
    const comment = buildComment(baseSummary, 'owner/repo', 'My PR', 'https://grasp.dev/');
    expect(comment).toContain('82/100');
  });

  test('includes grade', () => {
    const comment = buildComment(baseSummary, 'owner/repo', 'My PR', 'https://grasp.dev/');
    expect(comment).toContain('**B**');
  });

  test('includes file count', () => {
    const comment = buildComment(baseSummary, 'owner/repo', 'My PR', 'https://grasp.dev/');
    expect(comment).toContain('120');
  });

  test('includes PR title', () => {
    const comment = buildComment(baseSummary, 'owner/repo', 'Fix auth bug', 'https://grasp.dev/');
    expect(comment).toContain('Fix auth bug');
  });

  test('includes repo link', () => {
    const comment = buildComment(baseSummary, 'owner/repo', 'Fix auth bug', 'https://grasp.dev/');
    expect(comment).toContain('owner/repo');
  });

  test('shows security check mark when no security issues', () => {
    const comment = buildComment({ ...baseSummary, securityIssueCount: 0 }, 'owner/repo', 'PR', 'https://g.dev/');
    expect(comment).toContain('✓');
  });

  test('shows security badge when security issues exist', () => {
    const comment = buildComment({ ...baseSummary, securityIssueCount: 2 }, 'owner/repo', 'PR', 'https://g.dev/');
    expect(comment).toContain('🔐');
    expect(comment).toContain('2 security');
  });

  test('shows critical issue warning', () => {
    const comment = buildComment({ ...baseSummary, criticalIssueCount: 1 }, 'owner/repo', 'PR', 'https://g.dev/');
    expect(comment).toContain('⚠️');
    expect(comment).toContain('1 critical');
  });

  test('shows layers', () => {
    const comment = buildComment(baseSummary, 'owner/repo', 'PR', 'https://g.dev/');
    expect(comment).toContain('ui, services, utils');
  });

  test('shows "none" when no layers', () => {
    const comment = buildComment({ ...baseSummary, layers: [] }, 'owner/repo', 'PR', 'https://g.dev/');
    expect(comment).toContain('none');
  });

  test('score bar has 10 characters total', () => {
    const comment = buildComment(baseSummary, 'owner/repo', 'PR', 'https://g.dev/');
    const barMatch = comment.match(/`([█░]+)`/);
    expect(barMatch).toBeTruthy();
    expect(barMatch![1].length).toBe(10);
  });
});

describe('findExistingComment', () => {
  test('returns comment ID when grasp marker is found', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: 101, body: '<!-- grasp-health-report -->\n## 📊 Grasp Health Report' },
        { id: 102, body: 'Some other comment' },
      ],
    }) as typeof fetch;

    const id = await findExistingComment('owner', 'repo', 1, 'token');
    expect(id).toBe(101);
  });

  test('returns null when no grasp comment exists', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: 99, body: 'Normal comment without marker' },
      ],
    }) as typeof fetch;

    const id = await findExistingComment('owner', 'repo', 1, 'token');
    expect(id).toBeNull();
  });

  test('returns null on API error', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({ ok: false }) as typeof fetch;
    const id = await findExistingComment('owner', 'repo', 1, 'token');
    expect(id).toBeNull();
  });
});

describe('upsertComment', () => {
  test('POSTs when no existing comment', async () => {
    // First fetch: list comments (none found), second fetch: create
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true }) as typeof fetch;

    await upsertComment('owner', 'repo', 1, 'token', 'body');
    const calls = (global.fetch as jest.Mock).mock.calls;
    expect(calls[1][1].method).toBe('POST');
    expect(calls[1][0]).toContain('/1/comments');
  });

  test('PATCHes when existing comment found', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 42, body: '<!-- grasp-health-report -->' }],
      })
      .mockResolvedValueOnce({ ok: true }) as typeof fetch;

    await upsertComment('owner', 'repo', 1, 'token', 'body');
    const calls = (global.fetch as jest.Mock).mock.calls;
    expect(calls[1][1].method).toBe('PATCH');
    expect(calls[1][0]).toContain('/comments/42');
  });

  test('throws on API failure', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: false, status: 403, text: async () => 'Forbidden' }) as typeof fetch;

    await expect(upsertComment('owner', 'repo', 1, 'token', 'body')).rejects.toThrow('403');
  });
});
