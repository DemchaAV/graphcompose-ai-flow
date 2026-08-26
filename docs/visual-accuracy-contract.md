# Visual Accuracy Contract

This project is stricter than a normal "AI template generator". The
goal is not to create a document that is merely similar. The goal is
to reproduce the provided reference as accurately as possible.

## Contract

```text
The generated result must visually match the reference.

Any visible mismatch must be treated as a defect unless it is explicitly documented as a known limitation.
```

## Required visual parity checks

A revision is not considered successful until these points are
checked:

- page size matches the reference — **measured, not eyeballed** (see
  [The page size is measured](#the-page-size-is-measured) below)
- orientation matches the reference
- main layout regions match
- visual hierarchy matches
- content order matches
- spacing is visually aligned
- typography is close or intentionally substituted, with font source
  and fallback documented when a custom font is used
- colors are matched or documented
- icons match the reference or use a documented Iconify replacement
- tables preserve proportions and structure
- headers are present
- footers are present
- cards, badges, backgrounds, and decorative elements are present when relevant
- shaped components preserve semantic ownership: content that visually
  belongs inside a circle, rounded card, pill, clipped image area, or
  badge is implemented as a child of that shape, not as a sibling
  overlay pulled into place with negative margins
- no important visual element is missing
- no unexpected element is added
- output preview is compared against reference
- differences are documented in `visual-review.md`

## The page size is measured

Every other check on that list is read off two images. This one cannot
be, and for a long time it was — with the result that it never failed.

`visual-diff --scale-reference` resamples the reference to the render's
exact width **and** height. That is right when the two differ only in
dpi, which is the case it was written for. When they differ in
*proportion* it is a distortion: a reference 5% shorter than the render
is stretched to fit immediately before the pixels are compared. The diff
then reports a small mismatch on a page whose every vertical position is
wrong, and a reviewer checking "page size matches the reference" by
looking at the two images is looking at the stretched one.

Three projects passed their gates that way: `mocha-profile-cv` built at
A4 from a reference 9.5% shorter (its nearest standard was LETTER, which
nobody ranked), `cv-reference` 4.9% out, `navy-executive-cv` 4.2%.

So the page size is settled before the design starts, by measurement:

- `scripts/import-reference.mjs` measures the reference at import and
  writes `referenceGeometry` into `template-project.json`. It exits `0`
  when a standard page matches within 1%, and `5` when nothing does —
  and on `5` the user is asked, with the nearest standard, the cost of
  using it, and the exact `DocumentPageSize.of(w, h)` alternative.
- `scripts/page-size.mjs` answers "is it settled?" for a project at any
  later moment — exit `0` settled, `5` unanswered — and `--use` with a
  `--decision` records the user's answer once, so a revision inherits it
  instead of asking again. `revise-template` runs it as step zero: a
  revision never re-imports, so without it the page size was checked when
  a project was created and never again.
- `visual-analysis.json` carries that measurement forward in `page`
  (`referencePx`, `aspect`, `sizePt`, `sizeSource`), so a later reader
  can tell a measurement from an assumption.
- `visual-diff` reports `aspectMismatch` in its stats and warns on
  stderr whenever it scaled a reference into a shape it did not have.
  **A mismatch reported alongside `aspectMismatch` understates the real
  difference** and must not be classified until the page size is fixed.

The rule that follows: a page-size mismatch is never `MINOR`. It is a
`CRITICAL` defect regardless of the pixel percentage, because relational
geometry derives from the page — get the page wrong and every ratio
built on it is faithfully wrong, at a percentage the diff cannot see.

## Visual mismatch classification

Every visual mismatch must be classified using one of these labels:

```text
CRITICAL
MAJOR
MINOR
ACCEPTED_LIMITATION
INTENTIONAL_DIFFERENCE
```

| Classification | Meaning |
|---|---|
| `CRITICAL` | Output does not preserve the reference structure or core meaning |
| `MAJOR` | Significant visual difference visible immediately |
| `MINOR` | Small spacing, color, typography, or alignment issue |
| `ACCEPTED_LIMITATION` | Difference caused by known API/tooling limitation |
| `INTENTIONAL_DIFFERENCE` | Difference explicitly requested or approved by user |

## Cause classification

Severity answers *how bad*. Cause answers *what kind of thing is wrong*, and
they are independent — a `MINOR` mismatch and a `CRITICAL` one can both be
`GEOMETRY`, and the same picture can be a layout defect or a wrong file at the
same severity. Both are separate again from `rootCause`, which is a grouping id
linking symptoms of one origin. All three can be set on one mismatch and none
substitutes for another.

Cause exists because the fix has nothing in common across the values:

```text
GEOMETRY  TYPOGRAPHY  PAINT  ASSET  CONTENT  PAGINATION  UNKNOWN
```

| Cause | Meaning | The fix |
|---|---|---|
| `GEOMETRY` | Something is in the wrong place or the wrong size | A layout property on the **owner** the evidence names — not on the node showing the symptom |
| `TYPOGRAPHY` | Right place, wrong type: face, size, weight, leading, tracking | A text style. Never a margin |
| `PAINT` | Right place, right type, wrong colour or fill | A colour in the theme |
| `ASSET` | Right place, wrong file | Replace the file. **Never compensate an asset with margins** — that moves the wrong picture into position |
| `CONTENT` | The text itself differs | The data spec, not the template |
| `PAGINATION` | The document broke across pages differently | Nothing else until this is resolved: every per-node comparison is against a different layout |
| `UNKNOWN` | The available evidence cannot separate the candidates | Say so, and name the candidates |

The enum is declared in [`config/pipeline.json`](../config/pipeline.json) and
copied into `schemas/visual-review.schema.json`;
`scripts/test/pipeline-config.test.mjs` asserts the copies agree.

### JSON answers where, PNG answers what it looks like

The split that makes this decidable at all. A layout snapshot is the engine's
own measurement of where every node ended up, so *position and size are read,
not estimated*. Nothing in a snapshot says what colour anything is, so
appearance stays with the pixel diff.

`node scripts/evidence.mjs --project <id> --revision <id> --region <id>` joins
the two, plus the region bounds read off the reference, and returns a bounded
package: the owning node, its displacement from where the reference puts the
region, its hierarchy, its children, and the properties that actually produced
its position. About 4 KB, against a 227 KB snapshot — the boundedness is the
point, and [the iteration loop](../skills/workflows/references/iteration-loop.md)
forbids loading the snapshot instead.

### It assigns only what two measurements can settle

Five of the seven values are assigned automatically:

- **`PAGINATION`** — the page counts differ. Checked first, because it
  invalidates everything after it.
- **`GEOMETRY`** — the owning node sits further than tolerance from where the
  reference region puts it. Tolerance is 0.5% of the page's short edge, about
  3pt on A4: region bounds are read off an image by eye and carry real error, so
  a tighter threshold would report the analyst's own rounding as a defect.
- **`ASSET`** — the box is within tolerance, the region's role carries a file
  (`image`, `icon`, `logo`), and a quarter or more of its interior pixels
  differ.
- **`TYPOGRAPHY`** — the snapshot reports that the text was set in a font the
  style did not name. Not inferred from pixels: GraphCompose gives the declared
  and the resolved font side by side, and a mismatch is a fact. Checked *before*
  geometry, because a substituted font changes every glyph width — the box is
  the wrong size because the type is. Needs a render against GraphCompose 2.2.2
  or newer; older renders carry no typography and report `reported: false`
  rather than a clean bill of health.
- **`UNKNOWN`** — everything else.

`PAINT` and `CONTENT` are **never** assigned automatically, and neither is
`TYPOGRAPHY` on anything subtler than a substitution. Telling a wrong size from
a wrong colour from different words needs a comparison against the reference's
own type — that is `scripts/typography.mjs`, and it needs a crop a human chose.
They come back as *candidates* on an `UNKNOWN` verdict instead. A classifier that picked
between them would be the pixel-staring this replaces, in a JSON wrapper — and a
confident wrong cause is worse than an honest unresolved one, because it sends
the next pass to edit the wrong kind of thing.

A reviewer may of course set a cause the tool declined to. That is a human
judgement recorded as one, which is what `ACCEPTED_LIMITATION` already does for
severity.


## Approval rule

A revision can be approved only when:

- no critical mismatches remain
- no major mismatches remain unless explicitly accepted
- no semantic ownership defects remain for shaped components unless
  they are backed by a verified engine limitation
- minor mismatches are documented
- all generated artifacts exist
- code compiles
- PDF renders
- preview image exists
- visual review is written
- revision metadata is complete

Approval is performed by the Revision Manager Agent. See
[`skills/workflows/`](../skills/workflows/README.md) for the safety rules
around approval, and [revision-model.md](revision-model.md) for the
exact metadata that must be present.

## What this contract is not

This contract does not claim that the workflow performs perfect
screenshot-to-code conversion. Human review is part of the process.

The wording used by the project is intentionally cautious:

```text
This project provides a structured AI-assisted workflow.
It helps agents analyze, plan, generate, render, compare, and revise GraphCompose templates.
Human review remains part of the process.
```

```text
The goal is strict visual parity with the reference, achieved through an iterative render/compare/revise workflow.
Remaining differences must be documented.
```

The contract is a discipline imposed on the workflow, not a promise
that a single pass produces a pixel-perfect result. Differences are
permitted, but only when they are classified and documented. See
[limitations.md](limitations.md) for the honest scope of the
workflow today.
