# Orchestration Decision

## Classification

Revision of an existing project, not a new template project.

The supplied screenshot matches the already-created
`examples/noir-corporate-cv` reference. `revision-001` is DRAFT and explicitly
lists the missing visual fills and shape badge as follow-up work. This request
therefore opens `revision-002` from `revision-001`.

## Route

Run the focused revision path:

1. Version + Skill Resolver: retain GraphCompose 1.6.0 and
   `skills/versions/graphcompose-1.6`.
2. Skill Validator: rely on the already-smoked fixture APIs for
   `backgrounds-and-panels`, `shapes-and-containers`, and
   `spacing-and-alignment`; compile the revision as the concrete validation.
3. Architecture Mapper: keep the region map from revision-001, but replace
   deferred substitutions with real GraphCompose surfaces.
4. Asset Resolver: reuse the seven Iconify PNGs and Poppins font roles from
   the parent manifest.
5. Template Coder: convert the embedded fixture into
   `NoirCorporateCvSpec`, use `cv-data.json`, render panels/bars/shape dots.
6. Test + Render: run `scripts/render-noir-corporate-cv.mjs revision-002`.
7. Visual Review: compare to the reference and document remaining drift.

## Base revision

- Parent: `revision-001`
- New revision: `revision-002`
- Status after render: DRAFT
