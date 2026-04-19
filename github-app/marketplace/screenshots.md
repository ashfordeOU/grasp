# Required Screenshots for GitHub Marketplace Listing

The following screenshots are required before submitting the Grasp GitHub App to the Marketplace.
Each screenshot should be 1280x800px minimum, with clear, readable text.

## 1. PR Comment with Health Score

**File:** `screenshot-01-pr-health-score.png`

Shows the Grasp bot comment posted on a pull request, featuring:
- The overall health score badge (e.g. "B+")
- Summary table with Blast Radius count, circular dependency count, and security findings
- A brief explanation line linking to the full report

**Suggested repo:** Use a mid-sized open-source project with a realistic PR that touches 10–20 files.

---

## 2. Inline Review Comment at High-Severity Line

**File:** `screenshot-02-inline-review-comment.png`

Shows a GitHub review comment pinned to a specific line in the PR diff, featuring:
- The diff view with a red-highlighted line
- The Grasp inline comment beneath it (e.g. "Hardcoded API key detected — move to environment variable")
- Severity label (HIGH) visible in the comment

**Suggested scenario:** A file that introduces a hardcoded secret or an `eval()` call.

---

## 3. Team Dashboard with Multiple Repos

**File:** `screenshot-03-team-dashboard.png`

Shows the Grasp Team Dashboard at `grasp.ashforde.org/dashboard`, featuring:
- A list of 3–5 connected repositories with their latest health scores
- Score trend sparklines or badges (green A, yellow C, red F)
- "Last analysed" timestamps visible for each repo

**Suggested scenario:** Log in with a team account that has several repos installed.

---

## 4. SARIF Findings in Code Scanning UI

**File:** `screenshot-04-sarif-code-scanning.png`

Shows GitHub's native Code Scanning tab populated with Grasp findings, featuring:
- The "Security" → "Code scanning" tab in a GitHub repo
- At least two Grasp findings listed (e.g. "SQL injection risk", "Circular dependency")
- The "Tool: Grasp" filter applied so findings are clearly attributed

**Suggested scenario:** A repo with SARIF upload enabled and at least one merged PR that triggered findings.

---

## Notes

- Screenshots should use a light GitHub theme for maximum readability in Marketplace listings.
- Avoid showing any real credentials, tokens, or personally identifiable information.
- Crop to the relevant UI area — full-browser screenshots with bookmarks bars should be avoided.
- All four screenshots are required by GitHub before Marketplace submission can be approved.
