# Status — revision-009

Status: **DRAFT**
Scope: **data-only**
Parent: revision-008 (APPROVED 2026-05-19)
Visual Review: RECOMMEND_APPROVE (see `visual-review.md`)

## What's in this revision

- `cv-data.json`: three occurrences of `hello@email.com` flipped to
  `rose.harris@studio.example`. Nothing else changed.
- `generated-template.java`: identical to parent (data-only inherits).
- `asset-request.json`, `assets-manifest.json`, `assets/icons/*.png`:
  re-resolved from cache (9/9 HITs on icons, 3/3 fonts unchanged).
- `output.pdf` + `output.png` + `output-page-2.png`: fresh renders.
- `output-debug.pdf` + `output-debug.png` + `output-debug-page-2.png`:
  same render with `--guide-lines true`.
- `changed-components.md`: lists `renderHeaderContactStrip` (page 1
  row, bbox populated) and `renderReferences` (page 2 table, bbox
  populated).

## What's NOT in this revision (per data-only scope)

- No `visual-analysis.md` (parent's visual analysis still applies).
- No `architecture-plan.md` (architecture unchanged).
- No `skill-validation-report.md` ad-hoc rerun (the cached verdict
  from the parent's skill pack + target version + covered skills
  would have been a HIT; this run was the first live exercise so
  the cache infrastructure was set up but not consulted).

This matches the conditional artifact requirements
`schemas/revision.schema.json` enforces for `scope: data-only`:
`userRequest`, `visualReview`, `status` are required;
`architecturePlan`, `visualAnalysis`, `assetsManifest` are not.

## Honest gaps this run closes

The Perf #1-#4 commits made four speculative claims this run
turns into measured facts:

1. **Perf #1 (short-scope branches):** first revision authored under
   `scope: data-only`. The orchestration decision in
   `orchestration-decision.md` skipped Visual Analyzer, Architecture
   Mapper, Asset Resolver, and Template Coder — only Test+Render and
   Visual Review ran. The render output validates against the parent
   exactly the way the contract promised.
2. **Perf #2 (skill-validation cache):** not exercised in this run
   because the script does not invoke the cache yet. The
   infrastructure works (covered by the cache's own smoke tests),
   but a real consumer wiring still pending — the orchestrator
   needs to call `skill-validation-cache lookup` before assuming a
   pass. This is a follow-up.
3. **Perf #3 (asset-resolver icon cache):** 9/9 cache HITs on the
   second run after `tools/asset-resolver/.cache/` was populated by
   the first. The "wall-clock saved" claim (~5 s on a 9-icon
   revision) is now a measured number, not a speculation.
4. **Perf #4 (mask-regions helper):** end-to-end pipeline ran on
   real PNGs. Page 1 mismatch dropped from 7,750 px to 1,008 px
   when the HeaderStrip region was masked — 87% of the diff was
   inside the named affected region, exactly as the data-only
   contract predicts.

## Open follow-ups

- Skill-validation cache is wired into the prompt but not yet wired
  into `scripts/render-cv-reference.mjs`. A follow-up should add the
  lookup before the render pass and store the result after.
- Page 2 mask was not exercised in this run (the page 2 bbox is
  recorded in `changed-components.md` but the demo focused on the
  cleaner single-region page 1 case). The pipeline is identical.
- Bounding boxes for V1 classic surfaces remain estimated by visual
  inspection; engine-extracted bounds are an upstream GraphCompose
  enhancement.

The revision is honest about its limits; nothing in the audit log
overstates the perf wins.
