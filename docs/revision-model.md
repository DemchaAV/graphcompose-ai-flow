# Revision Model

This page describes how the project tracks state across iterations of
a template: the project-level metadata, the per-revision metadata,
the lifecycle statuses, the relationship between approved and draft
revisions, and the artifacts that may live inside a revision folder.

## Project metadata

File:

```text
template-project.json
```

Example:

```json
{
  "projectName": "invoice-reference",
  "referenceImage": "reference/reference.png",
  "targetGraphComposeVersion": "1.6.0",
  "skillPack": "skills/versions/graphcompose-1.7",
  "currentApprovedRevisionId": "revision-001",
  "currentDraftRevisionId": "revision-002",
  "createdAt": "2026-05-12T16:00:00Z",
  "updatedAt": "2026-05-12T16:30:00Z"
}
```

`template-project.json` is the only place that knows which revision
is currently approved and which is the active draft. Only the
Revision Manager Agent ([agents.md](agents.md#revision-manager-agent))
writes to this file.

## Revision metadata

File:

```text
revisions/revision-002/revision.json
```

Example:

```json
{
  "id": "revision-002",
  "parentRevisionId": "revision-001",
  "status": "DRAFT",
  "userRequest": "Make the table darker and move the footer down",
  "targetGraphComposeVersion": "1.6.0",
  "skillPack": "skills/versions/graphcompose-1.7",
  "changedComponents": [
    "LineItemsTable",
    "Footer"
  ],
  "createdAt": "2026-05-12T16:30:00Z",
  "artifacts": {
    "userRequest": "user-request.md",
    "orchestrationDecision": "orchestration-decision.md",
    "versionResolution": "version-resolution.md",
    "skillValidation": "skill-validation-report.md",
    "visualAnalysis": "visual-analysis.md",
    "architecturePlan": "architecture-plan.md",
    "template": "generated-template.java",
    "test": "generated-test.java",
    "patch": "patch.diff",
    "layoutSnapshot": "layout-snapshot.json",
    "pdf": "output.pdf",
    "preview": "output.png",
    "visualReview": "visual-review.md",
    "testResult": "test-result.md",
    "status": "status.md"
  }
}
```

`parentRevisionId` always points to the revision the draft was
derived from. Selective rollback revisions (see [rollback.md](rollback.md))
still record a single parent — the base draft — and use
`changedComponents` to describe which parts came from older
revisions.

## Revision statuses

```text
DRAFT
APPROVED
REJECTED
REVERTED
SUPERSEDED
FAILED
```

| Status | Meaning |
|---|---|
| `DRAFT` | Generated but not approved |
| `APPROVED` | User-approved version |
| `REJECTED` | User rejected this revision |
| `REVERTED` | Revision exists only as rollback marker |
| `SUPERSEDED` | Replaced by newer revision |
| `FAILED` | Compile/render/validation failed but artifacts are preserved |

## Current approved vs draft

`template-project.json` tracks two distinct pointers:

- `currentApprovedRevisionId` — the last revision the user approved.
  It is the source of truth and the rollback target for "revert to
  approved".
- `currentDraftRevisionId` — the active in-progress revision. New
  revisions are normally created from the draft; an approval flips
  the draft pointer to the approved pointer.

The orchestrator never overwrites the approved revision directly.
Every change creates a new revision. This is the core rule of the
Revision Manager Agent:

```text
Never overwrite the approved revision directly.
Every change creates a new revision.
```

This means even a tiny tweak ("nudge the footer down 4 px") produces
a fresh `revision-N` folder rather than editing the existing one. The
cost is folder count; the benefit is that every step is reversible,
and the rollback flows in [rollback.md](rollback.md) become
mechanical rather than guesswork.

## Failed revision behavior

A `FAILED` revision is not deleted. Its folder is preserved, with
every artifact that managed to be produced before the failure. This
keeps the audit trail intact:

- if compilation failed, `build.log` and the partially generated
  `generated-template.java` stay.
- if rendering failed, `output.pdf` may be missing but `render.log`
  and the upstream artifacts stay.
- if the visual review judged the output unacceptable, `output.pdf`,
  `output.png`, and `visual-review.md` all stay.

The next revision is created from the previous good draft (or
approved), never by editing the failed one in place.

## Artifact inventory

A revision folder can contain the following files. The exact set
depends on how far the chain progressed; FAILED revisions may be
missing later artifacts.

- `user-request.md` — what the user asked for, captured at revision
  creation time.
- `orchestration-decision.md` — Template Orchestrator routing
  decision and rationale.
- `version-resolution.md` — Version + Skill Resolver output naming
  the target GraphCompose version and skill pack.
- `skill-validation-report.md` — Skill Validator result for this
  revision.
- `visual-analysis.md` — Visual Analyzer output describing the
  reference.
- `architecture-plan.md` — Architecture Mapper output translating the
  analysis into a GraphCompose plan.
- `generated-template.java` — Template Coder output.
- `generated-test.java` — Template Coder test output.
- `patch.diff` — diff between this revision and its parent.
- `changed-components.md` — Template Coder note describing which
  components changed.
- `layout-snapshot.json` — Test + Render Agent layout snapshot.
- `output.pdf` — rendered PDF.
- `output.png` — preview image used for visual review.
- `visual-review.md` — Visual Review Agent output.
- `test-result.md` — Test + Render Agent test summary.
- `status.md` — final disposition written by the Revision Manager.

See [agents.md](agents.md) for which agent owns each artifact, and
[workflow.md](workflow.md) for the order in which they appear.
