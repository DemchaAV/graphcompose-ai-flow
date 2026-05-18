# Orchestration Decision

## Task

Revise the CV reference template to consume external design assets
through the documented agent flow.

## Decision

This is a revision of `revision-002`. The orchestrator opens
`revision-003` as a DRAFT under `examples/cv-reference`, keeps the
visual structure from `revision-002`, and routes the work through the
asset chain that until now was specified only in the prompts:

```text
Architecture Mapper → Asset Resolver → Template Coder → Test + Render
```

The Architecture Mapper writes `asset-request.json` declaring every
icon token (contact + social + expertise badge) and the font roles.
The Asset Resolver downloads the icons through the Iconify HTTP API
and validates the chosen Google Fonts family against
`DefaultFonts.googleFamilies()`. The Template Coder reads
`assets-manifest.json` for every icon path and font name; it never
hard-codes a literal letter for an icon and never references a font
the manifest does not list.

## Scope

- Replace text icon placeholders (`P / E / A / W / [t] / [f] / ...`)
  with PNG icons under `assets/icons/`.
- Replace the inline `V` badge above the Expertise section with a
  proper Iconify check-decagram icon.
- Switch typography from `FontName.HELVETICA` to a bundled Google
  family (`Poppins`) for heading + body roles.
- Keep the full-width mint divider and measured skill bars from
  `revision-002`.

## Out Of Scope For This Revision

- Multi-page visual-diff scoring.
- Pixel-perfect parity for letter spacing.
- Custom (non-bundled) Google Fonts download — bundled families cover
  this revision; the `google-fonts` source path is left for a future
  revision and is documented in `tools/asset-resolver/README.md`.
