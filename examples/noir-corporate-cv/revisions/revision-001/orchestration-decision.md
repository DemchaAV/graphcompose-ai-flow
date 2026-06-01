# Orchestration Decision

## Task

Create the first GraphCompose template draft from the supplied
single-page corporate-CV reference screenshot.

## Decision

This is a new document-template generation task. The orchestrator:

- created the project skeleton at `examples/noir-corporate-cv/`,
- copied the supplied PNG into `reference/reference.png` and wrote
  a paired `reference.md` describing every visible region,
- opened `revision-001` as a DRAFT,
- routed the chain through Version + Skill Resolver →
  Skill Validator → Visual Analyzer → Architecture Mapper →
  Asset Resolver → Template Coder → Test + Render → Visual Review →
  Revision Manager (the standard 11-agent chain documented in
  `AGENTS.md`).

## Scope

- Build a single-page semantic CV template.
- Use GraphCompose page flow, rows, sections, paragraphs, lists,
  lines, inline images.
- Pull contact and interest icons from Iconify through the
  `asset-resolver` CLI so the icon set / point sizes are recorded in
  `assets-manifest.json`.
- Render `output.pdf` and `output.png` (single page).

## Out Of Scope For This Draft

- The dark aubergine sidebar plate, the dark section-header bars, the
  rounded identity card, and the dark filled `CV` circle are deferred
  to revision-002+ where the `backgrounds-and-panels` and
  `shapes-and-containers` skills will be wired in. Revision-001 ships
  the structural skeleton only — every dark surface is rendered as
  plain text with the heading style instead of a filled panel.
- The rating dots in SKILLS and LANGUAGES are rendered as Unicode
  `●` / `○` glyphs in body copy. A glyph-image or filled-circle table
  will replace them in a later revision.
- A typed `NoirCorporateCvSpec` + `NoirCorporateCvSpecProvider` split
  is deferred; revision-001 embeds the fixture content in the
  template, matching how `cv-reference/revision-001` shipped before
  it split into a spec record.
- Pixel-perfect parity against the reference. The visual review for
  revision-001 classifies the dark-fill omissions as ACCEPTED
  LIMITATIONS to be addressed in revision-002+.
