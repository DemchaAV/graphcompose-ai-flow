# GitHub Copilot — repository instructions

You are working in **GraphCompose AI Template Flow** — a kit that turns a visual
document reference into a maintainable GraphCompose Java template under a strict
visual-parity contract.

**Read `AGENTS.md` (repo root) first, end-to-end.** It is the canonical
onboarding: entry-point dispatch, the 11-agent chain, project anatomy, and the
cross-cutting principles. The cross-agent contract is `prompts/master-prompt.md`;
per-stage prompts are `prompts/<agent>-agent.md`. These rules summarize
`AGENTS.md` — if they ever differ, `AGENTS.md` wins.

## Non-negotiables
- Every change creates a NEW revision under `examples/<project>/revisions/`; never
  overwrite an APPROVED one (DRAFT / APPROVED / REJECTED / REVERTED / SUPERSEDED /
  FAILED).
- Reconstruct documents with semantic GraphCompose primitives — never draw PDFs
  with raw coordinates.
- Relational geometry: derive widths/weights from base constants; hardcode pixels
  only for genuinely independent dimensions.
- Anchor-first: `LayerAlign` / `TextAlign` / `weights(...)`, not hand-computed offsets.
- Data-spec: variable content lives in `<doc-kind>-data.json` via a `--spec-provider`;
  no content literals in Java.
- Asset flow: Iconify icons via `tools/asset-resolver`, bundled fonts via
  `FontName.<NAME>`; `assets-manifest.json` is the source of truth.
- Parity gate: refactor-only revisions must show `magick compare -metric AE == 0`
  vs the parent; quote the metric in `visual-review.md`.
- GraphCompose is the source of truth — never invent APIs; fix the skill if it disagrees.

## Tooling
- Setup: `npm run setup` (or `./setup.ps1` / `./setup.sh`).
- New project from a template: `node tools/revision-manager/bin/graphcompose-flow.mjs init <name> --template invoice`.
- See/run the agent chain: `node scripts/run-pipeline.mjs <project-id>`.
- Render a revision: `node scripts/render.mjs <project-id> <revision-id>`.
