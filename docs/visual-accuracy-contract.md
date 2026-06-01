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

- page size matches the reference
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
[agents.md](agents.md#revision-manager-agent) for the safety rules
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
