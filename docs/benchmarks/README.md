# Benchmarks

## Token-reduction harness

`scripts/eval-token-reduction.mjs` measures how many tokens an LLM saves by querying Grasp's
`grasp_minimal_context` instead of reading every source file in a repo.

### How to run

```bash
# Build the MCP server first
cd mcp && node build.mjs && cd ..

# Run the full benchmark (clones 6 OSS repos to /tmp/grasp-eval, ~5 minutes)
node scripts/eval-token-reduction.mjs

# Or run just one
node scripts/eval-token-reduction.mjs --only gin
```

Outputs:
- `docs/benchmarks/token-reduction.md` — human-readable table
- `docs/benchmarks/token-reduction.json` — machine-readable

### What it measures

- **Naive tokens**: total source character count across `*.{js,ts,py,go,rb,...}` divided by 4
  (rough OpenAI-tokeniser approximation).
- **Grasp tokens**: byte-length of the `grasp_minimal_context` response divided by 4.
- **Reduction**: `naive / grasp`.

The minimal-context tool is intentionally tiny — typically sub-100 tokens — so reductions are
dramatic (often 100x+) on multi-thousand-file repos. This is the LLM's _first_ orientation call;
deeper queries (`grasp_traverse`, `grasp_semantic_search`, `grasp_query_graph`) cost more but
are still bounded by token budgets you set.

### Last manually verified

- `got` @ v14.0.0: **113,438 → 35 tokens = 3,241x reduction** (1 small TS repo, used as a smoke test).

A 3,241x ratio on a single repo shouldn't be the headline stat — it's the floor of what `grasp_minimal_context` is designed to do (give the LLM a sub-100-token "where am I" summary). The realistic number to quote is the average across all 6 repos. Run the full benchmark and use that.

### Repos covered

| Key | Repo | Ref |
|-----|------|-----|
| express | expressjs/express | 4.19.2 |
| flask   | pallets/flask     | 2.3.0  |
| gin     | gin-gonic/gin     | v1.9.1 |
| got     | sindresorhus/got  | v14.0.0|
| lodash  | lodash/lodash     | 4.17.21|
| axios   | axios/axios       | v1.6.0 |
