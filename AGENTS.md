# AGENTS.md — start here

> Agent, this is your onboarding file. Read it end-to-end before
> doing anything else in this repository. Every other file in the
> tree is linked from here in the order you should reach for it.

## What this project is

GraphCompose AI Template Flow turns a visual document reference (a
PNG screenshot of a CV, invoice, proposal, cover letter, report,
brochure, datasheet — ANY single-page or multi-page document
GraphCompose primitives can express) into a maintainable Java
template that targets GraphCompose 1.6.6 — with a strict visual
parity contract, a typed data spec the user can edit without
touching Java, a per-revision asset bundle (Iconify icons + Google
Fonts), a clean and a debug render, and a publish-quality bundle
under `templates/<id>/` once the user approves.

The agent does NOT draw PDFs with raw coordinates. The agent
reconstructs the document with semantic GraphCompose primitives
(sections, rows, tables, layer stacks, weights, anchors). Every
change creates a new revision; nothing is overwritten.

**Document-kind contract.** The four canonical upstream surfaces
are `cv`, `coverletter`, `invoice`, `proposal`. `cv` and
`coverletter` are on the V2 layered architecture (data → theme →
components → widgets → preset orchestrator); `invoice` and
`proposal` are on the V1 classic surface for now. Any document kind
outside the four still routes through this same pipeline because the
14 skills, the 11 agents, and the tooling chain are all primitive-
level and document-kind agnostic — only the published-bundle
factory and the template surface tables in
`prompts/architecture-mapper-agent.md` care about the kind.

## When the user gives you a request — entry-point dispatch

Read the user's first message and match it to one of these gestures.
Each gesture sends you to a different starting agent.

| User gesture | Start agent | What you do first |
|---|---|---|
| Drops a reference image and says "make a template like this" / "create from this screenshot" | `prompts/orchestrator-agent.md` → new generation | Create the project skeleton under `examples/<kebab-id>/`, drop the reference into `reference/`, open `revision-001`, run the chain top-to-bottom. |
| Points at an existing project / revision and asks for a change ("make awards wider", "swap Poppins for Lato", "make these clickable") | `prompts/orchestrator-agent.md` → revision | Use the current draft as parent, open the next revision, route only through the agents whose region changed. |
| Says "save" / "approve" / "сохрани" / "это хорошо" | `prompts/revision-manager-agent.md` → approve | Flip DRAFT → APPROVED, supersede the previous APPROVED, auto-trigger `prompts/template-publisher-agent.md` to rebuild `templates/<id>/`. |
| Says "previous was better" / "undo" / "revert" | `prompts/revision-manager-agent.md` → undo / revert-to-approved | Create a new DRAFT from the parent (or approved); never overwrite history. |
| Says "what changed" / "show diff" | `prompts/visual-review-agent.md` | Read the latest `visual-review.md`; do not start a new revision. |
| Says "keep new awards but restore old header" | `prompts/revision-manager-agent.md` → selective rollback | Use `restore-component` semantics; works only because every visible region maps to a named private render method. |

If the gesture is ambiguous, ask one clarifying question before
opening a revision. Never spawn a revision for ambiguous input.

## The 11-agent chain (current)

```text
Template Orchestrator Agent          prompts/orchestrator-agent.md
        ↓
Version + Skill Resolver Agent       prompts/version-skill-resolver-agent.md
        ↓
Skill Validator Agent                 prompts/skill-validator-agent.md
        ↓
Visual Analyzer Agent                 prompts/visual-analyzer-agent.md
        ↓
Architecture Mapper Agent             prompts/architecture-mapper-agent.md
        ↓
Asset Resolver Agent                  prompts/asset-resolver-agent.md
        ↓
Template Coder Agent                  prompts/template-coder-agent.md
        ↓
Test + Render Agent                   prompts/test-render-agent.md
        ↓
Visual Review Agent                   prompts/visual-review-agent.md
        ↓
Revision Manager Agent                prompts/revision-manager-agent.md
        ↓
[user approves]
        ↓
Template Publisher Agent              prompts/template-publisher-agent.md
        ↓
templates/<template-id>/
```

The master prompt that summarises the contract for all eleven is
[`prompts/master-prompt.md`](prompts/master-prompt.md). The detailed
per-agent docs (inputs / outputs / responsibilities / forbidden
behaviors / hand-off) live in [`docs/agents.md`](docs/agents.md).

