# JSON Export Schema Reference

The JSON export (Download JSON button) produces the following structure:

```json
{
  "meta": {
    "generatedAt": "2026-04-15T10:00:00.000Z",
    "repo": "owner/repo",
    "version": "1.0"
  },
  "ci": {
    "passed": true,
    "score": 82,
    "threshold": 70,
    "failures": [],
    "warnings": [
      { "title": "15 Highly Coupled" }
    ]
  },
  "stats": {
    "files": 123,
    "functions": 456,
    "loc": 12000,
    "connections": 789,
    "dead": 34,
    "folders": 12
  },
  "health": {
    "score": 82,
    "grade": "B"
  },
  "issues": [
    {
      "type": "critical",
      "title": "3 Circular Dependencies",
      "desc": "Circular dependency chains found",
      "items": [
        {
          "name": "A → B → A",
          "files": ["src/a.js", "src/b.js"]
        }
      ]
    }
  ],
  "securityIssues": [
    {
      "type": "Hardcoded Secret",
      "severity": "high",
      "pattern": "API_KEY",
      "file": "src/config.js",
      "line": 42,
      "code": "const API_KEY = 'abc123'"
    }
  ],
  "files": [
    {
      "path": "src/utils/helpers.js",
      "name": "helpers.js",
      "folder": "src/utils",
      "lines": 150,
      "layer": "utils",
      "churn": 5,
      "functions": [
        {
          "name": "formatDate",
          "line": 12,
          "type": "arrow",
          "isExported": true,
          "isTopLevel": true,
          "codeLines": 8,
          "calls": 14
        }
      ],
      "complexity": {
        "score": 12,
        "level": "medium"
      },
      "nestingDepth": 4
    }
  ],
  "connections": [
    {
      "source": "src/utils/helpers.js",
      "target": "src/components/App.js",
      "fn": "formatDate",
      "count": 3
    }
  ],
  "patterns": [
    {
      "name": "Singleton",
      "icon": "🔒",
      "desc": "...",
      "severity": "info",
      "files": [{ "name": "db.js", "path": "src/db.js" }],
      "metrics": { "instances": 1 }
    }
  ],
  "suggestions": [
    {
      "priority": "critical",
      "icon": "🔄",
      "title": "Break Circular Dependencies",
      "desc": "...",
      "action": "Extract shared code to a new module",
      "impact": "Improves testability"
    }
  ]
}
```

## CI/CD Integration

The `ci` object is designed for use in automated pipelines:

```yaml
# GitHub Actions example
- name: Check Grasp health
  run: |
    PASSED=$(cat grasp-report.json | jq '.ci.passed')
    SCORE=$(cat grasp-report.json | jq '.ci.score')
    echo "Health score: $SCORE"
    if [ "$PASSED" != "true" ]; then
      echo "Grasp CI check failed"
      cat grasp-report.json | jq '.ci.failures'
      exit 1
    fi
```

## Failure Conditions

`ci.passed` is `false` when any of these occur:
- Health score < `THRESHOLDS.healthPassScore` (default: 70)
- Any circular dependencies exist
- Any high-severity security issues found

## Architecture Rules in Export

If architecture rule violations are found, they appear in `issues` as:
```json
{
  "type": "critical",
  "title": "N Architecture Violations",
  "items": [
    {
      "name": "utils → services",
      "file": "src/utils/api.js",
      "toFile": "src/services/auth.js",
      "fn": "authenticate"
    }
  ]
}
```
