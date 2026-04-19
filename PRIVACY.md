# Privacy Policy

**Grasp — Code Architecture Suite**
Ashforde OÜ · hello@ashforde.org
Effective: 2026-04-19

---

## Summary

Grasp collects **no personal data**. All analysis runs locally on your machine. Nothing is sent to Ashforde OÜ or any third party.

---

## What Grasp Does

Grasp analyses the source code on your machine or fetches repository metadata from the GitHub or GitLab APIs (using your own credentials) to produce dependency graphs, health scores, and architecture diagrams.

## Data We Collect

**None.** Grasp does not collect, transmit, store, or process any personal data, usage data, telemetry, analytics, or crash reports. No account is required. No data ever leaves your machine except for the GitHub/GitLab API calls you explicitly initiate using your own token.

## GitHub / GitLab API Usage

When you provide a GitHub Personal Access Token (PAT) or GitHub App credentials, those credentials are stored only in your browser's `localStorage` or your IDE's local settings storage. They are never transmitted to Ashforde OÜ. API calls are made directly from your machine to the GitHub or GitLab API.

## IDE Plugins (VS Code, JetBrains, Neovim)

The IDE extensions communicate exclusively with the Grasp CLI (`grasp-mcp-server`) running as a local process on your machine. No network requests are made to Ashforde OÜ.

## MCP Server

The `grasp-mcp-server` npm package runs as a local process. It reads files from your local filesystem or fetches repository data from GitHub/GitLab using credentials you supply. It does not phone home.

## Third-Party Services

Grasp does not integrate with any third-party analytics, advertising, or tracking services.

## Changes

If this policy changes materially, the effective date above will be updated and a note will appear in the release changelog.

## Contact

Questions? Email us at hello@ashforde.org
