# Proposal Reference — Placeholder

This folder is **awaiting a reference image**. The orchestrator must
NOT open `revision-001` until a screenshot lands here.

## How to kick off `revision-001`

1. Drop the proposal screenshot into this folder as `reference.png`
   (PNG, ≥ 1200 px wide; multi-page proposals: drop
   `reference-page-1.png`, `reference-page-2.png`, ... and use
   `reference-page-1.png` as the canonical `reference.png`).
2. Optionally write a `reference.md` next to it describing brand /
   tone / proposal kind (statement of work, project proposal, sales
   proposal, grant application, ...).
3. Hand the user gesture:

   > "Create a proposal template from this screenshot."

The orchestrator routes that gesture through the 11-agent chain.

## Surface

GraphCompose 1.7.0 ships a single proposal preset upstream:

- Package: `com.demcha.compose.document.templates.proposal`
- Preset: `ModernProposal`
- Spec: `ProposalSpec` (single typed input record)

Unlike `cv.v2.*` (six layers: `data` / `theme` / `components` /
`widgets` / `presets`) and `coverletter.v2.*` (paired with CV), the
proposal surface is one preset over a flat spec. New visual variants
are authored as new preset classes that share `ProposalSpec` — not
as new layered stacks. The Template Coder should:

- Implement a new preset class alongside `ModernProposal` in the
  generated template (e.g. `BrandedProposalTemplate`) reusing
  `ProposalSpec` as input.
- NOT introduce a `proposal/v2/` parallel package — the proposal
  surface is already the current generation.
- Use the same DSL primitives (rows, sections, tables, layer stacks,
  shape containers, themes) the rest of the flow speaks.

See [`prompts/architecture-mapper-agent.md`](../../../prompts/architecture-mapper-agent.md)
§ "Template surface selection" for how to record the proposal
surface in `architecture-plan.md`.

## Why a scaffold (not a stub revision)

A pre-populated `revision-001/` would either be a fabricated visual
(which violates the strict visual-parity contract — there's nothing
to match against) or a duplicate of an existing example (which
violates the "every revision creates a new revision" rule). The
scaffold instead declares the project's existence and intent, records
the awaiting-reference state in `template-project.json.notes`, and
stays out of the orchestrator's way until a real reference arrives.

## When this file is no longer needed

Once `reference.png` is committed and `revision-001/` exists with
real artifacts, this placeholder should be deleted — the
`revision-001` audit log carries the historical record from that
point on.
