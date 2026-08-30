# Audit -- GraphCompose AI Template Flow

Date: 2026-05-18
Auditor: read-only audit subagent

> Historical note: this audit captured an earlier state of the
> repository. Several findings have since been fixed, including the
> GraphCompose package imports, JitPack fixture coordinates, the
> `FAILED`/`REVERTED` revision statuses, and the `fail` CLI verb. See
> `docs/implementation-status.md` for the current claim-vs-reality
> matrix.

## Verdict (one line)

Discipline and revision tooling are real and well-tested; the entire
"GraphCompose API surface" referenced by templates, fixtures, and the
preview-renderer is invented against a fictional `com.demcha.graphcompose.*`
package that does not exist in the real library, so the Phase 6 render
loop cannot wire up. Public-facing prose also lags reality (README/CONTRIBUTING/overview/limitations still say "Phase 1" while
roadmap says all seven phases shipped).

## Critical findings

1. Invented GraphCompose package across every Java artifact.
   - File: `examples/invoice-reference/revisions/revision-001/generated-template.java:5-10`
     and `revision-002/generated-template.java:5-10` import
     `com.demcha.graphcompose.{BusinessTheme,DocumentSession,DocumentTemplate,RowBuilder,SectionBuilder,TableBuilder}`.
   - File: `examples/invoice-reference/revisions/revision-001/generated-test.java:7-8` imports
     `com.demcha.graphcompose.{BusinessTheme,DocumentSession}`.
   - File: every `examples/skill-fixtures/*/src/test/java/...FixtureTest.java`
     (5 files) imports `com.demcha.graphcompose.*`.
   - File: `tools/preview-renderer/src/main/java/com/demcha/graphcompose/preview/RenderCommand.java:41`
     hardcodes `DOCUMENT_SESSION_FQCN = "com.demcha.graphcompose.DocumentSession"`
     as the canary class for runtime detection.
   - Evidence the package is wrong: the real GraphCompose library at
     `C:/Users/Demch/OneDrive/Java/GraphCompose/src/main/java` ships
     `com.demcha.compose.document.api.DocumentSession`,
     `com.demcha.compose.document.dsl.{Row,Section,Table}Builder`,
     `com.demcha.compose.document.templates.api.DocumentTemplate`,
     `com.demcha.compose.document.theme.BusinessTheme`. CLAUDE.md also
     states this: "GraphCompose lives under
     `com.demcha.compose.document.*`".
   - Why critical: every committed Java artifact in the repo refers to
     classes that will never resolve against the real library. The
     "Phase 6 follow-up" cannot work because the canary class
     `com.demcha.graphcompose.DocumentSession` does not exist. The §6.6
     "no invented API" rule is the project's foundation; the
     deliverables violate it in their first line of imports.
   - Recommended fix: search-and-replace
     `com.demcha.graphcompose.` -> the correct subpackage for each
     symbol; switch the canary FQCN to
     `com.demcha.compose.document.api.DocumentSession`; update fixture
     test packages and the `<groupId>` Maven coordinate.

2. Invented Maven coordinate for the GraphCompose dependency.
   - File: every fixture `pom.xml` -- e.g.
     `examples/skill-fixtures/row-basic/pom.xml:14-19` declares
     `<groupId>com.demcha</groupId><artifactId>graphcompose</artifactId><version>1.6.0</version>`.
   - Evidence: `C:/Users/Demch/OneDrive/Java/GraphCompose/pom.xml` ships
     `<groupId>io.github.demchaav</groupId>` `<artifactId>graphcompose</artifactId>`.
   - Why critical: Maven cannot resolve the dependency as written.
     Even if the renderer existed, no fixture could compile.
   - Recommended fix: change groupId to `io.github.demchaav` in all
     five fixture POMs once the dependency is actually published; in
     the meantime document the coordinate as "unverified until 1.6 is
     published" in `validation/api-compatibility-checklist.md`.

