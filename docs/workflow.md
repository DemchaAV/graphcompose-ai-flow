# Workflow

This page describes the full agent-driven workflow, what each step
expects as input, what it produces, and which agent owns it. The
workflow is the single source of truth for how a reference becomes an
approved GraphCompose template.

## Improved workflow diagram

```text
Start
  ↓
Detect Task Type
  ↓
Detect / Select GraphCompose Version
  ↓
Load Matching Skill Pack
  ↓
Validate Skills Against Library / Verified Fixtures
  ↓
Analyze Reference
  ↓
Create Architecture Plan
  ↓
Generate Template Code
  ↓
Compile
  ↓
Render PDF
  ↓
Convert PDF to Preview Image
  ↓
Compare Preview Against Reference
  ↓
Create Visual Review
  ↓
Revise if Needed
  ↓
Approve / Reject / Rollback
```

The earlier, simpler form was just `Analyze → Plan → Generate →
Render → Compare → Revise → Approve / Rollback`. The improved
workflow adds explicit version detection, skill resolution, skill
validation, and a clearer separation between code generation,
rendering, and visual review.

## Task type detection

The orchestrator must detect the user's intent before doing anything
else.

| User request | Task type |
|---|---|
| "Create template from this screenshot" | New generation |
| "Make the table darker" | Revision |
| "Move the footer lower" | Revision |
| "Previous version was better" | Undo last change |
| "Return to approved version" | Revert to approved |
| "Keep new table but restore old header" | Selective rollback |
| "Approve this version" | Approval |
| "Show differences" | Diff / review |
| "What changed?" | Revision summary |

See [rollback.md](rollback.md) for how the rollback task types are
implemented and [revision-model.md](revision-model.md) for the
revision statuses involved.

## Steps

### 1. Detect Task Type

Owner: Template Orchestrator Agent ([agents.md](agents.md#template-orchestrator-agent)).
Input: user request, project metadata, current approved and draft
revisions. Output: orchestration-decision.md and a routing choice
between new generation, revision, approval, undo, revert to approved,
or selective rollback.

### 2. Resolve GraphCompose Version

Owner: Version + Skill Resolver Agent ([agents.md](agents.md#version--skill-resolver-agent)).
Input: pom.xml, build.gradle, project config, skill-manifest.json,
user request. Output: version-resolution.md naming the target
GraphCompose version and the selected skill pack path.

### 3. Load Matching Skill Pack

Owner: Version + Skill Resolver Agent. The selected skill pack lives
under `skills/versions/graphcompose-<version>/`. Only skills marked as
compatible with the resolved version are loaded.

### 4. Validate Skills

Owner: Skill Validator Agent ([agents.md](agents.md#skill-validator-agent)).
Input: selected skill pack, GraphCompose version, verified examples,
fixture projects, build output, render output. Output:
skill-validation-report.md and, when drift is detected,
skill-fix-report.md. If the library and skills disagree, the library
wins. See [skill-validation.md](skill-validation.md).

### 5. Analyze Reference

Owner: Visual Analyzer Agent ([agents.md](agents.md#visual-analyzer-agent)).
Input: reference.png, optional reference.pdf, optional user notes.
Output: visual-analysis.md describing page format, regions, hierarchy,
typography, icons, colors, spacing, and uncertain parts. Icon
replacement candidates come from Iconify; custom font candidates
come from Google Fonts when licensing permits. The Visual Analyzer
never writes code.

### 6. Create Architecture Plan

Owner: Architecture Mapper Agent ([agents.md](agents.md#architecture-mapper-agent)).
Input: visual-analysis.md, selected skills, GraphCompose version,
reference image. Output: architecture-plan.md mapping each visual
region to GraphCompose DSL primitives, naming render methods, and
listing visual risks. The Architecture Mapper does not write final
Java.

### 7. Generate Template Code

Owner: Template Coder Agent ([agents.md](agents.md#template-coder-agent)).
Input: architecture-plan.md, selected skill pack, GraphCompose
version, base revision when applicable. Output: generated-template.java,
generated-test.java, patch.diff, changed-components.md. The agent
must use only documented APIs from the loaded skill pack.

### 8. Compile

Owner: Test + Render Agent ([agents.md](agents.md#test--render-agent)).
Input: generated-template.java, generated-test.java, project config.
Output: build.log and a pass/fail signal. Failure is preserved as a
FAILED revision; nothing is overwritten.

### 9. Render PDF

Owner: Test + Render Agent. Output: output.pdf and render.log. The
PDF must exist and not be empty.

### 10. Convert PDF to Preview Image

Owner: Test + Render Agent. Output: output.png and layout-snapshot.json.
The preview is what the Visual Review Agent compares against the
reference; the snapshot is what regression tests compare across
revisions.

### 11. Compare Preview Against Reference

Owner: Visual Review Agent ([agents.md](agents.md#visual-review-agent)).
Input: reference.png, output.png, previous-output.png when available,
layout-snapshot.json, visual-analysis.md, architecture-plan.md.
Output: visual-review.md with a reference parity score and
classified mismatches.

### 12. Create Visual Review

Owner: Visual Review Agent. The same step as the comparison itself,
but the deliverable is the written review document, including a
component-by-component breakdown and an APPROVE / REVISE / REJECT
recommendation. See [visual-review-loop.md](visual-review-loop.md).

### 13. Revise

Owner: Template Orchestrator Agent, routing back through the chain.
A new revision is created from the current draft; impacted components
are patched; render and review run again. Revising never overwrites
prior revisions.

### 14. Approve / Reject / Rollback

Owner: Revision Manager Agent ([agents.md](agents.md#revision-manager-agent)).
Approval flips a DRAFT to APPROVED and records the new
`currentApprovedRevisionId` in `template-project.json`. Rejection
marks the draft REJECTED. Rollback is covered in detail in
[rollback.md](rollback.md). The Revision Manager never overwrites the
approved revision directly — every change creates a new revision.

## Artifact lifecycle

This is the order in which artifacts appear in a typical revision
folder.

- `user-request.md` — captured when the orchestrator opens a revision.
- `orchestration-decision.md` — written by the Template Orchestrator
  after task type detection.
- `version-resolution.md` — written by the Version + Skill Resolver.
- `skill-validation-report.md` — written by the Skill Validator. If
  drift is detected, a `skill-fix-report.md` is also produced under
  `validation/`.
- `visual-analysis.md` — written by the Visual Analyzer from the
  reference image.
- `architecture-plan.md` — written by the Architecture Mapper from
  the analysis.
- `generated-template.java`, `generated-test.java`, `patch.diff`,
  `changed-components.md` — written by the Template Coder.
- `output.pdf`, `output.png`, `layout-snapshot.json`, `test-result.md`,
  `build.log`, `render.log` — written by the Test + Render agent.
- `visual-review.md` — written by the Visual Review Agent after
  comparison.
- `revision.json`, `status.md` — written by the Revision Manager to
  persist the revision metadata and final disposition.

A FAILED revision still keeps every artifact that was produced before
the failure point. See [revision-model.md](revision-model.md) for the
full artifact inventory and the rule about not overwriting approved
revisions.
