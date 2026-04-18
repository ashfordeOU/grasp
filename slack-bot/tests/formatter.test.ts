import {
  buildSlackAlert, buildSlackDigest,
  buildTeamsAlert, buildTeamsDigest,
  shouldAlert,
  type HealthSnapshot,
} from '../src/formatter.js';

function snap(overrides: Partial<HealthSnapshot> = {}): HealthSnapshot {
  return {
    repo: 'owner/repo',
    healthScore: 85,
    healthGrade: 'B',
    fileCount: 120,
    issueCount: 3,
    circularCount: 0,
    securityCount: 0,
    analyzedAt: '2024-01-15T10:00:00Z',
    ...overrides,
  };
}

// ── buildSlackAlert ──────────────────────────────────────────────────────────

describe('buildSlackAlert', () => {
  it('includes the repo name in the header', () => {
    const payload = buildSlackAlert(snap());
    const str = JSON.stringify(payload);
    expect(str).toContain('owner/repo');
  });

  it('includes health score', () => {
    const payload = buildSlackAlert(snap({ healthScore: 72 }));
    expect(JSON.stringify(payload)).toContain('72');
  });

  it('shows critical level for score below threshold', () => {
    const payload = buildSlackAlert(snap({ healthScore: 35 }));
    expect(JSON.stringify(payload)).toContain('Critical');
  });

  it('shows warning level for score between warn and critical thresholds', () => {
    const payload = buildSlackAlert(snap({ healthScore: 55 }));
    expect(JSON.stringify(payload)).toContain('Warning');
  });

  it('shows ok level for healthy score', () => {
    const payload = buildSlackAlert(snap({ healthScore: 90 }));
    expect(JSON.stringify(payload)).toContain('Healthy');
  });

  it('includes a view report button when reportUrl is provided', () => {
    const payload = buildSlackAlert(snap({ reportUrl: 'https://grasp.dev/report/123' }));
    expect(JSON.stringify(payload)).toContain('grasp.dev');
    expect(JSON.stringify(payload)).toContain('View Report');
  });

  it('uses danger style for critical report button', () => {
    const payload = buildSlackAlert(snap({ healthScore: 20, reportUrl: 'https://grasp.dev/r' }));
    expect(JSON.stringify(payload)).toContain('"style":"danger"');
  });

  it('uses custom thresholds', () => {
    // Score 70 is normally 'warn' (below 60 is warn by default, but above 40)
    // With custom threshold warnScore=80, score 70 is warn
    const payload = buildSlackAlert(snap({ healthScore: 70 }), { warnScore: 80 });
    expect(JSON.stringify(payload)).toContain('Warning');
  });
});

// ── buildSlackDigest ─────────────────────────────────────────────────────────

describe('buildSlackDigest', () => {
  const repos = [
    snap({ repo: 'org/alpha', healthScore: 90, healthGrade: 'A' }),
    snap({ repo: 'org/beta', healthScore: 60, healthGrade: 'C' }),
    snap({ repo: 'org/gamma', healthScore: 45, healthGrade: 'D' }),
  ];

  it('includes the week label', () => {
    const payload = buildSlackDigest(repos, 'Jan 15, 2024');
    expect(JSON.stringify(payload)).toContain('Jan 15, 2024');
  });

  it('includes all repo names', () => {
    const payload = buildSlackDigest(repos, 'Jan 15');
    const str = JSON.stringify(payload);
    expect(str).toContain('org/alpha');
    expect(str).toContain('org/beta');
    expect(str).toContain('org/gamma');
  });

  it('shows average score', () => {
    const payload = buildSlackDigest(repos, 'week');
    // avg = (90 + 60 + 45) / 3 = 65
    expect(JSON.stringify(payload)).toContain('65');
  });
});

// ── buildTeamsAlert ──────────────────────────────────────────────────────────

