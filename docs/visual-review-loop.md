# Visual Review Loop

The visual review loop is what closes the gap between "the template
compiles and renders" and "the rendered output matches the
reference". The Visual Review Agent owns it. This page describes
purpose, inputs and outputs, review criteria, the suggested review
document format, and how mismatch classification feeds approval.

## Purpose

The Visual Review Agent compares the reference image with the
rendered output, classifies any visible differences, and recommends a
next action: approve, revise, or reject. The agent does not write or
edit the template. It does not approve revisions. Its only job is to
turn a pair of images (and the supporting analysis and plan) into a
written, classified review.

## Inputs

```text
reference.png
output.png
previous-output.png
layout-snapshot.json
visual-analysis.md
architecture-plan.md
```

`previous-output.png` is optional; it is included when comparing two
consecutive revisions, for example to confirm that "make the table
darker" actually darkened the table without breaking the layout.

## Output

```text
visual-review.md
```

This file is the deliverable. It lives in the revision folder and is
required for approval — see [visual-accuracy-contract.md](visual-accuracy-contract.md#approval-rule).

## Review criteria

- overall structure
- alignment
- spacing
- colors
- typography
- missing elements
- extra elements
- table proportions
- header/footer placement
- pagination
- visual balance
- reference parity score

The reference parity score is a single 0–100 number summarizing how
close the output is to the reference. It is a signal, not a gate;
the classified mismatch lists below it are what drive the approval
decision.

## Suggested visual review format

```markdown
# Visual Review

## Summary

## Reference Parity Score

`0-100`

## Critical Mismatches

## Major Mismatches

## Minor Mismatches

## Accepted Limitations

## Component-by-Component Review

### Header
### Hero
### Table
### Footer

## Recommended Next Revision

## Approval Recommendation

APPROVE / REVISE / REJECT
```

## Mismatch classification

Every mismatch must be classified into one of the five labels
(`CRITICAL`, `MAJOR`, `MINOR`, `ACCEPTED_LIMITATION`,
`INTENTIONAL_DIFFERENCE`). The canonical definitions and approval
rule live in [visual-accuracy-contract.md](visual-accuracy-contract.md#visual-mismatch-classification).
This page does not redefine them; it is the operational surface where
those labels are applied.

## Approval recommendation

The bottom of `visual-review.md` ends with one of three
recommendations:

- `APPROVE` — no critical mismatches; no unaccepted major mismatches;
  minor mismatches and limitations are documented; all artifacts
  exist. The Revision Manager Agent can flip the revision to
  `APPROVED` if the user agrees.
- `REVISE` — at least one major mismatch remains and is not accepted,
  or minor mismatches are dense enough that another iteration is
  cheaper than living with them. The orchestrator routes back to the
  Template Coder.
- `REJECT` — at least one critical mismatch, or the output departs
  from the reference structure or core meaning. The draft is marked
  `REJECTED` and the user is asked how to proceed.

The recommendation is advisory. Only the Revision Manager Agent, on
user instruction, changes a revision's status — see
[agents.md#revision-manager-agent](agents.md#revision-manager-agent).
