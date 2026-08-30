---
trigger: always_on
---

# GraphCompose AI Flow — agent rules

You are working in **GraphCompose AI Flow** — a harness that turns a document
reference into a maintainable GraphCompose Java template, then renders,
compares and iterates until it is ready for approval.

**Read `AGENTS.md` at the repository root first, end-to-end.** It is the one
canonical contract: which of the four workflow skills (`skills/workflows/`)
owns the task, the seven invariants, the commands, and where each contract is
declared. `CLAUDE.md` is the same pointer for Claude Code. This file adds
nothing to either — if it ever appears to, `AGENTS.md` wins.

Two things worth knowing before you open anything:

- Work lands in the user's Java project under `graphcompose-flow/`, never in
  this repository's `examples/` (that is the workspace only when developing
  the harness itself).
- Start every run with `node scripts/preflight.mjs --project-dir <java-project>`;
  one loop pass is one `node scripts/render-and-diff.mjs` call.
