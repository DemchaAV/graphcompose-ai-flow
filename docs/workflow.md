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
Create Architecture Plan (+ asset-request.json)
  ↓
Resolve Design Assets (icons + fonts → assets-manifest.json)
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
  ↓
Publish Template (on APPROVE only)
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
listing visual risks. The Architecture Mapper also writes
`asset-request.json` enumerating every icon token (with preferred
Iconify sets) and font role (with Google Fonts family + weights or
the standard 14 fallback). The Architecture Mapper does not write
final Java.

### 7. Resolve Design Assets

Owner: Asset Resolver Agent ([agents.md](agents.md#asset-resolver-agent)).
Input: asset-request.json, architecture-plan.md, selected skill pack,
revision folder. Output: assets-manifest.json plus binary assets under
`<revision>/assets/icons/` and `<revision>/assets/fonts/`. Icons are
downloaded as PNG from `api.iconify.design`; fonts are validated
against `DefaultFonts` or marked `manual_drop_required` when the
family is not bundled in GraphCompose. The manifest is the single
source of truth the Template Coder consumes. See
[`tools/asset-resolver/README.md`](../tools/asset-resolver/README.md)
for the CLI surface and schemas.

### 8. Generate Template Code

Owner: Template Coder Agent ([agents.md](agents.md#template-coder-agent)).
Input: architecture-plan.md, assets-manifest.json, selected skill
pack, GraphCompose version, base revision when applicable. Output:
generated-template.java, generated-test.java, patch.diff,
changed-components.md. The agent must use only documented APIs from
the loaded skill pack and must reference icon paths and font names
through the manifest rather than hard-coding them.

### 9. Compile

Owner: Test + Render Agent ([agents.md](agents.md#test--render-agent)).
Input: generated-template.java, generated-test.java, project config.
Output: build.log and a pass/fail signal. Failure is preserved as a
FAILED revision; nothing is overwritten.

### 10. Render PDF

Owner: Test + Render Agent. Output: output.pdf and render.log. The
PDF must exist and not be empty.

### 11. Convert PDF to Preview Image

Owner: Test + Render Agent. Output: output.png and layout-snapshot.json.
The preview is what the Visual Review Agent compares against the
reference; the snapshot is what regression tests compare across
revisions.

### 12. Compare Preview Against Reference

Owner: Visual Review Agent ([agents.md](agents.md#visual-review-agent)).
Input: reference.png, output.png, previous-output.png when available,
layout-snapshot.json, visual-analysis.md, architecture-plan.md.
Output: visual-review.md with a reference parity score and
classified mismatches.

### 13. Create Visual Review

Owner: Visual Review Agent. The same step as the comparison itself,
but the deliverable is the written review document, including a
component-by-component breakdown and an APPROVE / REVISE / REJECT
recommendation. See [visual-review-loop.md](visual-review-loop.md).

### 14. Revise

Owner: Template Orchestrator Agent, routing back through the chain.
A new revision is created from the current draft; impacted components
are patched; render and review run again. Revising never overwrites
prior revisions.

### 15. Approve / Reject / Rollback

Owner: Revision Manager Agent ([agents.md](agents.md#revision-manager-agent)).
Approval flips a DRAFT to APPROVED and records the new
`currentApprovedRevisionId` in `template-project.json`. Rejection
marks the draft REJECTED. Rollback is covered in detail in
[rollback.md](rollback.md). The Revision Manager never overwrites the
approved revision directly — every change creates a new revision.

### 16. Publish Template

Owner: Template Publisher Agent ([agents.md](agents.md#template-publisher-agent)).
Runs only when step 15 transitioned the revision to APPROVED.
Reads `template-project.json` and the approved revision folder,
rewrites `Generated<X>Template` as `<DisplayName>Template` with
publish-quality Javadoc, and copies the spec, provider, data file,
asset bundle, and rendered preview into
`templates/<template-id>/`. The bundle is the artifact downstream
consumers copy into their own projects. See
[`scripts/publish-template.mjs`](../scripts/publish-template.mjs) for
the deterministic copy step.

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
- `asset-request.json` — written by the Architecture Mapper alongside
  the plan; declares every icon token and font role the template needs.
- `assets-manifest.json` plus `assets/icons/*.png` and
  `assets/fonts/*.ttf` — written by the Asset Resolver Agent after
  resolving the request against `api.iconify.design` and the bundled
  Google Fonts list.
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

After APPROVAL, the Template Publisher Agent additionally emits a
publish-quality bundle outside the revision folder:

- `templates/<template-id>/README.md`
- `templates/<template-id>/template.json` (id, displayName,
  sourceProject, sourceRevision, sourceCommit, schemaVersion,
  dependencies)
- `templates/<template-id>/src/<TemplateClass>.java` — renamed
  from `Generated<X>Template`, with full Javadoc
- `templates/<template-id>/src/<Spec>.java`
- `templates/<template-id>/src/<SpecProvider>.java`
- `templates/<template-id>/data/<doc-kind>-data.example.json`
- `templates/<template-id>/assets/asset-request.json`
- `templates/<template-id>/assets/icons/*.png`
- `templates/<template-id>/preview/output.pdf`
- `templates/<template-id>/preview/output-page-N.png`
