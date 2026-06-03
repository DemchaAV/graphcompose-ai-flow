# CLAUDE.md — GraphCompose AI Template Flow

**Read `AGENTS.md` (repo root) first, end-to-end, before doing anything in this
repository.** It is the canonical onboarding file: entry-point dispatch, the
11-agent chain, project anatomy, and the cross-cutting principles. This file is
a thin pointer so Claude Code loads the same contract. The cross-agent contract
is `prompts/master-prompt.md`; per-stage prompts are `prompts/<agent>-agent.md`.
These rules summarize `AGENTS.md` — if they ever differ, `AGENTS.md` wins.

## Non-negotiables
- Every change creates a NEW revision under `examples/<project>/revisions/`.
  Never overwrite an APPROVED revision. Statuses: DRAFT / APPROVED / REJECTED /
  REVERTED / SUPERSEDED / FAILED.
- Reconstruct documents with semantic GraphCompose primitives — never draw PDFs
  with raw coordinates.
- Relational geometry: derive widths/weights from base constants; hardcode pixels
  only for genuinely independent dimensions.
- Anchor-first: use `LayerAlign` / `TextAlign` / `weights(...)` instead of
  hand-computed offsets.
- Data-spec contract: variable content lives in `<doc-kind>-data.json`, loaded via
  a `--spec-provider`; no content literals in Java.
- Asset flow: Iconify icons via `tools/asset-resolver`, bundled Google Fonts via
  `FontName.<NAME>`; `assets-manifest.json` is the source of truth.
- Parity gate: refactor-only revisions must show `magick compare -metric AE == 0`
  vs the parent; quote the metric verbatim in `visual-review.md`.
- GraphCompose is the source of truth — never invent APIs; if a skill disagrees
  with the library, fix the skill.

## Tooling entry points
- Local setup: `npm run setup` (or `./setup.ps1` / `./setup.sh`).
- New project from a template: `node tools/revision-manager/bin/graphcompose-flow.mjs init <name> --template invoice`.
- See/run the agent chain for a project: `node scripts/run-pipeline.mjs <project-id>`.
- Render a revision: `node scripts/render.mjs <project-id> <revision-id>`.
