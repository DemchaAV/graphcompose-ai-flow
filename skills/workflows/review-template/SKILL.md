---
name: graphcompose-review
description: Compare a rendered GraphCompose template against its reference or its parent revision and report what is still different, without opening a new revision. Use when the user asks "what's still different?", "review the current version", "compare it with the screenshot", "show me the diff", "how close are we?" — or when a create/revise pass has just rendered and needs a verdict before deciding whether to iterate again.
---

# Review a GraphCompose render

Measure first, then interpret. This skill produces a verdict and a
ranked list of mismatches — it does **not** open a revision, edit the
template, or approve anything.

## When this applies

- The user asks what is still different, or how close the render is.
- A create or revise pass has just rendered and the loop needs a verdict
  to decide whether to iterate.

If the user wants the difference *fixed*, this skill produces the
verdict and `graphcompose-revise` acts on it.

## Inputs

From the revision folder: `output.png` (and `output-page-N.png`), the
project's `reference/reference.png`, the parent revision's output when
one exists, `layout-snapshot.json`, and the scope recorded in
`revision.json`.

The scope decides what "different" is even measured against — see
[scope routing](../references/scope-routing.md). Reviewing a
`refactor-only` revision against the reference image instead of its
parent answers the wrong question entirely.

Reviewing needs one skill file, not a pack: `visual-regression.md`, per
the pack's `00-loading-map.md`. Reach for a topic file only when a
mismatch turns out to be about that topic.

## Steps

**1. Measure.** Run the deterministic comparison before looking at
anything:

```bash
node tools/visual-diff/bin/visual-diff.mjs <reference-or-parent.png> <revision>/output.png \
  --json --update-revision <revision>
```

`--update-revision` writes `diff.png` and `stats.json` into the revision
folder, so the evidence sits beside the review rather than in a
terminal. For a region-aware gate, mask first with
`node tools/visual-diff/bin/mask-regions.mjs --input … --regions-file …
--mode keep-only`, then diff the masked pair.

Under `exact-diff` and `region-diff` gates the numbers *are* the
verdict. Quote the metric verbatim — `AE == 0`, not "looks identical".

**2. Look.** Read the reference and the output as images, region by
region, in the priority order from
[the iteration loop](../references/iteration-loop.md): geometry, then
surfaces, then anchors and spacing, then typography, then small marks,
then colour. Compare like with like — same page, same region.

**3. Classify.** Every difference gets one of the closed set:
`CRITICAL`, `MAJOR`, `MINOR`, `ACCEPTED_LIMITATION`,
`INTENTIONAL_DIFFERENCE`. Do not invent classifications.
`ACCEPTED_LIMITATION` is never assigned automatically — it requires a
human note saying it was accepted.

**4. Write `visual-review.json`** against
[the schema](../../../schemas/visual-review.schema.json), then
`visual-review.md` as the readable rendering.

The three fields that carry weight:

- `verdict` — `READY_FOR_APPROVAL` | `REVISE` | `BLOCKED`. Drives the
  loop. Distinct from `recommendation` (`APPROVE` / `REVISE` /
  `REJECT`), which advises the human. Never write `APPROVED`.
- `mismatches[].id` — stable kebab-case, e.g. `header-height`. **Reuse
  the id verbatim** when a problem survives a fix; that repetition is
  how the loop notices it is not converging.
- `largestMismatch` — the one id the next pass should fix, with a
  concrete `action` ("reduce vertical padding"), not a diagnosis
  ("header is wrong").

A `BLOCKED` verdict needs a `failureCategory`. Under a diff gate, put
the measured numbers in `gate.pages[]` / `gate.regions[]` and the
command output in `gate.metric`.

**5. Report** the verdict, the largest mismatch, and the next concrete
fix — in that order. The user should not have to open a JSON file to
learn whether it is close.

## Judgement calls

- **A clean gate is not automatically READY.** `AE == 0` against a
  parent proves nothing changed; for a `visual-change` scope the
  question is whether it matches the *reference*.
- **Score is a signal, not a gate.** A 96 with a `CRITICAL` structural
  mismatch is a `REVISE`.
- **Do not soften.** If the header is visibly taller, it is `MAJOR`
  even when the parity number is flattering — pixel counts undersell
  structural error and oversell anti-aliasing noise.

## Related

- [`../references/iteration-loop.md`](../references/iteration-loop.md) — priority order, bounds, failure categories
- [`../references/scope-routing.md`](../references/scope-routing.md) — which gate applies
- [`../revise-template/SKILL.md`](../revise-template/SKILL.md) — to act on the verdict
