---
skillId: visual-regression
targetLibrary: GraphCompose
targetVersion: 2.2.x
verifiedAgainst: 2.2.0
status: needs-validation
lastValidated: 2026-08-24
---

# Visual Regression Skill

Use this skill whenever a revision's rendered output must be compared
against the visual reference, or against the previous revision's
output, or both. Visual regression is the discipline that turns
"the template compiled and rendered" into "the rendered result
matches the reference".

## When to load

Load this skill on every revision that produces an `output.pdf`. The
Test + Render Agent and the Visual Review Agent both depend on it.
Specifically:

- on the first revision of a new project, to compare `output.png`
  against `reference.png`
- on every subsequent revision, to compare `output.png` against the
  reference and against `previous-output.png`
- when investigating a regression in a previously approved revision
- when documenting an accepted limitation that requires a screenshot

If the revision did not render (compile failure, render failure), do
not load this skill yet — handle the failure under
[`troubleshooting`](troubleshooting.md) first.

## Workflow

This skill mirrors the visual review loop documented in
[`../../../docs/visual-review-loop.md`](../../../docs/visual-review-loop.md).
Read that document for the full pipeline; the steps below are the
skill-level summary.

1. **Render the PDF.** The Test + Render Agent produces `output.pdf`
   in the revision folder.
2. **Generate the preview image.** Convert `output.pdf` to
   `output.png`. The preview is what the Visual Review Agent diffs
   against the reference; without it, the loop cannot run.
3. **Locate the comparison inputs.** Required inputs are
   `reference.png`, `output.png`, `visual-analysis.md`, and
   `architecture-plan.md`. The optional input
   `previous-output.png` is included when comparing two consecutive
   revisions.
4. **Compare reference vs output.** Walk through the required visual
   parity checks in
   [`../../../docs/visual-accuracy-contract.md`](../../../docs/visual-accuracy-contract.md).
5. **Classify every difference** using the labels in the contract.
6. **Compare output vs previous output** when a previous revision
   exists. Confirm the intended change was applied and no unintended
   change was introduced.
7. **Write `visual-review.md`** following the format in
   [`../../../docs/visual-review-loop.md`](../../../docs/visual-review-loop.md).
   Include the parity score, the classified mismatches, the
   component-by-component review, and one of the three approval
   recommendations (`APPROVE`, `REVISE`, `REJECT`).
8. **Persist accepted limitations** as their own entries in the
   review so future revisions inherit the context.

## Reference vs output comparison

The base comparison is `reference.png` vs `output.png`. The Visual
Review Agent reviews them side-by-side, following the parity checks:

- page size and orientation
- main layout regions and visual hierarchy
- content order and spacing
- typography and colours
- table proportions and structure
- presence of headers, footers, cards, badges, backgrounds, and
  decorations
- absence of unexpected elements
- pagination across all pages, page by page (see
  [`pagination`](pagination.md))

Every observation goes into `visual-review.md` as a classified
mismatch, even when the observation is "no mismatch".

## Output vs previous output comparison

When a previous revision exists, the Visual Review Agent also
compares `output.png` against `previous-output.png`. The goal is to
catch unintended regressions:

- if the user asked for a darker table and only the table darkened,
  the comparison is clean
- if the user asked for a darker table and the header also shifted,
  the header shift is an unintended regression and must be classified
- if the user asked to move the footer and the table rebroke across
  pages, the rebroke pagination is an unintended regression

Unintended regressions are mismatches against the previous revision,
not the reference. They are classified using the same labels and they
block approval the same way.

## Difference classification

The canonical classification lives in
[`../../../docs/visual-accuracy-contract.md`](../../../docs/visual-accuracy-contract.md).
Quoted here once for convenience — the contract is the source of
truth:

| Classification | Meaning |
|---|---|
| `CRITICAL` | Output does not preserve the reference structure or core meaning |
| `MAJOR` | Significant visual difference visible immediately |
| `MINOR` | Small spacing, color, typography, or alignment issue |
| `ACCEPTED_LIMITATION` | Difference caused by known API/tooling limitation |
| `INTENTIONAL_DIFFERENCE` | Difference explicitly requested or approved by user |

Approval rule, also from the contract: a revision is approvable only
when no critical mismatches remain, no unaccepted major mismatches
remain, and minor mismatches and limitations are documented. The
visual review's approval recommendation is advisory — only the
Revision Manager Agent flips the revision status.

## Screenshot-level comparison process

For tight comparison the Visual Review Agent works at screenshot
level: matching crops of the reference and the output. The
recommended discipline:

- compare overall structure first (page-level)
- then compare per region (header, hero, table, footer)
- then compare per component (a single card, a single badge)
- record every difference, no matter how small, before classifying

Per-region screenshots may be attached to `visual-review.md` to
support classification. They are not required, but they make later
revisions easier to triage.

## Accepted-limitation documentation

When a mismatch is unavoidable for the current GraphCompose version,
the renderer, or the available fonts, document it as
`ACCEPTED_LIMITATION` in `visual-review.md`. Required fields:

- the location on the page (which region, which component)
- a short description of the difference
- the reason it is accepted (renderer, font fallback, API gap)
- the classification (`ACCEPTED_LIMITATION`)
- a link to the related skill or fixture, when applicable

Accepted limitations carry forward to subsequent revisions. The
Visual Review Agent re-checks them on every revision; if a later
GraphCompose version closes the gap, the limitation is removed and
the difference is reclassified.

## Required visual checks before approval

Before recommending `APPROVE` the Visual Review Agent must confirm:

- every required parity check in
  [`../../../docs/visual-accuracy-contract.md`](../../../docs/visual-accuracy-contract.md)
  has been visited
- no `CRITICAL` mismatch is open
- no `MAJOR` mismatch is open unless explicitly accepted by the user
- all `MINOR` mismatches are listed
- all `ACCEPTED_LIMITATION` entries are listed with their reason
- pagination has been verified page by page (see
  [`pagination`](pagination.md))
- `output.pdf`, `output.png`, `layout-snapshot.json`, and
  `visual-review.md` all exist

If any of those is missing, the recommendation is `REVISE` or
`REJECT`, not `APPROVE`.

## Common mistakes

1. **Comparing only the first page.** Multi-page documents must be
   reviewed page by page; see [`pagination`](pagination.md).
2. **Silently rounding a `MAJOR` mismatch down to `MINOR`** because
   the layout is "mostly right". Classification is strict.
3. **Skipping the output-vs-previous comparison.** Unintended
   regressions are common after revisions; they must be checked.
4. **Treating a missing artifact as cosmetic.** A missing `output.png`
   blocks approval; it is not a documentation issue.

## Known limitations

- Pixel-perfect parity is not guaranteed. Anti-aliasing, font
  hinting, and PDF-to-PNG conversion all introduce sub-millimetre
  noise that is `MINOR` at most.
- This workflow does not currently mandate an automated diff
  threshold. Comparison is human-led; the per-region screenshots are
  the most reliable check.

## Cross-references

- [`../../../docs/visual-accuracy-contract.md`](../../../docs/visual-accuracy-contract.md)
  — canonical classification and approval rule
- [`../../../docs/visual-review-loop.md`](../../../docs/visual-review-loop.md)
  — full review pipeline and `visual-review.md` template
- [`pagination`](pagination.md) — page-by-page review requirements
- [`revision-discipline`](revision-discipline.md) — how visual review
  decisions feed into revision status
- [`troubleshooting`](troubleshooting.md) — what to do when the
  output cannot be produced at all
