# CLAUDE.md — GraphCompose AI Flow

**Read [`AGENTS.md`](AGENTS.md) first, end-to-end.** It is the canonical
onboarding file: which skill owns the task, the seven invariants, the
commands, and where each contract is declared. This file is a thin
pointer so Claude Code loads the same contract; if the two ever differ,
`AGENTS.md` wins.

## The shape of the work

- The workflow is four skills under `skills/workflows/` — `create-template`,
  `revise-template`, `review-template`, `approve-template`. Routing, gates
  and loop bounds are declared once in `config/pipeline.json`.
- Work lands in the **user's Java project**, under
  `<their project>/graphcompose-flow/projects/<id>/revisions/` — never in
  this repository's `examples/`, which is the workspace only when
  developing the harness itself.
- Every change opens a new revision (`graphcompose-flow new-revision`,
  which carries the parent's sources forward). Never overwrite an
  APPROVED revision; statuses are owned by `tools/revision-manager`.

## Non-negotiables (details in AGENTS.md)

- Never invent GraphCompose API: the pinned pack's allow-list is closed.
- Semantic primitives, relational geometry, anchors — never raw
  coordinates or hand-computed offsets.
- Content lives in `<doc-kind>-data.json` behind a typed spec.
- Prove parity: `render-and-diff --against parent` reporting
  `mismatchPx: 0` is a gate result; "looks identical" is not.
- One loop pass is one `render-and-diff` call; a bare `render.mjs` leaves
  the revision unmeasured.

## Entry points

- `node scripts/preflight.mjs --project-dir <java-project> [--project <id>]` — start here.
- `node scripts/render-and-diff.mjs --project <id> --revision <id>` — render, diff, regions, evidence, gates.
- `node scripts/iterate-status.mjs <id>` — may the loop continue (after `visual-review.json` is written).
- `npm run setup` — build the tools that ship as source; `npm run verify` — every gate CI runs.
