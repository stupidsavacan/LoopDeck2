# Code quality guardrails

LoopDeck uses TypeScript and behavior checks for correctness. Source layout is free: there are no file/function size limits or mandatory expansion/compression rules. Prefer changes that can be located, compared and verified mechanically.

## Local commands

- `npm run lint` — runs stricter TypeScript checks plus source AST checks for discarded Promises, unsafe escapes, and debug leftovers.
- `npm run format` — optional formatting of changed TypeScript, CSS, JSON, and Markdown with `prettier@3.9.9`.
- `npm run format:check` — optional style check; it is not a CI or `check` gate.
- `npm run readability` — prints a file/function navigation list, with no size warnings.
- `npm run code:map` — writes the generated, ignored `.codex-code-map.json` for machine queries.
- `npm run check` — runs lint, typecheck, dependency architecture, dead-code, code-map generation and behavior tests.

The code map contains imports (including re-exports/dynamic imports), exported names, function locations and body hashes. Body hashes ignore whitespace/comments and normalize literal spelling, so mechanically moved functions can be compared across paths. File content hashes allow an agent to detect an outdated index. Regenerate the index after edits; it is not authoritative application source.

Generated, archive, Android, QA-output, and built single-file artifacts are excluded through `.prettierignore`.

Keep public entry points and persistence formats stable during structural refactoring. Functions may be moved, combined, expanded or compressed when it improves debugging; correctness checks, dependency-cycle checks and regression tests remain mandatory.
