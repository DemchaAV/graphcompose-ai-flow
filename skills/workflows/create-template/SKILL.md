---
name: create-template
description: 'Turn a document reference — a screenshot, PDF, or design image of a CV, invoice, proposal, cover letter, report, certificate — into a maintainable GraphCompose Java template, then render, compare against the reference, and iterate until it is ready for approval. Use when the user supplies a reference and asks to recreate, rebuild, or generate it with GraphCompose: "create this document", "recreate this screenshot", "make this CV with GraphCompose", "build a template from this reference", "turn this PDF into a template".'
---

# Create a GraphCompose template from a reference

Reconstruct the document with **semantic GraphCompose primitives** —
sections, rows, weights, anchors, layer stacks. Never draw it with raw
coordinates: a coordinate drawing matches one reference at one size and
is unmaintainable the moment anything changes.

The work is four phases. Each has its own reference page with the
commands and the rules; this page is the order and the contract between
them. Read a phase's page when you reach it, not all four at once — what
you do not load is context the loop gets to spend on the real mismatch.

## When this applies

The user supplies a reference image or PDF and wants it as a template.
If a template already exists and they want it changed, use
`revise-template`.

## First, check nothing already does this

```bash
node scripts/templates.mjs --json
```

One command, no model, and it can end the task before it starts. If the
user named a published template — "use Northline", "another one like the
mint CV" — or a bundle's `docKind` and preview match what they are asking
for, offer that instead: `node scripts/templates.mjs inspect <id>`, then
`node scripts/use-template.mjs <id> --target <their-project>`. Reuse is a
file copy; reconstruction is the whole loop, and it lands *near* the
approved layout rather than on it.

Two things this does **not** mean. A reference the user supplied is still
a reference: do not talk them out of a new template because something in
the catalog is roughly similar. And a request to change a published
template's layout is `revise-template` on its source project, not a
reuse — see [Template Reuse First](../references/scope-routing.md#template-reuse-first--before-any-scope).

## The four phases

| Phase | Produces | Page |
|---|---|---|
| **1. Set up** — preflight, workspace, import the reference, settle the page size, open revision-001 | a project with `reference/reference.png`, a measured page, a first DRAFT | [create-1-setup.md](../references/create-1-setup.md) |
| **2. Analyse** — measure the reference in one call, describe it as regions with roles, flow and data, and resolve the assets it names | `visual-analysis.json`, `<doc-kind>-data.json` (+ overflow dataset when it flows), `asset-request.json`, `assets-manifest.json`, `architecture-plan.json` | [create-2-analyse.md](../references/create-2-analyse.md) |
| **3. Author** — write the template from the plan, against the pinned pack's allow-list | the template class, the spec provider | [create-3-author.md](../references/create-3-author.md) |
| **4. Loop** — render, measure, classify, fix one cause, repeat until the loop says stop | revisions with reviews, and a verdict | [create-4-loop.md](../references/create-4-loop.md) |

Three rules hold across all four:

- **Anything a script can decide is decided by a script.** Version,
  workspace, page size, the diff, the evidence, the loop verdict. Where a
  page below names a command, run it rather than working the answer out;
  the one-call batching rule in phase 2 is about exactly this cost.
- **Every render is a revision.** `node scripts/pass.mjs --project <id>
  --open "<what this pass fixes>"` opens the next one with the sources
  carried forward; re-rendering the same revision is how a loop hides ten
  measurements in one folder.
- **Loop until the tool says stop.** `READY_FOR_APPROVAL`,
  `CONVERGENCE_LIMIT_REACHED` and `BLOCKED` are the three places the loop
  ends on its own, and `iterate-status` is what says which. A successful
  render is not one of them.

## The stop, and the report

When the loop stops, report: what the document is and where it lives;
the parity verdict and the remaining mismatches, honestly; the paths to
`output.pdf` and `output.png`; that it is waiting for approval. End with
the metrics block (`node scripts/telemetry/run-metrics.mjs report
--project <id> --status <verdict>`) when it is available — and say nothing
about it when it is not. **Do not approve on the user's behalf**;
`approve-template` runs when they say so.

## Judgement calls

- **Do not open a revision for an ambiguous request.** One clarifying
  question first: which document kind, how many pages, is the sample
  content real or placeholder.
- **First render will not match.** That is expected — the loop is the
  method, not a fallback for a bad first attempt.
- **A reference that cannot be reproduced is a report, not a bodge.** If
  parity needs an API that does not exist, stop with
  `GRAPHCOMPOSE_API_LIMITATION` naming the API and what was tried — never
  fake the appearance with hardcoded offsets that break on the next content
  change. If it is a fact about the line the user can accept (a typeface no
  bundled family reproduces), record it once with
  `node scripts/limitations.mjs accept …` and the loop routes around it.

## Related

- [`../references/workspace.md`](../references/workspace.md) — roots, version, skill pack
- [`../references/authoring-rules.md`](../references/authoring-rules.md) — the non-negotiables
- [`../references/iteration-loop.md`](../references/iteration-loop.md) — bounds, failure categories, the render record, accepted limitations
- [`../review-template/SKILL.md`](../review-template/SKILL.md) · [`../revise-template/SKILL.md`](../revise-template/SKILL.md) · [`../approve-template/SKILL.md`](../approve-template/SKILL.md)
