# Fixture Smoke Report

Date: 2026-06-01

Scope: compile/run smoke for the five committed skill fixtures
against GraphCompose 1.6.6 resolved from **Maven Central** (re-smoke
after the v1.6.0 → v1.6.6 + JitPack → Central coordinate flip).

## GraphCompose Coordinate

```text
io.github.demchaav:graph-compose:1.6.6
```

Resolves through the default Maven Central repository — no
`<repositories>` block is required in the fixture POMs. The legacy
`com.github.DemchaAV:GraphCompose:vX.Y.Z` coordinate via JitPack
remains the fallback for pre-1.6.6 pins; this smoke does NOT exercise
the fallback.

## Commands

Run from each fixture directory:

```text
mvn -B test
```

Fixtures checked:

- `examples/skill-fixtures/row-basic`
- `examples/skill-fixtures/section-basic`
- `examples/skill-fixtures/table-basic`
- `examples/skill-fixtures/layer-stack-badge`
- `examples/skill-fixtures/shape-container-card`

## Result

All five fixture projects compiled and ran their JUnit test class
successfully against `io.github.demchaav:graph-compose:1.6.6`.

```text
=== examples/skill-fixtures/row-basic ===
Tests run: 1, Failures: 0, Errors: 0, Skipped: 0 — BUILD SUCCESS
=== examples/skill-fixtures/section-basic ===
Tests run: 1, Failures: 0, Errors: 0, Skipped: 0 — BUILD SUCCESS
=== examples/skill-fixtures/table-basic ===
Tests run: 1, Failures: 0, Errors: 0, Skipped: 0 — BUILD SUCCESS
=== examples/skill-fixtures/layer-stack-badge ===
Tests run: 1, Failures: 0, Errors: 0, Skipped: 0 — BUILD SUCCESS
=== examples/skill-fixtures/shape-container-card ===
Tests run: 1, Failures: 0, Errors: 0, Skipped: 0 — BUILD SUCCESS
```

This confirms that:

1. The Maven Central artifact `io.github.demchaav:graph-compose:1.6.6`
   resolves cleanly without any `<repositories>` block.
2. The covered public API surface on which the five fixtures depend
   (row/column weights, sections, tables, layer stacks, shape
   containers) is binary-compatible with v1.6.0 — the `japicmp` gate
   GraphCompose 1.6.6 advertises is observed in practice for this
   subset.
3. No drift has been introduced in the fixture JUnit assertions by
   the version bump.

## Skill Coverage

| Fixture | Skills covered | 1.6.0 smoke | 1.6.6 re-smoke |
|---|---|---|---|
| `row-basic` | `layout-primitives` | pass | **pass** |
| `section-basic` | `layout-primitives`, `backgrounds-and-panels` | pass | **pass** |
| `table-basic` | `tables`, `themes-and-colors` | pass | **pass** |
| `layer-stack-badge` | `layer-stacks-and-overlays` | pass | **pass** |
| `shape-container-card` | `shapes-and-containers` | pass | **pass** |

## What This Re-smoke Does Prove (and what it does not)

**Proves:**
- the `verifiedAgainst: 1.6.6` claim in every skill frontmatter and in
  `skills/skill-manifest.json` (notes block) is no longer aspirational
  — it is backed by a passing compile + test run against the actual
  Maven Central artifact.
- the migration from `com.github.DemchaAV:GraphCompose:v1.6.0`
  (JitPack) to `io.github.demchaav:graph-compose:1.6.6` (Central) was
  zero-defect for the covered API surface.
- skills `layout-primitives`, `backgrounds-and-panels`, `tables`,
  `themes-and-colors`, `layer-stacks-and-overlays`,
  `shapes-and-containers` (six of fourteen) have their direct API
  contract reconfirmed.

**Does NOT prove:**
- visual parity. The smoke does NOT regenerate
  `examples/skill-fixtures/*/output.pdf`, does NOT rasterise to PNG,
  does NOT diff against committed baselines.
- coverage for the eight skills with no fixture
  (`graphcompose-basics`, `visual-to-graphcompose-mapping`,
  `typography`, `spacing-and-alignment`, `pagination`,
  `visual-regression`, `revision-discipline`, `troubleshooting`).
- end-to-end agent-driven generation. The smoke validates the
  library bindings the skills name; it does not validate that the
  agents using those skills produce correct templates.

Because of (1) above, skills NOT covered by a fixture remain at
`status: needs-validation` even after this re-smoke. Fixture-covered
skills also remain `needs-validation` until the visual-diff baseline
loop closes (see Follow-Up).

## What changed since 2026-05-18

- Coordinate: JitPack → Maven Central. No `<repositories>` block
  needed in fixture POMs.
- Version property added to each fixture POM
  (`graphcompose.version=1.6.6`) so the next bump is a one-liner.
- Stale "(not Maven Central as of May 2026)" comment in
  `row-basic/pom.xml` replaced with the JitPack-as-fallback note now
  copied into all five POMs.

## Follow-Up (unchanged from 2026-05-18 baseline)

- Compile fixture templates into a classpath that
  `tools/preview-renderer render` can load.
- Provide sample spec providers for data-driven templates.
- Generate `output.pdf` and `output.png` through the shared render
  command.
- Run `tools/visual-diff` against fixture baselines.
- Promote covered skills only after the full report has no critical
  or major mismatches.

New items raised by this re-smoke:

- Author fixtures for the eight skills currently uncovered, in the
  priority order documented in `docs/skill-validation.md`:
  `pagination-basic`, `table-repeated-header`, `invoice-layout` are
  already on the wishlist; add a minimal `typography-basic`,
  `spacing-basic`, and a `visual-regression` driver fixture once the
  visual-diff baseline loop closes.
- Close the four open method-binding TODOs in
  [`validation/api-compatibility-checklist.md`](../api-compatibility-checklist.md)
  by cross-checking against the published Javadoc at
  [javadoc.io/doc/io.github.demchaav/graph-compose/1.6.6](https://javadoc.io/doc/io.github.demchaav/graph-compose/1.6.6).
