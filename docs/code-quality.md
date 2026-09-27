# Code quality guardrails

LoopDeck keeps the existing TypeScript strict-mode and test suite, and adds a small set of repository-level guardrails for readability drift.

## Local commands

- `npm run lint` — runs TypeScript with unused-local, unreachable-code, and switch-fallthrough checks, then scans `src/` for explicit `any`, non-null assertions, `@ts-ignore` / `@ts-expect-error`, discarded Promises, `debugger`, and `console.log` / `console.debug` / `console.trace`.
- `npm run format` — formats only files changed in the current working tree with the exact `prettier@3.9.9` release.
- `npm run format:check` — check-only variant used by CI. On pull requests it checks files changed from the base branch; on pushes it checks the pushed commit.
- `npm run readability` — reports source files above 350 lines and functions above 180 lines. These are review signals only and do not fail CI.
- `npm run check` — runs formatting, lint, typecheck, and unit tests.

The changed-file formatting gate is intentional: adopting a formatter should prevent new drift without forcing a large unrelated reformat of the current source tree.

Generated, archive, Android, QA-output, and built single-file artifacts are excluded from formatting checks via `.prettierignore`.

Actual screen-controller decomposition remains outside this guardrail; the size report is only meant to make further growth visible.
