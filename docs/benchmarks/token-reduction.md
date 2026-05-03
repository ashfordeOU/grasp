# Grasp Token-Reduction Benchmark

Generated: 2026-05-03T17:55:58.747Z

Naive baseline = total source-character count / 4 (approximate token cost of reading every file).
Grasp minimal = `grasp_minimal_context` response length / 4.

| Repo | Ref | Files | Lines | Naive tokens | Grasp tokens | Reduction |
|------|-----|------:|------:|-------------:|-------------:|----------:|
| got | `v14.0.0` | 69 | 17,713 | 113,438 | 35 | 3241.09x |
| **Average** | | | | | | **3241.09x** |