## Cross-cutting principles (NEVER violate)

The principles are encoded in the Shared Rules block at the bottom
of every agent prompt. The ones that compound across the chain:

1. **Relational geometry over pixel constants.** Layout widths and
   weights are DERIVED from a small set of base constants (page
   size, margins, column gaps, weights). Hardcoded pixel values
   only for genuinely independent dimensions (icon size, line
   marker height, fixed paddings). When a number CAN be derived it
   MUST be derived. See
   [`prompts/template-coder-agent.md`](prompts/template-coder-agent.md)
   under "Relational geometry over pixel constants".

2. **Anchors and alignment over hand-computed offsets.** Element-
   to-element positioning uses engine primitives (`LayerAlign`,
   `TextAlign`, `InlineImageAlignment`, `DocumentTableTextAnchor`,
   `RowBuilder.weights(...)`, `LayerStackBuilder.position(..., align)`,
   `HAnchor`/`VAnchor`). The Visual Analyzer writes relationships,
   the Architecture Mapper picks the named anchor, the Template
   Coder reaches for the primitive.

3. **Data-spec contract.** Variable content (names, contacts,
   dates, jobs, awards) lives in `<revision>/<doc-kind>-data.json`.
   The template renders from a typed Java spec record loaded by a
   `--spec-provider`. The template body must not carry content
   literals. See the data-spec contract in
   [`prompts/template-coder-agent.md`](prompts/template-coder-agent.md).

4. **Asset flow.** Icons come from Iconify (HTTP API, rasterized to
   PNG via ImageMagick). Fonts come from the GraphCompose bundled
   Google Fonts list (no file copy needed) or are dropped as TTF
   into `assets/fonts/`. The single source of truth is
   `<revision>/assets-manifest.json`. See
   [`tools/asset-resolver/README.md`](tools/asset-resolver/README.md).

5. **Parity gate.** For "refactor only" revisions the Visual Review
   Agent MUST run `magick compare -metric AE <parent> <child>` and
   recommend APPROVE only on `AE == 0`. Quote the metric in
   `visual-review.md`; don't paraphrase. See
   [`prompts/visual-review-agent.md`](prompts/visual-review-agent.md).

6. **Every change creates a new revision.** Never overwrite an
   APPROVED revision. Status set: `DRAFT`, `APPROVED`, `REJECTED`,
   `REVERTED`, `SUPERSEDED`, `FAILED`.

7. **GraphCompose is the source of truth.** If a skill disagrees
   with library behavior, the skill is wrong — fix the skill.
   Never invent GraphCompose APIs.

## Project anatomy (where things live)

```
examples/<project>/
  template-project.json            project manifest (displayName, currentApproved/Draft, spec class, data file)
  reference/reference.png          visual reference + reference.md description
  reference/reference-page-N.png   additional pages
  render-runner/                    Maven project compiling template + spec
    pom.xml
    src/main/java/com/demcha/examples/<kind>/
      <Kind>Spec.java               typed data record (Jackson-bound)
      <Kind>SpecProvider.java       loads <doc-kind>-data.json
  revisions/revision-NNN/           one folder per revision
    revision.json                   metadata: parent, status, artifacts, changedComponents
    user-request.md                 captured user gesture
    orchestration-decision.md       routing decision
    version-resolution.md
    skill-validation-report.md
    visual-analysis.md              ratios, anchors, regions
    architecture-plan.md            component mapping, theme tokens, design assets
    asset-request.json              icons + fonts needed
    data-schema.md                  data field documentation
    assets-manifest.json            actual icons + font roles + paths
    assets/icons/<token>.png        downloaded icons
    assets/fonts/*.ttf              dropped fonts (non-bundled)
    <doc-kind>-data.json            content (Rose Harris fixture etc.)
    generated-template.java         the renderer
    generated-test.java
    output.pdf / output.png / output-page-N.png   clean render
    output-debug.pdf / output-debug.png / ...      debug render with guideLines
    layout-snapshot.json
    visual-review.md                parity classification
    status.md
    test-result.md
    render.log

templates/<template-id>/             publish-quality bundle (built after APPROVE)
  README.md / template.json
  src/<TemplateClass>.java          renamed + polished Javadoc
  src/<Spec>.java + <SpecProvider>.java
  data/<doc-kind>-data.example.json
  assets/asset-request.json + icons/ + fonts/
  preview/output.pdf + output-page-N.png + output-debug.pdf + ...

prompts/                              agent prompts (the contract)
  master-prompt.md                    cross-agent contract
  <agent>-agent.md × 11               per-agent prompts

docs/                                 long-form reference
  agents.md                           detailed agent chain
  workflow.md                         step-by-step pipeline
  versioned-skills.md
  revision-model.md
  rollback.md
  visual-accuracy-contract.md
  visual-review-loop.md
  quickstart.md                       human-facing install + first render

skills/                               versioned skill packs
  skill-manifest.json
  versions/graphcompose-1.6/*.md      one skill per topic, tied to GraphCompose 1.6.x (verified against 1.6.6)

tools/
  asset-resolver/                     Iconify + Google Fonts CLI (Node)
  preview-renderer/                   Maven module: render + preview PDF→PNG (Java)
  revision-manager/                   Node CLI: init, new-revision, approve, undo, ...
  visual-diff/                        Node CLI (planned: snapshot regression)

scripts/
  render-cv-reference.mjs             clean + debug render for the cv example
  render-invoice-reference.mjs        same for invoice
  publish-template.mjs                copy approved revision into templates/
```

