# Architecture Plan

## Target GraphCompose Version

`1.6.0` (skill pack `skills/versions/graphcompose-1.6`).

## Selected Skills

`graphcompose-basics`, `layout-primitives`, `themes-and-colors`,
`typography`, `spacing-and-alignment`, `shapes-and-containers`,
`backgrounds-and-panels`, `pagination`, `tables`,
`visual-to-graphcompose-mapping`, `revision-discipline`.

## Document Structure

Inherited from `revision-005`. The only structural change in this
revision is **inside** the existing structure: every text node now
sources its content from `MintEditorialCvSpec` instead of literals
hard-coded in Java.

## Component Mapping

| Region | GraphCompose primitive | Spec source |
|---|---|---|
| Header              | `SectionBuilder` paragraphs                 | `spec.header()` |
| Contact lines       | inline-image paragraph + optional link      | `spec.contact()` |
| Interests           | `label()` per item                          | `spec.interests()` |
| Education entries   | per-entry paragraphs                        | `spec.education()` |
| Profile             | body paragraph                              | `spec.profile()` |
| Experience (pages)  | job-title + meta + body + bullet list       | `spec.experiencePage1()` / `spec.experiencePage2()` |
| Expertise badge     | `SectionBuilder.addImage(...)`              | from `assets-manifest.json` |
| Expertise list      | `label()` per item                          | `spec.expertise()` |
| Skills              | label + horizontal rule + vertical marker   | `spec.skills()` |
| Social              | inline-image paragraph + link               | `spec.social()` |
| Awards              | `TableBuilder` 2-column                     | `spec.awards()` |
| References          | `TableBuilder` 2-column with `mailto:` link | `spec.references()` |

## Theme Tokens

Unchanged: `ACCENT #8BCFBE`, `BLACK #181818`, `MUTED #525252`,
`RULE #464646`.

## Design Assets

Unchanged from `revision-005`:

- 9 Iconify icons (contact, social, expertise badge) declared in
  [`asset-request.json`](./asset-request.json) with `pointSize`.
- `Poppins` bundled Google Fonts family for heading + body.
- `Helvetica` standard-14 fallback.

See [`assets-manifest.json`](./assets-manifest.json) for the
authoritative manifest.

## Data Model Assumptions

Single source of truth for content is
[`cv-data.json`](./cv-data.json) in this revision. The Java mirror
is [`MintEditorialCvSpec`](../../render-runner/src/main/java/com/demcha/examples/cv/MintEditorialCvSpec.java).
Field-by-field schema is in [`data-schema.md`](./data-schema.md).

The spec is loaded by
[`MintEditorialCvSpecProvider#create()`](../../render-runner/src/main/java/com/demcha/examples/cv/MintEditorialCvSpecProvider.java),
invoked through preview-renderer's `--spec-provider` flag. The
provider resolves the JSON path from the
`graphcompose.revision.dir` JVM property set by the render script.

The template signature is now:

```java
public void compose(DocumentSession document, MintEditorialCvSpec spec)
```

## Template Class Shape

The template keeps the same render-method decomposition but every
method now takes the slice of the spec it consumes:

```java
private void renderContact(SectionBuilder section, MintEditorialCvSpec spec) {
    heading(section, "Contact");
    for (ContactEntry entry : spec.contact()) {
        iconLine(section, entry.icon(), entry.value(),
                entry.linkUrl().map(DocumentLinkOptions::new).orElse(null));
    }
}
```

Visual transformations (letter-spacing) live in a static helper:

```java
static String letterSpace(String text) {
    // "Rose Harris"  -> "R O S E  H A R R I S"
    // "Contact"      -> "C O N T A C T"
}
```

## Render Methods

`renderHeader`, `renderPageOne`, `renderPageTwo`, `renderContact`,
`renderInterests`, `renderEducation`, `renderProfile`,
`renderExperience` (shared by both pages), `renderExpertise`,
`renderSkills`, `renderSocial`, `renderAwards`, `renderReferences`
plus the helpers `iconLine`, `experienceItem`, `educationItem`,
`emailCell`, `skillBar`, `heading`, `label`, `body`, `gridText`,
`prefixed`, `letterSpace`, `cellStyle`.

## Testing Plan

The smoke test from earlier revisions still applies: every icon in
`assets-manifest.json` must exist on disk before the render runs.
This revision adds an implicit contract: `cv-data.json` must
deserialize cleanly into `MintEditorialCvSpec`. The provider fails
loudly when the file is missing or malformed, surfacing the error
to the agent chain.

## Visual Risks

- Letter-spacing for non-ASCII strings has not been tested
  (Cyrillic, accented Latin). The helper is character-based and
  should work but the visual result has not been verified.
- A `null` spec field that's not pre-coalesced in the compact
  constructor would NPE at render time. The compact constructor
  enforces non-null lists by replacing them with `List.of()`.
- Reference email links use the composed-cell
  (`DocumentTableCell.node(ParagraphNode)`) path; this works in the
  v1.6 PDF backend (verified by `TableCellComposedContentTest`).
  Section-as-cell still does not work — see revision-004's known
  limitations.

## Known Limitations

- The spec is bound to the Mint Editorial CV template; it is not a
  drop-in replacement for the canonical `CvSpec` shipped under
  `com.demcha.compose.document.templates.cv.spec` (which uses a
  module-based composition system).
- The provider reads only from the revision folder. There is no
  fallback to a project-level default file. Each revision is
  self-contained on purpose, so selective rollback works.
- JSON Schema validation is not generated; field constraints live
  inside the Java record's compact constructors.
