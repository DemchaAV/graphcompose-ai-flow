# Orchestration Decision

## Task

Revise `revision-003` to close three reference-parity gaps the user
flagged on `examples/cv-reference/reference/reference-page-2.png` and
to make icon sizing part of the asset flow.

## Decision

This is a revision of `revision-003`. The orchestrator opens
`revision-004` as a DRAFT and routes the work through the documented
chain again — but with the new contract enforced by the Asset Resolver
Agent: each icon's document point size is declared in
`asset-request.json` and carried into `assets-manifest.json` so the
Template Coder reads sizing from the flow instead of hard-coding it.

```text
Architecture Mapper → asset-request.json (with pointSize per icon)
                  ↓
Asset Resolver     → assets-manifest.json (carries pointSize)
                  ↓
Template Coder     → reads ICONS table from manifest
                  ↓
Test + Render      → output.pdf + output.png + output-page-2.png
```

## Scope

- Replace `mdi:check-decagram-outline` (heavy decagram) with
  `mdi:check-circle-outline` (thin-line circle + check), and grow the
  Expertise badge from ~22pt to ~38pt to match the reference.
- Replace `mdi:twitter` / `mdi:facebook` / `mdi:pinterest` /
  `mdi:linkedin` (outline brand glyphs) with
  `entypo-social:twitter-with-circle` and the three companions
  (filled black circle with white brand glyph). Size at ~13pt.
- Rebuild the Awards and References blocks as real two-column
  layouts inside the Main column, using `TableBuilder` with two
  fixed-width columns. The row-per-line approach keeps per-line
  text styling (label vs small) and avoids the SectionNode-as-table-cell
  path which the PDF backend does not render for this case.
- Extend the asset-resolver request schema with a `pointSize` field
  per icon; surface it in the manifest so the Java template never
  hard-codes per-token point constants.

## Out Of Scope For This Revision

- Multi-page visual-diff scoring (still tracked in
  `docs/visual-review-loop.md`).
- Reading `assets-manifest.json` from Java at runtime — the manifest
  is read by the Template Coder agent at generation time and mirrored
  into the {@code ICONS} table inside {@code GeneratedCvTemplate}.
- Downloading non-bundled Google Fonts as TTF (still
  `manual_drop_required` in the resolver).
