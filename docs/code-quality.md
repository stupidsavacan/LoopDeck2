# Code quality guardrails

LoopDeck keeps the existing TypeScript strict-mode and test suite, and adds a small set of repository-level guardrails for readability drift.

## Local commands

- `npm run lint` — runs stricter TypeScript checks plus source AST checks for discarded Promises, unsafe escapes, and debug leftovers.
- `npm run format` — formats changed TypeScript, CSS, JSON, and Markdown files with the exact `prettier@3.9.9` release.
- `npm run format:check` — check-only mode for CI, scoped to files changed from the PR base or the pushed commit.
- `npm run readability` — reports source files above 350 lines and functions above 180 lines without failing CI.
- `npm run check` — runs formatting, lint, typecheck, and unit tests.

The changed-file formatting gate prevents new drift without forcing a large unrelated reformat of the current source tree.

Generated, archive, Android, QA-output, and built single-file artifacts are excluded through `.prettierignore`.

Actual screen-controller decomposition remains outside this guardrail; the size report only makes further growth visible.
