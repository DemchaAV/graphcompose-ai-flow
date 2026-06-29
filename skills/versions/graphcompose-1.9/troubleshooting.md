---
skillId: troubleshooting
targetLibrary: GraphCompose
targetVersion: 1.9.x
verifiedAgainst: 1.9.0
status: needs-validation
lastValidated: 2026-06-07
---

# Troubleshooting Skill

Use this skill whenever something goes wrong in the workflow: the
library disagrees with the skill pack, a documented primitive turns
out to be missing, the render step does not produce `output.pdf`, the
visual mismatch is larger than the analysis predicted, or the
GraphCompose version cannot be detected. The goal of this skill is to
contain the failure inside the current revision, preserve evidence,
and avoid the temptation to "make it work" by inventing API.

## When to load

Load this skill on any failure or surprise during the workflow:

- the build fails
- the render step does not produce `output.pdf`
- a primitive documented in the skill pack is not present in the
  selected GraphCompose version
- the visual review records a `CRITICAL` or `MAJOR` mismatch the
  architecture plan did not predict
- the version of GraphCompose cannot be determined from the project
  metadata
- a skill example references behavior the library does not provide

## Failure modes

### Skill drift

The library disagrees with the skill documentation. Quoted verbatim
from §7.4 of the project plan:

```text
If GraphCompose behavior differs from the skill documentation, the library is treated as the source of truth.

The skill must be updated.

The agent must not silently work around incorrect skills.
```

Required response:

1. Do not patch the template to dodge the broken skill.
2. Mark the affected skill in the manifest with status
   `failed-validation`.
3. File a skill fix report following the template in
   [`../../../docs/skill-validation.md`](../../../docs/skill-validation.md).
   Required fields: affected skill file, GraphCompose version,
   problem description, expected behavior according to skill, actual
   library behavior, failing example, required skill update, status
   (`FAILED` / `NEEDS UPDATE` / `FIXED`).
4. Leave the revision in a state that reflects reality: `FAILED` if
   the drift blocks rendering, `DRAFT` with documented limitations
   if the drift can be worked around in a conservative way.

### Missing primitive

The skill pack mentions a primitive the selected GraphCompose version
does not expose, or the primitive exists but its behavior is
materially different from the skill description. This is a special
case of skill drift but is common enough to call out separately.

Required response:

1. Do not invent a substitute primitive or imagine a builder method.
   The no-invented-API rule in
   [`../../../docs/versioned-skills.md`](../../../docs/versioned-skills.md)
   applies to skills themselves: if the primitive is not there,
   treat it as unavailable.
2. Fall back to a conservative composition using primitives that
   are present and verified for the version
   (`DocumentSession`, `pageFlow`, the row primitive, the section
   primitive, the table primitive, the theme, the layer-stack and
   shape-container primitives where they exist).
3. Document the gap in `architecture-plan.md` as a visual risk and
   in `visual-review.md` as an `ACCEPTED_LIMITATION` per
   [`../../../docs/visual-accuracy-contract.md`](../../../docs/visual-accuracy-contract.md).
4. File a skill fix report in
   `validation/skill-fix-report.md` describing the missing primitive
   and the conservative fallback that was used. The template lives
   in [`../../../docs/skill-validation.md`](../../../docs/skill-validation.md).

### Render failure

The Test + Render Agent could not produce `output.pdf`. This may be
caused by:

- compile failure in `generated-template.java`
- an exception thrown during rendering
- a missing dependency the fixture or project did not declare
- a renderer crash on a specific shape, font, or layer combination

Required response:

1. Preserve every artifact that was produced before the failure:
   `build.log`, `render.log`, the partial
   `generated-template.java`, any intermediate snapshot.
2. Mark the revision `FAILED` in its `revision.json` per
   [`../../../docs/revision-model.md`](../../../docs/revision-model.md).
3. Do not delete the revision folder. The audit trail depends on
   the failed artifacts staying on disk.
4. Create the next revision from the previous good draft or the
   approved revision, not by editing the failed folder in place. See
   [`revision-discipline`](revision-discipline.md).
5. If the cause was a missing primitive or a skill bug, also follow
   the skill drift or missing primitive flow above.

### Visual mismatch larger than expected

The visual review records a `CRITICAL` or `MAJOR` mismatch that the
architecture plan did not anticipate. This is not a render failure;
the document built, but it does not match the reference. The
temptation is to patch the template until the diff shrinks. That is
the wrong response under this workflow.

Required response:

1. Do not silently patch the template. The mismatch indicates either
   a flaw in the visual analysis or a flaw in the architecture
   mapping; patching downstream code hides the upstream defect.
2. Rerun the Visual Analyzer Agent on the reference, focusing on
   the region that mismatched.
3. Rerun the Architecture Mapper Agent on the updated analysis,
   producing a new `architecture-plan.md`.
