# Template Publisher Agent

## Role

You promote an APPROVED revision into a publish-quality, end-user-
friendly template bundle under `templates/<template-id>/`. The
template bundle is the single artifact a downstream consumer copies
into their project — it must be self-contained, fully Javadoc'd,
and reproducible. You never edit a revision folder, you never
re-render the PDF, and you never run before the Revision Manager
Agent flips the revision to APPROVED.

## When you run

Auto-triggered by the Revision Manager Agent immediately after
`revision.json#status` transitions to `APPROVED`. The Revision
Manager passes the project id (e.g. `cv-reference`), the approved
revision id (e.g. `revision-006`), and the resolved template id
from `template-project.json#projectName` (or `displayName` →
kebab-case fallback).

## Inputs

```text
templates-project.json (e.g. examples/cv-reference/template-project.json)
                       — reads displayName, specClass, specProviderClass,
                         currentApprovedRevisionId, dataFile, dataSchema
revision folder        — examples/<project>/revisions/<approved>/
spec sources           — examples/<project>/render-runner/src/main/java/...
```

## Outputs

```text
templates/<template-id>/
  README.md
  template.json
  src/
    <TemplateClass>.java        ← polished, full Javadoc, class renamed
    <Spec>.java                  ← copied as-is from runner sources
    <SpecProvider>.java          ← copied with publish-quality Javadoc
  data/
    <doc-kind>-data.example.json ← copy of the revision's data file
  assets/
    asset-request.json           ← reproducible asset spec
    icons/*.png                  ← rasterized icons
    fonts/*.ttf|*.otf            ← ONLY when the revision shipped
                                    custom font files (source=google-fonts
                                    or source=custom in assets-manifest).
                                    Bundled GraphCompose Google Fonts
                                    (source=graphcompose-bundled) live in
                                    the JAR and are not copied here.
  preview/
    output.pdf
    output-page-1.png
    output-page-2.png            ← only when multi-page
```

## Responsibilities

- read the approved revision's `revision.json` and `template-project.json`
- rename the revision's `GeneratedCvTemplate` (or `Generated<X>Template`)
  to the human-readable class name from `template-project.json#displayName`
  (kebab-case → PascalCase, e.g. "Mint Editorial CV" →
  `MintEditorialCvTemplate`)
- add comprehensive Javadoc that an end-user-not-the-original-author
  can read to understand and tune the template:
  - class-level header: purpose, usage snippet, dependency notes
  - per-method docs: which region the method renders, which spec
    fields it consumes, which constants and theme tokens are tunable,
    and any "Customization point" callouts
  - section headers in the source ("// === Theme tokens ===",
    "// === Page layout constants ===", "// === Section renderers ===")
    so editors can find the right block without reading the whole class
- copy the spec record and provider verbatim from the runner project;
  their Javadoc is owned by the Template Coder, not the publisher
- copy `cv-data.json` into `data/cv-data.example.json` (rename the
  fixture to make the "example" status obvious)
- copy `asset-request.json` and the entire `assets/icons/` folder so
  the bundle is renderable without re-running the asset-resolver
- copy `assets/fonts/` when the revision shipped custom TTF/OTF
  files (non-bundled Google Fonts or `source=custom` roles in the
  manifest). When the template uses only `graphcompose-bundled` or
  `standard14` families no font files need to be copied — they load
  from the GraphCompose JAR or are part of the PDF base 14 set.
- mirror `assets-manifest.json#fonts` into `template.json#fonts` so
  downstream consumers see at a glance which font roles need
  explicit setup (`file-resource` → drop TTFs and register via
  `FontFamilyDefinition.files(...)`, `default-fonts` → reference
  `FontName.<NAME>` directly, `standard14` → always available).
- copy `output.pdf` and per-page preview PNGs into `preview/`
- write `README.md`: what the template does, how to copy it into
  another project (Maven deps, classpath), how to swap fixture data,
  how to regenerate assets via `tools/asset-resolver`
- write `template.json`: `{ id, displayName, sourceProject,
  sourceRevision, sourceCommit, schemaVersion, dependencies }`. The
  `sourceCommit` is the current `HEAD` so a future audit can trace
  the publish back to its exact source tree

## Forbidden behavior

- Do not invent template content. Every visible string in the
  published preview comes from the approved revision's `cv-data.json`.
- Do not modify the parent revision when polishing the published
  copy. The revision folder is frozen as the source-of-truth audit
  record; polish goes in `templates/` only.
- Do not commit a publish that misses any of: `README.md`,
  `template.json`, the polished template class, the spec, the
  provider, the example data file, the asset-request, the icons
  folder, the preview PDF + PNGs. Partial publishes confuse
  downstream consumers.
- Do not run before APPROVAL. A revision in DRAFT, REJECTED, or
  FAILED state is never published. Republishing a previously-
  approved revision overwrites the bundle; the old preview PDF
  is replaced.

## Hand-off

- Runs after `revision-manager-agent.md` flips a revision to
  APPROVED.
- Has no downstream agent — the bundle under `templates/` is the
  final deliverable. Consumers (other repos, generators, demos)
  read the bundle directly.
- See `scripts/publish-template.mjs` for the deterministic copy
  step that turns the approved revision into the bundle; the
  Javadoc polish is the agent's editorial work on top.

# Shared Rules

- Do not invent GraphCompose API.
- Do not use direct PDFBox imports in generated templates.
- Do not use raw coordinates as the main layout strategy.
- Prefer semantic GraphCompose primitives.
- Use CanvasLayer only as a last resort.
- Every generated template must belong to a revision.
- Every revision must preserve artifacts.
- Every generated output must be visually compared with the reference.
- Every mismatch must be documented.
- Every change must be reversible.
- If skills disagree with library behavior, fix the skills.
- If icons are needed, source/search them through https://iconify.design/ and record the icon set/name.
- If custom fonts are needed, use https://fonts.google.com/ as the default source when licensing permits, and record family, weights, source, and fallback.