3. Wrong factory call: `DocumentSession.create()` and `BusinessTheme.defaults()`.
   - File: `examples/invoice-reference/revisions/revision-001/generated-test.java:42-45`
     calls `BusinessTheme.defaults()` and `DocumentSession.create()`.
   - File: every fixture test, e.g.
     `examples/skill-fixtures/row-basic/.../RowBasicFixtureTest.java:29`
     calls `DocumentSession.create()`.
   - Evidence: real `DocumentSession` is a `final class` whose only
     public constructor takes a `Path defaultOutputFile, ...` (see
     `com/demcha/compose/document/api/DocumentSession.java:99`); there
     is no static `create()`. Real `BusinessTheme` is a `record` whose
     factory methods are `classic()`, `modern()`, `executive()`; there
     is no `defaults()`.
   - Why critical: the fixtures' "smoke test" assertion
     `assertDoesNotThrow(...)` would never compile, so the
     manifest-sanity CI job (which doesn't compile the fixtures) is
     hiding the failure.
   - Recommended fix: pick a known constructor or factory; if unsure,
     mark with `TODO(skill-validation)` and avoid asserting anything
     about runtime behavior.

4. Wrong `compose(...)` signature throughout.
   - File: `examples/invoice-reference/revisions/revision-001/generated-template.java:38`
     declares `void compose(DocumentSession document, InvoiceSpec spec)`
     and the test calls `template.compose(document, spec)`.
   - Evidence: real `DocumentSession.compose(Consumer<DocumentDsl> spec)`
     and real `DocumentTemplate<T>` cannot have this two-arg signature
     (see DocumentSession.java:161). The template is signed against a
     `DocumentTemplate<InvoiceSpec>` shape that does not exist.
   - Why critical: every example and fixture is built on a contract
     that disagrees with the real interface. The plan §5.6 explicitly
     pins this code shape, but the plan also requires that the shape
     match the documented library; here it does not.
   - Recommended fix: regenerate the example against the real
     `DocumentTemplate<T>` contract once §6.6 / skill validation
     confirms the actual signature, OR demote everything to clearly
     marked "illustrative pseudocode" comments until a fixture run
     pins the API.

5. Invented `BusinessTheme` accessors throughout the example template.
   - File: `examples/invoice-reference/revisions/revision-001/generated-template.java`
     calls 14 distinct theme methods that do not exist on the real
     record: `bodyText()`, `headingMedium()`, `titleLarge()`,
     `bodyRegular()`, `mutedText()`, `headingSmall()`, `amountLarge()`,
     `amountMedium()`, `monospaceRegular()`, `panelBackground()`,
     `accentPrimary()`, `tableHeaderBackground()`, `tableHeaderText()`,
     `zebraAlternate()` (lines 60-82, 91-108, 127-134, 154-161,
     165-181, 191-197).
   - Evidence: real `BusinessTheme` is a `record` exposing `palette()`,
     `spacing()`, `text()`, `table()`, `pageBackground()` (see
     `BusinessTheme.java:34-41` and ctor at :44-50). The template
     accesses tokens directly on the theme, not through the
     palette/text/table sub-objects.
   - Why critical: even a permissive compile would fail on the first
     theme call. The TODO comments inside the template explicitly
     defer the "exact builder name" to Phase 4 fixtures, but the
     committed code still names made-up methods at every call site.
   - Recommended fix: rewrite the template against the real palette/text/table
     accessors, or replace concrete calls with `// TODO(skill-validation)`
     stubs that compile by construction.

6. Method calls on `SectionBuilder` / `RowBuilder` / `TableBuilder`
   that have not been verified against the library.
   - File: `examples/invoice-reference/revisions/revision-001/generated-template.java`
     uses `section.background(...)`, `section.padding(...)`,
     `section.cornerRadius(...)`, `section.accentStrip(...)`,
     `section.text(...).style(...).uppercase(true)`,
     `section.text(...).color(...)`, `section.shape(name, lambda)`,
     `section.divider()`, `section.addRow(name, lambda)`,
     `row.addSection(name, lambda)`, `table.column(name, weight, Align)`,
     `table.headerBackground(...)`, `table.headerTextColor(...)`,
     `table.zebra(...)`, `table.repeatHeader(true)`, `table.row(lambda)`,
     `table.footer(lambda)`.
   - Why critical: none of these are sourced from a verified fixture
     or from the actual GraphCompose `dsl` package; they are inferred
     from the plan's prose. The template itself flags `cornerRadius`,
     `repeatHeader`, and the `shape(...)` API with `TODO(visual-review)`
     comments, which is honest, but the rest are still presented as
     real API.
   - Recommended fix: see Method-binding TODOs table below; flag every
     concrete call site with `TODO(skill-validation):` until a fixture
     pins it.

7. README / CONTRIBUTING / overview / limitations contradict the roadmap.
   - File: `README.md:124` claims "Phase 1 -- documentation MVP. Tools
     and examples are intentionally not yet implemented." But
     `tools/{revision-manager,visual-diff,preview-renderer}` all exist
     with passing tests, and `examples/invoice-reference/` is fully
     populated.
   - File: `README.md:104-107` says "A full manual revision cycle for
     an invoice reference is planned under `examples/invoice-reference/`...
     This example is planned for Phase 3 and is not yet present." It
     is present.
   - File: `CONTRIBUTING.md:12-18` says "The project is in Phase 1:
     documentation MVP only. There is no `tools/` directory yet. There
     are no implemented CLI commands. There is no skill pack content
     under `skills/versions/`." All three statements are now false.
     Lines 77-78 further enforce that new PRs must be docs-only.
   - File: `docs/overview.md:105-112` claims Phase 1. Lines 24-43
     leave the "What this is not" framing intact, which is fine.
   - File: `docs/limitations.md:22-30` says "In Phase 1 there is no
     CLI, no automated rendering, no automated diff." The CLI exists
     (`tools/revision-manager`), the renderer exists (skeleton-with-detection),
     the visual-diff exists (working).
   - File: `docs/roadmap.md:8-26` says all seven phases are shipped.
   - Why critical: these are the four most-read entry-points to the
     repo and they all lie about the current state. Anyone landing on
     the README or CONTRIBUTING will be told the tools don't exist
     and PRs against them are out of scope.
   - Recommended fix: rewrite the "Status" line and any "Phase 1"
     references in README, CONTRIBUTING, docs/overview.md, and
     docs/limitations.md to reflect the actual phase mapping in
     docs/roadmap.md.

## Major findings

1. CI `manifest-sanity` job does NOT verify skill metadata or content.
   - File: `.github/workflows/ci.yml:93-141`. The job only checks (a)
     every skill `file` field resolves on disk and (b) every
     `revision.json` / `template-project.json` parses as JSON.
   - Gap: it does not parse YAML frontmatter, does not check
     `verifiedAgainst`, does not check that `status` is one of the
     allowed values, does not check that any markdown link resolves,
     does not check that revision artifacts named in `revision.json`
     exist on disk, does not check that the fixtures compile, does
     not catch invented APIs.
   - Recommended fix: add a `repository-contract` job that (i) parses
     skill frontmatter, (ii) walks every revision artifact and verifies
     filesystem presence, (iii) shells out to a relative-link checker.

2. 56 broken intra-repo markdown links.
   - Mostly skill files using `../../docs/...` from
     `skills/versions/graphcompose-1.6/<file>.md`; the correct
     relative path is `../../../docs/...`. Examples:
     - `skills/versions/graphcompose-1.6/graphcompose-basics.md:80,94,106,116,118`
     - `skills/versions/graphcompose-1.6/tables.md:102,116,131`
     - `skills/versions/graphcompose-1.6/themes-and-colors.md:40,81,95,124`
     - `skills/versions/graphcompose-1.6/troubleshooting.md:55,75,85,89,107,198,206,208,210,212`
     - `skills/versions/graphcompose-1.6/visual-regression.md:38,54,60,106,161,197,199`
     - and 30+ more across the same folder
   - Plus the five fixture `expected-output/README.md` files each have
     one link `../../../docs/visual-accuracy-contract.md` that needs
     a fourth `..`.
   - Recommended fix: bulk-rewrite the relative paths, add a CI link
     checker.

3. `RevisionStatus` type omits `FAILED` and `REVERTED`.
   - File: `tools/revision-manager/src/types.ts:9`. The union is
     `'DRAFT' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED'`.
   - Plan §10.3 lists six statuses including `FAILED` and `REVERTED`.
   - There is no `fail` or `reverted` CLI verb. Failed compile/render
     cannot be captured as a status; `revertApproved` writes a `DRAFT`,
     not a marker `REVERTED`.
   - Recommended fix: extend the union, add a `fail <revisionId>`
     command (or accept "failed revisions are FAILED only when the
     orchestrator writes them"), and a `--marker` flag on
     revert-approved if a REVERTED marker is desired.

4. `examples/invoice-reference/reference/reference.png` is absent but
   referenced from `template-project.json`.
   - File: `examples/invoice-reference/template-project.json:3` lists
     `"referenceImage": "reference/reference.png"`.
   - File: `examples/invoice-reference/reference/` contains only
     `README.md` and `reference.md`.
   - This is honestly disclosed in `examples/invoice-reference/README.md`
     ("the reference image itself is not shipped") and in
     `reference/README.md`, but the project JSON still names a
     non-existent path. A `repository-contract` CI job would catch
     this.
   - Recommended fix: either commit a real reference.png or change
     the JSON to `"referenceDescription": "reference/reference.md"`
     and drop `referenceImage` until the image exists.

5. `approve` mutates the previously-approved revision's metadata.
   - File: `tools/revision-manager/src/commands/approve.ts:29-36`.
     When a second `approve` happens, the prior APPROVED revision's
     `revision.json` is rewritten with `status: SUPERSEDED`.
   - Confirmed by smoke test: artifact files are preserved (hash
     match), but `revision.json` flips status. The README and
     approve.ts comment both document this behavior.
   - Plan §10.3 defines `SUPERSEDED` as "Replaced by newer revision"
     which is a defensible reading, but the plan also says "Never
     overwrite the approved revision directly" (§5.9). The
     interpretation here is permissive (we treat status mutation as
     non-destructive). Document this in `docs/revision-model.md` so
     no future reader is surprised.

6. The committed `patch.diff` in revision-002 is decorative.
   - File: `examples/invoice-reference/revisions/revision-002/patch.diff`.
     `git apply --check` against the working tree returns 0, but the
     diff is a manually-authored revision-001 -> revision-002 diff
     stored inside revision-002. There is no tool that uses it (the
     revision-manager `diff` command is a fresh LCS unified diff,
     not this file). It is illustration only.
   - Recommended fix: add a one-paragraph note in
     `examples/invoice-reference/README.md` that `patch.diff` is the
     human-readable diff of the two committed templates and is not
     consumed by the CLI; or generate it from
     `revision-manager diff revision-001 revision-002` so it is
     reproducible.

7. `validation/known-limitations.md`, `validation/api-compatibility-checklist.md`,
   `validation/verified-examples.md` claim "Phase 4 baseline" honestly,
   but the parent README and CONTRIBUTING say Phase 1. The phase-state
   is inconsistent across the docs tree.

## Minor findings / suggestions

1. The "shared rules" block is duplicated verbatim between
   `AGENTS.md:60-76` and every prompt file under `prompts/` (10
   files). That is intentional per "each agent prompt must repeat the
   shared rules" but worth flagging: any change has 11 copies to
   touch.

2. `prompts/orchestrator-agent.md:36-49` re-prints the task-type
   detection table from `docs/workflow.md:52-65`. That is by design
   (prompts have to stand alone) but consider noting in the prompt
   that the canonical copy lives in workflow.md.

3. `docs/visual-review-loop.md:62-93` and
   `docs/visual-accuracy-contract.md:38-55` each define mismatch
   classification. visual-review-loop.md links to the contract for
   the canonical labels, which is the right structure -- minor only
   because a future contributor might be tempted to drift them.

4. The fixture POMs lack a `<repositories>` block; even with the
   correct groupId, Maven cannot fetch GraphCompose 1.6 from Central
   today. Document that.

5. `visual-diff` parityScore is rounded; with a 1-pixel mismatch on a
   1024-pixel image, percent=0.0977 produces parityScore=100 (the
   formula computes 99.61 and rounds up). The README's table
   ("1% diff -> 96") is right, but a footnote that "parityScore
   <0.4% mismatch all round to 100" would help readers.

6. `examples/invoice-reference/revisions/revision-001/generated-test.java:42`
   constructs `BusinessTheme.defaults()` -- if the orchestrator ever
   runs this it fails before the template is even instantiated. Mark
   with `TODO(skill-validation)`.

## Method-binding TODOs (suspected invented API)

Every concrete GraphCompose method name in the committed templates and
fixtures, with risk level. "HIGH" = method does not exist on the
matching real class (checked against
`C:/Users/Demch/OneDrive/Java/GraphCompose`). "MEDIUM" = method shape
plausible but unverified. All are sourced from
`examples/invoice-reference/revisions/revision-001/generated-template.java`
unless noted.

| Method | Location | Risk |
|---|---|---|
| `BusinessTheme.defaults()` | generated-test.java:42 | HIGH |
| `BusinessTheme#bodyText()` | template:60,71,99,108,170,193,196 | HIGH |
| `BusinessTheme#headingMedium()` | template:62,192 | HIGH |
| `BusinessTheme#mutedText()` | template:65,73,77,158,161,168,175,178,180,182,188 | HIGH |
| `BusinessTheme#bodyRegular()` | template:64,72,76,155,160,169,173,178,181,192,195 | HIGH |
| `BusinessTheme#titleLarge()` | template:70 | HIGH |
| `BusinessTheme#panelBackground()` | template:83 | HIGH |
| `BusinessTheme#accentPrimary()` | template:89 | HIGH |
| `BusinessTheme#headingSmall()` | template:94,103,167 | HIGH |
| `BusinessTheme#amountLarge()` | template:98 | HIGH |
| `BusinessTheme#amountMedium()` | template:107,195 | HIGH |
| `BusinessTheme#tableHeaderBackground()` | template:127 | HIGH |
| `BusinessTheme#tableHeaderText()` | template:128 | HIGH |
| `BusinessTheme#zebraAlternate()` | template:129 | HIGH |
| `BusinessTheme#monospaceRegular()` | template:157 | HIGH |
| `DocumentSession.create()` | generated-test.java:45, every fixture test | HIGH |
| `DocumentSession#pageFlow(Consumer<PageFlow>)` | template:41 | MEDIUM |
| `PageFlowBuilder#name(String)` | template:42 | MEDIUM |
| `PageFlowBuilder#spacing(int)` | template:43 | MEDIUM |
| `PageFlowBuilder#addRow(String, Consumer<RowBuilder>)` | template:44,46 | MEDIUM |
| `PageFlowBuilder#addSection(String, Consumer<SectionBuilder>)` | template:45,48 | MEDIUM |
| `PageFlowBuilder#addTable(String, Consumer<TableBuilder>)` | template:47 | MEDIUM |
| `RowBuilder#addSection(String, Consumer<SectionBuilder>)` | template:53,68,114 | MEDIUM |
| `SectionBuilder#shape(String, Consumer<?>)` | template:58 | MEDIUM (flagged TODO) |
| `SectionBuilder#text(String)` -> chain `.style(...).color(...).uppercase(boolean)` | template:61-65 etc | MEDIUM |
| `SectionBuilder#background(...)` | template:83 | MEDIUM |
| `SectionBuilder#padding(int)` | template:84 | MEDIUM |
| `SectionBuilder#cornerRadius(int)` | template:88 | MEDIUM (flagged TODO) |
| `SectionBuilder#accentStrip(...)` | template:89 | MEDIUM |
| `SectionBuilder#addRow(String, Consumer<RowBuilder>)` | template:91,190 | MEDIUM |
| `SectionBuilder#divider()` -> `.color(...)` | template:158,188 | MEDIUM |
| `TableBuilder#column(String, float, TableBuilder.Align)` | template:122-125 | MEDIUM |
| `TableBuilder#headerBackground(...)` | template:127 | MEDIUM |
| `TableBuilder#headerTextColor(...)` | template:128 | MEDIUM |
| `TableBuilder#zebra(...)` | template:129 | MEDIUM |
| `TableBuilder#repeatHeader(boolean)` | template:134 | MEDIUM (flagged TODO) |
| `TableBuilder#row(Consumer<?>)` -> `.cell(...)` | template:137-141 | MEDIUM |
| `TableBuilder#footer(Consumer<?>)` | template:146-150 (rev-001) | MEDIUM |
| `TableBuilder.Align` enum | template:122-125 | MEDIUM |

All "HIGH" entries should be removed from `examples/` and
`skill-fixtures/` unless a verified fixture (Phase 6) confirms them
or the docs are explicitly demoted to pseudocode.

## Broken links

56 internal markdown links do not resolve. Full list captured during
the audit by walking every `[text](path)` reference. Highlights:

- `skills/versions/graphcompose-1.6/backgrounds-and-panels.md:161,175`
  -> `../../docs/visual-accuracy-contract.md` (correct is `../../../docs/...`)
- `skills/versions/graphcompose-1.6/graphcompose-basics.md:80,94,106,116,118`
  (5 broken)
- `skills/versions/graphcompose-1.6/layer-stacks-and-overlays.md:175,190`
  (2 broken)
- `skills/versions/graphcompose-1.6/layout-primitives.md:143`
- `skills/versions/graphcompose-1.6/pagination.md:88,198`
- `skills/versions/graphcompose-1.6/revision-discipline.md:38,57,92,100,149,188,190,192`
  (8 broken)
- `skills/versions/graphcompose-1.6/shapes-and-containers.md:149`
- `skills/versions/graphcompose-1.6/spacing-and-alignment.md:119,144`
- `skills/versions/graphcompose-1.6/tables.md:102,116,131`
- `skills/versions/graphcompose-1.6/themes-and-colors.md:40,81,95,124`
- `skills/versions/graphcompose-1.6/troubleshooting.md:55,75,85,89,107,198,206,208,210,212`
  (10 broken)
- `skills/versions/graphcompose-1.6/typography.md:96,130`
- `skills/versions/graphcompose-1.6/visual-regression.md:38,54,60,106,161,197,199`
  (7 broken)
- `skills/versions/graphcompose-1.6/visual-to-graphcompose-mapping.md:91,111`
- `examples/skill-fixtures/{layer-stack-badge,row-basic,section-basic,shape-container-card,table-basic}/expected-output/README.md:27`
  (5 broken; path needs an extra `..`)

## Overclaims

1. README.md:124
   - Quote: "Phase 1 -- documentation MVP. Tools and examples are
     intentionally not yet implemented."
   - Reality: Phases 1-7 are shipped per roadmap; three tools and a
     two-revision example exist.
   - Proposed rewrite: "Phases 1-7 are shipped. The render path in
     `tools/preview-renderer` is a skeleton that waits on
     GraphCompose 1.6 reaching a reachable Maven repository; until
     then revision binaries (`output.pdf`, `output.png`) are listed
     under `pendingArtifacts` in each revision and the skill manifest
     stays at `status: needs-validation`."

2. README.md:104-107
   - Quote: "This example is planned for Phase 3 and is not yet
     present."
   - Reality: `examples/invoice-reference/` is committed with two
     revisions and all text artifacts. README itself contradicts the
     "not yet" claim by referring to the path.
   - Proposed rewrite: "A documentation-grade manual revision cycle
     for an invoice reference lives under
     `examples/invoice-reference/`. Binary render artifacts
     (`output.pdf`, `output.png`) are deferred to the Phase 6
     renderer."

3. CONTRIBUTING.md:12-18
   - Quote: "The project is in Phase 1: documentation MVP only. There
     is no `tools/` directory yet. There are no implemented CLI
     commands. There is no skill pack content under `skills/versions/`."
   - Reality: `tools/` has three working modules; the CLI ships;
     `skills/versions/graphcompose-1.6/` ships 14 skills.
   - Proposed rewrite: drop the "Phase 1 only" block; replace with a
     table of "what is shipped" and "what is open for contribution"
     by phase. Update the PR checklist not to require docs-only.

4. CONTRIBUTING.md:77-78
   - Quote: "The change targets Phase 1 scope (docs only) or an
     explicitly open later phase."
   - Reality: docs/roadmap.md says all phases are shipped, so this
     gate has no meaning today.
   - Proposed rewrite: replace with "Changes must respect the
     ownership boundaries in `docs/agents.md` and the skill drift
     rule in `docs/skill-validation.md`."

5. docs/overview.md:105-112
   - Quote: "Phase 1 -- Documentation MVP. The first version focuses
     on documentation, skills contracts, prompts, and one manual
     example. Tooling (CLI, automated rendering, automated diff) is
     planned for Phase 5 and later and is documented but not shipped."
   - Reality: all three tools ship.
   - Proposed rewrite: link to `roadmap.md` and state the per-tool
     status (CLI: shipped; renderer: skeleton; visual-diff: shipped).

6. docs/limitations.md:22-30
   - Quote: "In Phase 1 there is no CLI, no automated rendering, no
     automated diff."
   - Reality: CLI ships; renderer skeleton ships; visual-diff ships.
   - Proposed rewrite: "The render command in `tools/preview-renderer`
     is a skeleton-with-detection: it cannot produce a PDF until
     GraphCompose 1.6 is on the classpath. Until that lands, the
     end-to-end render-compare loop is exercised manually."

7. tools/revision-manager/README.md:44
   - Quote: "Pair `graphcompose-flow` with the Phase 6 preview-renderer
     (planned) to produce the rendered artifacts after each revision
     change."
   - Reality: the preview-renderer is shipped, the `render`
     subcommand is a skeleton. Rewrite "planned" to "shipped (render
     subcommand is a skeleton that waits on GraphCompose on the
     classpath)".

## Missing tests

1. No contract test that every revision artifact named in
   `revision.json` exists on disk. Today `revision-001/revision.json`
   names `output.pdf` and `output.png`; both are absent. A `tests/`
   walker (or a CI job) should fail the build when an artifact key
   exists but the file is missing AND the file is not listed under
   `pendingArtifacts`. This is the canonical "is this revision
   honest" check.

2. No contract test that every `file` entry in `skill-manifest.json`
   has the matching YAML frontmatter (`skillId`, `targetVersion`,
   `status`, `verifiedAgainst`). CI checks only that the file exists.

3. No link-check job. The 56 broken intra-repo links above would have
   been caught by a 30-line `markdown-link-check` invocation.

4. No fixture-compile job. The five skill fixtures and the example
   `generated-template.java` are never compiled in CI, so the
   invented imports (Critical 1) never trip a build. Even without
   GraphCompose on Maven Central, a `mvn -B -Dmaven.test.skip=true compile`
   with a local `system` dependency or a `mvn dependency:resolve`
   stub would surface the wrong groupId.

5. No `patch.diff` regenerate-and-compare test. Today the patch is
   hand-authored; a CI step that re-runs
   `revision-manager diff revision-001 revision-002`
   and diff-checks against the committed file would prevent silent
   drift.

6. No CLI verb for `FAILED` revisions, so there is no contract test
   for "after the orchestrator marks a revision FAILED its artifacts
   are preserved". The plan §10.4 specifies this; the implementation
   omits it entirely.

7. No test that `restoreComponent` refuses with a helpful message
   when the source revision lacks a `generated-template.java`. The
   command silently no-ops via `copyRevisionFile` returning false; a
   unit test should pin the warning shape.

8. No CI job that runs the revision-manager full smoke sequence the
   audit ran (init, new, approve, new, approve, new, undo, status,
   history) and asserts the project-state invariants the owner
   listed.

## Decorative / disconnected files

1. `examples/invoice-reference/revisions/revision-002/patch.diff` --
   not consumed by anything; the revision-manager `diff` verb
   recomputes a diff from scratch. See Major #6.

2. `tools/preview-renderer/dependency-reduced-pom.xml` -- normally
   build output (the .gitignore line 9 even excludes it project-wide).
   Currently untracked, so this is a near-miss rather than a defect.

3. `skills/versions/graphcompose-1.6/troubleshooting.md` has 10
   broken links. Skill is referenced by `skill-manifest.json` so it
   is not strictly orphaned, but no other doc cross-references it and
   the broken links suggest it was not reviewed against the docs
   tree. Mostly decorative as-is.

4. `validation/api-compatibility-checklist.md`,
   `validation/verified-examples.md`,
   `validation/known-limitations.md`,
   `validation/skill-validation.md`,
   `validation/skill-fix-template.md`,
   `validation/validation-report-template.md`,
   `validation/reports/phase-4-baseline.md` -- all internally
   consistent and honest about phase status, but they are not linked
   from any tool or from CI. They are documentation-shaped scaffolds
   waiting on Phase 6/7 to use them. Honest but currently inert.

5. `prompts/master-prompt.md` -- duplicates §15 of the project plan
   verbatim, by design (it is the prompt the project boots from).
   Not decorative, but worth noting that it is a copy of the
   external plan and is not exercised by any tool.

6. `examples/invoice-reference/revisions/revision-001/orchestration-decision.md`
   and friends (8 markdown artifacts per revision) read like real
   agent output but are obviously hand-written. They are useful as
   documentation, not as execution proof; the README disclaims this
   honestly.

## §20 Acceptance criteria walk

| Criterion | Status | Evidence |
|---|---|---|
| README explains the project in under 2 minutes. | PASS-WITH-CAVEAT | README.md is concise and well-structured, but its "Status" and "Example" sections are stale (Critical #7). |
| Visual accuracy contract is documented. | PASS | `docs/visual-accuracy-contract.md`. |
| Workflow is clear. | PASS | `docs/workflow.md` is complete. |
| Agent roles are documented. | PASS | `docs/agents.md`, `AGENTS.md`, `prompts/*.md`. |
| Prompt pack exists. | PASS | 10 prompt files under `prompts/`. |
| Versioned skills exist. | PASS | 14 skills under `skills/versions/graphcompose-1.6/` with YAML frontmatter. |
| Skill manifest exists. | PASS | `skills/skill-manifest.json` (14 entries; all `needs-validation`). |
| Skill validation process exists. | PASS-WITH-CAVEAT | Process is documented in `docs/skill-validation.md` and `validation/`. Process has never executed and the manifest is honest about it. |
| Revision model exists. | PASS-WITH-CAVEAT | `docs/revision-model.md` is complete; the implementation in `tools/revision-manager` omits `FAILED` and `REVERTED` statuses (Major #3). |
| Rollback model exists. | PASS | `docs/rollback.md`; undo/revert-approved/restore-component implemented and tested. |
| Example folder structure exists. | PASS-WITH-CAVEAT | `examples/invoice-reference/` exists with all text artifacts. Binary artifacts absent (acknowledged). Reference image absent. Java imports invented (Critical #1). |
| Limitations are honest. | PASS-WITH-CAVEAT | `docs/limitations.md` is generally honest; lines 22-30 lie about CLI status (Overclaim #6). |
| Main GraphCompose repo can link to it. | PASS | Nothing prevents linking; the repo is internally inconsistent but the README, AGENTS.md, and docs site are link-target ready. |

## §21/§22/§23 quality-rule walk

### §21 Quality Rules for Generated Templates

| Rule | Status | Evidence |
|---|---|---|
| No PDFBox imports. | PASS | template imports only `com.demcha.graphcompose.*` (and `java.util.Objects`). |
| Uses GraphCompose DSL. | FAIL | Uses a DSL-shaped surface that does not exist on the real library; the imports point at a fictional package (Critical #1). |
| Uses correct GraphCompose version. | DOC-ONLY | Architecture plan names 1.6.0; nothing exercises that. |
| Uses selected versioned skills. | PASS | template references skills by id in its javadoc. |
| Has small private render methods. | PASS | `renderHeader`, `renderHero`, `renderParties`, `renderLineItems`, `renderFooter`, `renderContactBlock`, `renderSummaryRow`. |
| Uses theme tokens. | PASS-WITH-CAVEAT | Tokens are named and routed through theme accessors; the accessors themselves are invented (Critical #5). |
| Has clear component names. | PASS | yes. |
| Has test file. | PASS | `generated-test.java` present in both revisions. |
| Has rendered PDF artifact. | FAIL (acknowledged) | absent by design; tracked as `pendingArtifacts`. |
| Has preview PNG artifact. | FAIL (acknowledged) | absent by design; tracked as `pendingArtifacts`. |
| Has layout snapshot artifact. | PASS-WITH-CAVEAT | `layout-snapshot.json` present and self-described as illustrative. |
| Has visual-review.md. | PASS-WITH-CAVEAT | present; explicitly described as expected-outcome. |
| Belongs to a revision. | PASS. |
| Documents visual mismatches. | PASS | visual-review.md classifies anticipated mismatches per the contract. |

### §22 Quality Rules for Revisions

| Rule | Status | Evidence |
|---|---|---|
| revision.json exists. | PASS | both revisions. |
| parentRevisionId exists. | PASS | rev-001 = null (initial); rev-002 = "revision-001". |
| status is valid. | PASS | both DRAFT. |
| user-request.md exists. | PASS. |
| targetGraphComposeVersion is recorded. | PASS | "1.6.0". |
| selected skill pack is recorded. | PASS | "skills/versions/graphcompose-1.6". |
| changedComponents are recorded. | PASS. |
| generated-template.java exists or failure is documented. | PASS-WITH-CAVEAT | present in both, but invented imports. |
| output artifact exists or failure is documented. | PASS | absent and tracked under pendingArtifacts. |
| visual-review.md or test-result.md exists. | PASS | both present in each revision. |
| failed revisions are preserved. | DOC-ONLY | Policy exists; CLI has no `fail` verb (Major #3). |

### §23 Quality Rules for Skills

| Rule | Status | Evidence |
|---|---|---|
| Skill has metadata. | PASS | every file under `skills/versions/graphcompose-1.6/` has the YAML block. |
| Skill targets a specific GraphCompose version. | PASS. |
| Skill does not describe imaginary API. | PASS | skill prose stays at the primitive level; it does not name concrete methods. |
| Skill examples compile or are marked conceptual. | PASS-WITH-CAVEAT | skill files do not embed Java examples; the example template under `examples/invoice-reference/` does, and those don't compile (Critical #1-#6). |
| Skill examples render where applicable. | DOC-ONLY | renderer pending Phase 6. |
| Skill documents limitations. | PASS. |
| Skill is listed in skill-manifest.json. | PASS | 14/14. |
| Skill status is valid. | PASS | all 14 marked `needs-validation`. |
| Skill drift is reported when found. | DOC-ONLY | template and process exist; no drift has actually been filed. |

## Recommended cleanup commits

Ordered. Each is a single coherent change.

1. `docs: align README/CONTRIBUTING/overview/limitations with shipped phases`
   - Rewrite the "Status" section in README, the "Current phase"
     section in CONTRIBUTING, the "Phase status" tail in
     docs/overview.md, and the "Not a tool, yet" section in
     docs/limitations.md to reflect docs/roadmap.md.
   - Drop the docs-only PR gate in CONTRIBUTING.md.

2. `docs: fix relative paths from skill files to docs/`
   - Bulk-rewrite `../../docs/` -> `../../../docs/` across
     `skills/versions/graphcompose-1.6/*.md`.
   - Bulk-rewrite `../../../docs/` -> `../../../../docs/` across
     `examples/skill-fixtures/*/expected-output/README.md`.

3. `ci: add repository-contract job`
   - New CI job that (a) walks every skill in the manifest and
     verifies the YAML frontmatter fields, (b) walks every revision
     under `examples/` and verifies that each named artifact either
     exists on disk or is listed in `pendingArtifacts`, (c) runs a
     markdown-link checker against all `*.md` files.

4. `examples: mark generated-template.java and generated-test.java as illustrative`
   - Either rewrite the imports to the real `com.demcha.compose.document.*`
     packages and the real `BusinessTheme` accessors, OR add a one-line
     header to each file: `// ILLUSTRATIVE: this file does not compile
     against GraphCompose 1.6. Phase 6 fixture run will replace it.`
     Same treatment for every `examples/skill-fixtures/*/src/test/java/...FixtureTest.java`.

5. `tools/revision-manager: add FAILED status and a fail verb`
   - Extend `RevisionStatus` in `src/types.ts` to include `'FAILED'`
     and `'REVERTED'`.
   - Add `graphcompose-flow fail <revisionId>` which sets status to
     FAILED, never deletes artifacts, and refuses to fail APPROVED
     revisions.
   - Document in the CLI README and in `docs/revision-model.md`.

6. `tools/preview-renderer: fix the canary FQCN`
   - Change `DOCUMENT_SESSION_FQCN` in `RenderCommand.java:41` to
     `com.demcha.compose.document.api.DocumentSession`. Update the
     README example classpath to match.
   - Update the test in `RenderCommandTest` if it pins the FQCN.

7. `examples/invoice-reference: regenerate patch.diff or document its source`
   - Either delete `patch.diff` and regenerate it on every run via
     the revision-manager `diff` verb, or add a paragraph in
     `examples/invoice-reference/README.md` explaining that
     `patch.diff` is the hand-authored diff between the two committed
     templates and is illustrative.

8. `examples/invoice-reference: align template-project.json with reality`
   - Drop the `referenceImage` key (since reference.png is absent)
     and keep `referenceDescription`; OR commit a real reference.png.

9. `validation: add a sanity test that fixtures use the real groupId once published`
   - When GraphCompose 1.6 is on a reachable repo, flip the fixture
     POMs from `com.demcha` to `io.github.demchaav` and remove the
     "method-binding TODOs" from the templates by running the
     fixtures.