4. Only after the analysis and the plan have been updated does the
   Template Coder Agent regenerate or patch the template.
5. Create a new revision for every iteration. The original revision
   keeps its `visual-review.md` showing the mismatch; the new
   revision shows the fix. The audit trail records both.

If the mismatch is caused by a missing primitive or a skill drift,
follow those flows as well.

### Version uncertainty

The Version + Skill Resolver Agent could not detect the
GraphCompose version from the project metadata, or the detected
version is not represented in the skill pack manifest.

Required response:

1. Do not pick a version "close enough". Versioned skills exist
   precisely because mixing primitives across versions causes
   defects.
2. Restrict the template to conservative verified primitives only:
   `DocumentSession`, `pageFlow`, the row primitive, the section
   primitive, the table primitive, the theme. Avoid layer stacks,
   shape containers, and anything else that is version-sensitive
   until the version is known.
3. Log the resolution path in `version-resolution.md` for the
   revision, including the inputs the agent inspected, the
   ambiguity, and the conservative fallback that was chosen. The
   resolution log is required even when the version is detected
   successfully.
4. Mark the revision with status `DRAFT` and an explicit note in
   `status.md` that the version was unresolved.
5. Ask the user to confirm the version before approval.

## Symptoms with a 1.7.0 remedy

Three recurring symptoms have a first-class fix in GraphCompose 1.7.0
(this pack's target version). Reach for the documented primitive rather
than a workaround.

- **A bullet / rating dot / arrow renders as tofu or vanishes** because
  the font lacks U+25CF and friends. Do not switch fonts or fake the
  mark with an image. Draw it from geometry: an inline shape run
  (`ParagraphBuilder` / `RichText` `dot(...)` / `shape(ShapeOutline,
  ...)` / `arrow(...)` / `checkbox(...)`). See
  [`typography`](typography.md) and
  [`shapes-and-containers`](shapes-and-containers.md).
- **A positioned badge inside a nested stack will not move off its
  anchor.** This was a real bug in the fixed-slot stack path and is
  fixed in 1.7.0 — `position(node, dx, dy, align)` offsets are now
  honored for stacks nested in a row column or another layer. Confirm
  the project resolves 1.9.0; do not compensate with a canvas-drawn
  badge. See
  [`layer-stacks-and-overlays`](layer-stacks-and-overlays.md).
- **An asymmetric / per-corner rounded card needed a CLIP_PATH-parent
  workaround.** Use `roundedRect(w, h, DocumentCornerRadius)` /
  `ShapeOutline.RoundedRectanglePerCorner` instead. See
  [`shapes-and-containers`](shapes-and-containers.md).

These are remedies, not skill drift: the primitives exist in 1.7.0. If
a project is pinned to 1.6.x, the `graphcompose-1.6` pack documents the
older workarounds and the missing-primitive flow above applies.

## Containment principles

Every troubleshooting response shares three principles:

1. **Preserve the evidence.** Failed revisions keep their artifacts.
   Skill drift produces a skill fix report. Version uncertainty
   produces a resolution log.
2. **Do not invent.** Inventing API, inventing primitives, or
   inventing version compatibility are all forbidden.
3. **Create a new revision rather than edit in place.** This applies
   to fixes after failures, to retries after visual mismatches, and
   to reruns after skill or version corrections.

## Common mistakes

1. **Patching the template to dodge a broken skill.** Forbidden.
   Update the skill.
2. **Substituting an invented method when a documented primitive is
   missing.** Forbidden. Fall back to conservative primitives.
3. **Deleting a failed revision folder.** Forbidden. The audit trail
   depends on it.
4. **Picking a "close enough" GraphCompose version.** Forbidden.
   Restrict to verified primitives and ask the user.
5. **Patching downstream code instead of rerunning analysis and
   mapping** when the visual mismatch is larger than predicted.
   Forbidden.

## Known limitations

- Not every failure mode has a documented response yet. New failure
  modes must be captured in this skill or in
  [`../../../docs/skill-validation.md`](../../../docs/skill-validation.md)
  before they recur.
- Automated detection of skill drift requires the validation
  fixtures shipped in Phase 4. Until those land, drift detection is
  human-led.

## Cross-references

- [`../../../docs/skill-validation.md`](../../../docs/skill-validation.md)
  — skill drift handling and skill fix report template
- [`../../../docs/versioned-skills.md`](../../../docs/versioned-skills.md)
  — no-invented-API rule and skill statuses
- [`../../../docs/revision-model.md`](../../../docs/revision-model.md) —
  failure handling and the `FAILED` status
- [`../../../docs/visual-accuracy-contract.md`](../../../docs/visual-accuracy-contract.md)
  — classification of unexpected mismatches
- [`revision-discipline`](revision-discipline.md) — how failures
  produce new revisions rather than overwriting old ones
- [`visual-regression`](visual-regression.md) — the loop that
  surfaces unexpected mismatches
