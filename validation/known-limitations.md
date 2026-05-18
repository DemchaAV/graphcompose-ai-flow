# Known Limitations

These are the limitations accepted for the current 1.6.x skill pack.
The upstream framing — "honest limitations matter because the entire
framing of this project depends on not overpromising" — lives in
[../docs/limitations.md](../docs/limitations.md). The list below
narrows that framing to the validation surface: what the skill pack
plus fixtures can and cannot guarantee today.

## Rendering

Fixture smoke tests compile and run against GraphCompose 1.6.0 from
JitPack, so the covered API calls are no longer theoretical. The
full render step is still not automated through `preview-renderer
render`: fixture projects may create PDFs in their own Maven test
run, but the shared renderer does not yet instantiate templates or
refresh committed outputs. Mitigation: every fixture keeps an
`expected-output/` folder so the render runner has a baseline to diff
against once it is wired.

## Fonts

Exact font matching may be limited. The reference may use a font that
is not embedded in the GraphCompose distribution or in the test JVM.
A skill or template that renders correctly on one workstation can
render with a substituted font elsewhere. Mitigation: document font
substitutions in the fixture's `visual-review.md` or, for the
skill-pack-wide case, in `../docs/limitations.md`. The
`typography` skill is the place to record allowed substitutions.
When a new embeddable font is needed, use
[Google Fonts](https://fonts.google.com/) as the default source and
record the family, weights, source URL, and PDF-safe fallback.

## Color matching

Exact color matching depends on the renderer's color management,
PDF/A profile selection, and downstream PDF viewer. Hex values that
match in the skill source can drift by a few units when re-rendered
or compared on a different display. Mitigation: the
`themes-and-colors` skill recommends named theme tokens; visual
diffs use a tolerance band rather than exact-match comparison, and
out-of-band differences are classified as `MINOR` per
[../docs/visual-accuracy-contract.md](../docs/visual-accuracy-contract.md)
unless the visible change is large.

## Pagination

Pagination behavior depends on table content, font metrics, and the
exact GraphCompose release. A fixture that paginates at row N on
1.6.0 might paginate at row N+1 on 1.6.1. Mitigation: pagination
fixtures fix their data and column widths so that pagination is
deterministic; pagination drift on a real upgrade is classified as
`MAJOR` and triggers a skill-fix report against `pagination` or
`tables`.

## Exact pixel parity

Pixel-perfect parity between the reference image and the rendered
output is not a goal of this project. The visual accuracy contract
allows `MINOR` differences and `ACCEPTED_LIMITATION` differences as
long as they are documented. Mitigation: the visual-diff tool that
ships in Phase 7 uses the contract's classification, not a strict
byte-level comparison; fixtures that need exact parity must declare
that requirement explicitly in their `README.md`.

## Accepted vs unresolved

- Accepted limitations are the five above (rendering, fonts, color
  matching, pagination, exact pixel parity). They are documented
  here and in [../docs/limitations.md](../docs/limitations.md); the
  project does not commit to closing them in this skill pack.
- Unresolved limitations are surface gaps that the current smoke pass
  does not close:
  - No shared `preview-renderer render` template execution yet.
  - No automated visual-diff against fixture baselines yet.
  - The four `TODO(visual-review)` method-binding markers in the
    example revisions (shape-container logo builder, SectionBuilder
    corner-radius API, TableBuilder repeated-header method,
    column-mirror binding) — see
    [api-compatibility-checklist.md](api-compatibility-checklist.md#method-binding-todos).
  These are tracked as action items in
  [reports/phase-4-baseline.md](reports/phase-4-baseline.md).