## Quick recipes

### New template from a reference

1. User drops the reference image + says "make a template, call it
   <name>".
2. Compute `kebab-id` from the name; create
   `examples/<kebab-id>/` with `template-project.json` + `reference/`
   + `revisions/`.
3. Open `revision-001`, write `user-request.md` capturing the gesture,
   route through the agent chain top-to-bottom.
4. Render through `scripts/render-<kebab-id>.mjs` (clone from
   `scripts/render-cv-reference.mjs`).
5. Return the preview to the user; iterate on user feedback.

### Iterate on an existing revision

1. User says "make X wider" / "swap font" / "this should be a link".
2. Open the next revision off the current draft (parent =
   `currentDraftRevisionId`).
3. Route ONLY through the agents whose region changed (often just
   Template Coder + Test+Render + Visual Review).
4. Show the new preview; the parity gate against the parent
   classifies the diff.

### Approve the current draft

1. User says "save" / "approve" / "сохрани".
2. Revision Manager flips DRAFT → APPROVED, marks the previous
   APPROVED as SUPERSEDED, updates
   `template-project.json#currentApprovedRevisionId`.
3. Auto-trigger Template Publisher: republish
   `templates/<template-id>/` with `--force-template` if the
   template class itself changed (constants, render logic). Re-apply
   the polished Javadoc the publisher would otherwise overwrite.

## Cardinal rules summary (fast reference)

- Read this file (AGENTS.md) before doing anything else.
- Read [`prompts/master-prompt.md`](prompts/master-prompt.md) and
  the agent prompt for whichever stage you're entering.
- Every change creates a new revision. Never overwrite APPROVED.
- Relational geometry: derive widths from base constants, don't
  hardcode pixels.
- Anchor-first: use `LayerAlign` / `TextAlign` / `weights(...)`
  instead of computing offsets.
- Data-spec: content lives in `<doc-kind>-data.json`, not in Java.
- Asset flow: Iconify icons via the resolver, bundled fonts via
  `FontName.<NAME>`, manifest is the source of truth.
- Parity gate: `magick compare -metric AE == 0` for refactor
  revisions; quote the metric.
- GraphCompose API is the source of truth; never invent.

## Where to go from here

- [`prompts/master-prompt.md`](prompts/master-prompt.md) — the
  cross-agent contract in one document.
- [`docs/agents.md`](docs/agents.md) — long-form description of each
  agent + the cross-chain principles (relational geometry, anchors).
- [`docs/workflow.md`](docs/workflow.md) — step-by-step pipeline
  with artifact lifecycle.
- [`examples/cv-reference/`](examples/cv-reference/) — the worked
  example. revision-008 is the current APPROVED baseline. Reading
  revisions 001 → 008 in order shows how a real iteration looks.
- [`templates/mint-editorial-cv/`](templates/mint-editorial-cv/) —
  the published bundle the cv-reference flow emits.
