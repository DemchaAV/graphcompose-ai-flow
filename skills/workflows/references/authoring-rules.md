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

## Semantic primitive before manual composition

Before composing a visual pattern by hand, check whether GraphCompose has
a primitive that *represents the relationship*. A semantic primitive is
preferred **even when equivalent output can be assembled from lower-level
nodes**.

| The pattern | The primitive |
|---|---|
| Dated entries on a rail — experience, education, milestones | `addTimeline(Consumer<TimelineBuilder>)` |
| Rows and columns of data | `addTable(...)` |
| Something repeating on every page | `DocumentSession.header(DocumentHeaderFooter)` / `footer(...)` |
| Content that belongs *to* a shape — initials in a disc, a label in a pill | a `ShapeContainer` anchor: `addCircle(size, colour, c -> c.center(...))` |
| Things that overlap or sit on top of each other | `addLayerStack(...)` |
| A colour band spanning the page behind the content | `pageBackgrounds(List<PageBackgroundFill>)` |
| A named vertical group | `addSection(...)` |
| A named horizontal group | `addRow(...)` with `weights(...)` |

`LineBuilder`, `ShapeBuilder`, canvas drawing, repeated margins and
negative offsets are **fallback mechanisms, not the default authoring
model**. They are correct when nothing semantic covers the relationship —
a decorative rule, a bespoke glyph — and wrong when reached for because
the primitive was not looked up.

Two reasons this is a rule and not a preference. A hand-assembled
timeline is a dozen independent constants that a later revision has to
find and move together, while `TimelineBuilder.spacing(...)` is one. And
the primitive knows things the assembly does not — `keepTogether()`
survives a page break; three siblings with matching margins do not.

Look it up rather than remembering:

```bash
node scripts/api-query.mjs --version 2.2 --query timeline
```

Absent from the allow-list means it does not exist, and *then* the manual
construction is right. `scripts/check-knowledge-drift.mjs` fails the
build when a document still teaches a construction the pinned pack has
replaced.

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

## Layout ownership

**A property shared by several children belongs to their nearest common
semantic parent.**

Three words that are routinely used as if they were interchangeable, and
are not:

| | Positions |
|---|---|
| `margin(...)` | the component itself, relative to its surroundings |
| `padding(...)` | the children *inside* their owner |
| `spacing(...)` | each child relative to the previous one |

All three are on `AbstractFlowBuilder`, so a section, a row and a page
flow each have them. Which one you reach for says who owns the geometry.

```java
// Wrong. The inset is a fact about the group, stated three times.
languages.addParagraph(p -> p.text("English").margin(0, 0, 0, 18));
languages.addParagraph(p -> p.text("Ukrainian").margin(0, 0, 0, 18));
languages.addParagraph(p -> p.text("German").margin(0, 0, 0, 18));

// Right. One property, on the thing the inset is true of — and the group
// is named, so a region diff can address it.
languages.addSection("LanguagesContent", content -> content
        .padding(0, 0, 0, 18)
        .spacing(5)
        .addParagraph(p -> p.text("English"))
        .addParagraph(p -> p.text("Ukrainian"))
        .addParagraph(p -> p.text("German")));
```

The test is a revision request. "Move the language list 6pt left" should
be **one** property change. If it is three, the geometry is in the wrong
place — and the next request will be four, because a fourth language got
added and nobody moved its margin with the others.

**A child margin is for a local exception**: this one item, unlike its
siblings, sits differently. The moment the same value appears on more
than one sibling it has stopped being an exception and become a fact
about the parent. `scripts/check-structural-smells.mjs` reports the
repetition; the rule is here so it does not have to.

## Change the smallest owning property

A visual mismatch is fixed at its owner, not wherever a number can be
adjusted to compensate.

If the whole Languages group sits 6pt too far right, change
`Languages.padding`. Not the three child margins — that is the same fix
written three times, and it drifts apart on the next edit. And not the
sidebar width — that moves everything else to fix one thing, and the
diff will show it.

Widening the search until something moves is how a template accumulates
constants that no longer mean anything: each was true for one pass, and
together they describe no layout at all.

**Apply a small change in a small way.** One run wrote five throwaway
Python patchers — nearly 30 KB of them — to change a handful of lines in
its own generated Java. Every one had to be composed before it could run,
and the composing is the cost: the script is model output, and a 9 KB
patcher to move one padding value costs more than the edit it performs.

Edit the file directly, by whatever means the host gives you. Reach for a
script only when the rewrite is genuinely repetitive across many sites — a
rename through forty call sites is a script; three padding values are three
edits. If a patcher does earn its place, keep it to the transformation and
leave the Java in the Java file: a patcher carrying large literal blocks
has become a second copy of the template, and the two will disagree.

## Data-spec contract

Variable content — names, contacts, dates, jobs, awards — lives in
`<doc-kind>-data.json` and is loaded through a typed Java spec record
via a `--spec-provider`. The template body carries **no content
literals**.

The test: if changing someone's email requires editing Java, the
contract is broken, and what should have been a `data-only` revision
with a region-aware gate becomes a code change.

## Published code must not know this harness exists

A template outlives the run that produced it. Once published it is
ordinary Java in someone else's project, and a class that resolves its
data through a property called `graphcompose.revision.dir` has told that
project about revisions, workspaces and an approval loop it will never
have. That name is this harness leaking through the one artifact that
leaves it.

So every provider offers **two** ways in, and the property-free one is
the real API:

```java
/** Production entry point: the caller says where the data is. */
public static CvSpec load(Path dataFile) { … }

/** Harness entry point: the render runtime sets the directory. */
public static CvSpec create() {
    return load(templateDir().resolve("cv-data.json"));
}
```

A template that loads assets takes its resource root the same way — a
`new NorthlineCvTemplate(Path resourcesRoot)` constructor beside the
no-arg one, so a service rendering a thousand documents shares one set
of assets instead of a directory per document.

`create()` resolves the directory in this order, and never the reverse:

```java
private static Path templateDir() {
    String dir = System.getProperty("graphcompose.template.dir");
    if (dir == null || dir.isBlank()) {
        dir = System.getProperty("graphcompose.revision.dir");
    }
    return Path.of(dir == null || dir.isBlank() ? "." : dir);
}
```

`graphcompose.template.dir` is the name to write. The second lookup is
there because bundles published before this rule read only the old name,
and the harness sets both while that is true; the fallback is for reading,
never for writing. Do not emit `graphcompose.revision.dir` in new code.

`scripts/lib/bundle-portability.mjs` reports the old name on every
publish, so a template that copies an older one is caught rather than
shipped.

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