describe('buildTeamsAlert', () => {
  it('produces Adaptive Card format', () => {
    const payload = buildTeamsAlert(snap());
    const str = JSON.stringify(payload);
    expect(str).toContain('AdaptiveCard');
    expect(str).toContain('application/vnd.microsoft.card.adaptive');
  });

  it('includes repo name and health score', () => {
    const payload = buildTeamsAlert(snap({ repo: 'my-org/my-repo', healthScore: 78 }));
    const str = JSON.stringify(payload);
    expect(str).toContain('my-org/my-repo');
    expect(str).toContain('78');
  });

  it('includes action button when reportUrl provided', () => {
    const payload = buildTeamsAlert(snap({ reportUrl: 'https://grasp.dev/r/1' }));
    expect(JSON.stringify(payload)).toContain('Action.OpenUrl');
  });
});

// ── buildTeamsDigest ─────────────────────────────────────────────────────────

describe('buildTeamsDigest', () => {
  it('produces Adaptive Card format', () => {
    const payload = buildTeamsDigest([snap()], 'Jan 20');
    expect(JSON.stringify(payload)).toContain('AdaptiveCard');
  });

  it('includes all repos', () => {
    const repos = [snap({ repo: 'a/b' }), snap({ repo: 'c/d' })];
    const payload = buildTeamsDigest(repos, 'week');
    const str = JSON.stringify(payload);
    expect(str).toContain('a/b');
    expect(str).toContain('c/d');
  });
});

// ── shouldAlert ──────────────────────────────────────────────────────────────

describe('shouldAlert', () => {
  it('does not alert for healthy score with no changes', () => {
    const decision = shouldAlert(snap({ healthScore: 85 }), null);
    expect(decision.shouldAlert).toBe(false);
  });

  it('alerts when score below warn threshold', () => {
    const decision = shouldAlert(snap({ healthScore: 55 }), null);
    expect(decision.shouldAlert).toBe(true);
    expect(decision.level).toBe('warn');
  });

  it('alerts at critical level when below critical threshold', () => {
    const decision = shouldAlert(snap({ healthScore: 30 }), null);
    expect(decision.level).toBe('critical');
  });

  it('alerts on new security issues vs previous', () => {
    const prev = snap({ securityCount: 0 });
    const curr = snap({ securityCount: 2, healthScore: 80 });
    const decision = shouldAlert(curr, prev);
    expect(decision.shouldAlert).toBe(true);
    expect(decision.reasons.some(r => r.includes('security'))).toBe(true);
  });

  it('alerts on new circular deps vs previous', () => {
    const prev = snap({ circularCount: 0 });
    const curr = snap({ circularCount: 1, healthScore: 80 });
    const decision = shouldAlert(curr, prev);
    expect(decision.shouldAlert).toBe(true);
    expect(decision.reasons.some(r => r.includes('circular'))).toBe(true);
  });

  it('alerts on significant score drop', () => {
    const prev = snap({ healthScore: 90 });
    const curr = snap({ healthScore: 75 }); // drop of 15
    const decision = shouldAlert(curr, prev);
    expect(decision.shouldAlert).toBe(true);
    expect(decision.reasons.some(r => r.includes('dropped'))).toBe(true);
  });

  it('does not alert on small score drop', () => {
    const prev = snap({ healthScore: 88 });
    const curr = snap({ healthScore: 85 }); // drop of 3 — within tolerance
    const decision = shouldAlert(curr, prev);
    expect(decision.shouldAlert).toBe(false);
  });

  it('does not alert on improving security/circular counts', () => {
    const prev = snap({ securityCount: 3, circularCount: 2 });
    const curr = snap({ securityCount: 1, circularCount: 0, healthScore: 80 });
    const decision = shouldAlert(curr, prev);
    // Score is fine, counts improved — should not alert
    expect(decision.shouldAlert).toBe(false);
  });

  it('respects custom thresholds', () => {
    const decision = shouldAlert(snap({ healthScore: 70 }), null, { warnScore: 80 });
    expect(decision.shouldAlert).toBe(true);
    expect(decision.level).toBe('warn');
  });

  it('provides a list of reasons', () => {
    const prev = snap({ securityCount: 0 });
    const curr = snap({ healthScore: 35, securityCount: 2 });
    const decision = shouldAlert(curr, prev);
    expect(decision.reasons.length).toBeGreaterThanOrEqual(2);
  });
});
