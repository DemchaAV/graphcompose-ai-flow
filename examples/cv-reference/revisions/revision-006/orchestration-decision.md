# Orchestration Decision

## Task

Refactor the Mint Editorial CV flow so content lives in a JSON file
and the template is a pure renderer. Also make References emails
clickable.

## Decision

This is a revision of `revision-005` (which itself is a one-line
diff off the approved `revision-004`). The chain runs through every
agent — Architecture Mapper writes a new `data-schema.md` and an
expanded `cv-data.json`, Asset Resolver re-runs against the
unchanged `asset-request.json`, Template Coder rewrites
`generated-template.java` to consume `MintEditorialCvSpec` (a
typed Java record) loaded by `MintEditorialCvSpecProvider`.

```text
Architecture Mapper  → architecture-plan.md
                       data-schema.md
                       asset-request.json
                       cv-data.json (fixture)
                ↓
Asset Resolver       → assets-manifest.json + assets/icons/*.png
                ↓
Template Coder       → generated-template.java (consumes spec via
                       compose(DocumentSession, MintEditorialCvSpec))
                ↓
Test + Render        → preview-renderer with
                       --spec-provider MintEditorialCvSpecProvider
```

## Scope

- Define `MintEditorialCvSpec` (Java record) in the runner project
  under `examples/cv-reference/render-runner/src/main/java/com/demcha/examples/cv/`.
  Nested records: `Header`, `ContactEntry`, `EducationEntry`,
  `ExperienceEntry`, `Skill`, `SocialLink`, `Award`, `Reference`.
- Add Jackson (`jackson-databind 2.17.2`) to the runner pom so the
  spec deserializes from JSON.
- Ship a per-revision `cv-data.json` carrying all the Rose Harris
  fixture content so this revision renders identically to
  revision-005 even though the source of truth changed.
- Add a `MintEditorialCvSpecProvider#create()` static factory that
  preview-renderer's `--spec-provider` flag invokes via reflection.
  It reads `cv-data.json` from `-Dgraphcompose.revision.dir`.
- Refactor the template to `compose(DocumentSession, MintEditorialCvSpec)`.
  Replace every string literal with a spec lookup and apply
  `letterSpace(...)` for visual transformations.
- Wrap Reference emails in `DocumentLinkOptions` so they become
  clickable `mailto:` links, matching the Social entries from
  revision-005.
- Update `scripts/render-cv-reference.mjs` to add
  `--spec-provider com.demcha.examples.cv.MintEditorialCvSpecProvider`
  whenever `cv-data.json` exists for the revision.

## Out Of Scope For This Revision

- Migrating to the canonical `CvSpec` shipped under
  `com.demcha.compose.document.templates.cv.spec` — that record uses
  a module-based composition model. For an example template this
  simpler bespoke spec is easier to read and edit.
- Loading the spec from somewhere other than the revision folder.
- Schema validation through JSON Schema; field validation is in
  the Java record's compact constructor.
