# Authoring rules

These hold for every scope and every document kind. They are the
difference between a template someone can maintain and a drawing that
happens to look right once.

## Never invent GraphCompose API

The pinned skill pack's `00-api-surface.md` is a generated allow-list of
every public authoring method and constant. **If a method, overload or
enum constant is not in it, it does not exist.** Grep the builder you
are about to call for its real signature before writing the call.

Resolve the pack with:

```bash
node scripts/resolve-version.mjs --project-dir <java-project> --json
```

Exit 3 means the pinned version has no pack. That is a stop, not a
licence to use the nearest pack — a 1.9 allow-list applied to a 2.x
project emits calls that do not compile, and the error will point at
the wrong cause.

When the library genuinely cannot do something, that is
`GRAPHCOMPOSE_API_LIMITATION`: name the API, the version, and what was
tried. If a skill file disagrees with library behaviour, the skill is
wrong — fix the skill.

## Relational geometry over pixel constants

Widths and weights are **derived** from a small set of base constants
(page size, margins, column gaps, weights). A number that *can* be
derived *must* be derived.

```java
// The sidebar is 31% of the content row, and the gap is derived from it.
private static final float SIDEBAR_WEIGHT = 0.31f;
private static final float MAIN_WEIGHT    = 1f - SIDEBAR_WEIGHT;
```

Hardcode a pixel value only for a genuinely independent dimension: icon
size, line-marker height, a fixed padding that nothing else references.
Record the base constants in `architecture-plan.json` under
`baseConstants`, with the derivation, so the next revision can change
one number instead of hunting fifteen.

## Anchors, not hand-computed offsets

Element-to-element positioning uses engine primitives — `LayerAlign`,
`TextAlign`, `InlineImageAlignment`, `DocumentTableTextAnchor`,
`RowBuilder.weights(...)`, `LayerStackBuilder.position(..., align)`,
`HAnchor` / `VAnchor`.

A computed offset encodes today's font metrics into the template. When
the font changes, the offset is silently wrong; an anchor is not.

The division of labour: the analysis writes the *relationship* ("the
badge sits at the top-right of the avatar"), the architecture picks the
*named anchor*, the code reaches for the *primitive*.

## Data-spec contract

Variable content — names, contacts, dates, jobs, awards — lives in
`<doc-kind>-data.json` and is loaded through a typed Java spec record
via a `--spec-provider`. The template body carries **no content
literals**.

The test: if changing someone's email requires editing Java, the
contract is broken, and what should have been a `data-only` revision
with a region-aware gate becomes a code change.

## An href in the data is a link in the render

A field carrying a target — `href`, `url`, `link` — is not decoration.
It must reach the PDF as a real annotation, through the link API of
whatever primitive draws it: `addLink(text, uri)` on a flow builder,
`inlineLink(...)` for one run inside a paragraph, `.linkTo(...)` /
`.link(...)` on an image, shape or barcode. A paragraph-level link makes
the whole paragraph clickable; an inline link makes one run clickable.
Pick by what should be clickable, not by which is shorter to write.

Drawing the value as text and ignoring the href is the failure this rule
exists for, and it is invisible everywhere it matters: the glyphs are
identical, the colour is identical, and the pixel diff against the
reference is exactly zero, because an annotation has no pixels. It is
found by a person clicking it — which in the serif acceptance run
happened after ten revisions had already shipped it.

`render-and-diff` reads the rendered PDF back and compares its link
targets to the hrefs in the data on every pass, so this is checked, not
trusted.

## Asset flow

Icons come from Iconify through `tools/asset-resolver`; fonts are either
GraphCompose-bundled Google Fonts referenced by `FontName.<NAME>` or
dropped into the revision as TTF. `assets-manifest.json` is the source
of truth for what was actually resolved — not the request, not the
prose.

**Read `format` from the manifest; do not assume an extension.** Icons
resolve to SVG wherever this GraphCompose line can draw them, and to PNG
only where it cannot — the manifest says which, and why:

```java
// format: "svg"  — the normal case
SvgIcon icon = SvgIcon.read(revisionDir.resolve("assets/icons/mail.svg"));
section.addSvgIcon(icon, 12);

// format: "png"  — fallbackReason says what the reader refused
section.addImage(img -> img.file(revisionDir.resolve("assets/icons/mail.png")).width(12));
```

A template that hardcodes `.png` breaks the moment an icon resolves as
vector, and one that hardcodes `.svg` breaks on the first icon outside
the subset. Branch on `format`, defaulting to `png` when the field is
absent — manifests written before SVG-first resolution have no `format`
and are PNG.

For an SVG, `size` is null: there is no pixel size. Lay it out with
`pointSize` and the width you want on the page, and it stays sharp at
any scale — which is the reason to keep the vector at all.

## Every visible region maps to one named render method

`renderHeader`, `renderSidebar`, `renderFooter`. Not `part1`, not one
250-line `compose`.

This is what makes the rest of the contract work: `componentMapping` in
the architecture plan points at these names, `visual-review.json`
reports mismatches against them, `changedComponents` lists the ones a
revision touched, and selective rollback restores exactly one of them.
A region with no method of its own cannot be reviewed or rolled back
independently.

## Never overwrite an approved revision

Every change opens a new revision. Statuses are `DRAFT`, `APPROVED`,
`REJECTED`, `REVERTED`, `SUPERSEDED`, `FAILED`, and they are owned by
`tools/revision-manager` — flipping one by editing `revision.json` by
hand skips the bookkeeping that keeps the history navigable.
