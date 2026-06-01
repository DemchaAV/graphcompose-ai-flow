# Fixture Smoke Report

Date: 2026-06-01 (v1.6.7 re-pass)

Scope: re-smoke for the five committed skill fixtures against
GraphCompose **1.6.7** resolved from Maven Central (transitive
dependency cleanup release; no breaking API changes).

## GraphCompose Coordinate

```text
io.github.demchaav:graph-compose:1.6.7
```

This re-smoke confirms the `japicmp` `semver PATCH` classification
v1.6.7 advertises against the v1.6.6 baseline: the public API
surface is unchanged, all fixtures compile and run without any
edit beyond the property bump.

## What v1.6.7 changes

Per the upstream
[CHANGELOG](https://github.com/DemchaAV/GraphCompose/blob/main/CHANGELOG.md#v167--2026-06-01):

- **Transitive classpath narrowed.** Kotlin stdlib dropped (the codebase
  is Java-first), `flexmark-all` replaced with the three modules
  `MarkDownParser` actually references, `jackson-dataformat-yaml`
  marked `<optional>true</optional>` (only consumers that load YAML
  configs through `ConfigLoader` need to pull it in),
  `jackson-module-jsonSchema` + the explicit `snakeyaml` declaration
  dropped, `jcl-over-slf4j` added explicitly so PDFBox's
  `commons-logging` keeps routing through SLF4J after the flexmark
  narrowing.
- **Layout-cache staleness fix.** `DocumentSession.registry().register(...)`
  now returns a session-owned `NodeRegistry` wrapper that invalidates
  the layout cache on every mutation, matching the semantics of
  `DocumentSession.registerNodeDefinition(...)`. The two paths are
  now cache-equivalent (and become fully interchangeable in v1.6.8).

None of these changes are observable in the five fixtures, which
only exercise the canonical DSL surface (`RowBuilder`,
`SectionBuilder`, `TableBuilder`, `LayerStackBuilder`,
`ShapeContainerBuilder`).

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
successfully against `io.github.demchaav:graph-compose:1.6.7`.

```text
=== examples/skill-fixtures/row-basic ===
Tests run: 1, Failures: 0, Errors: 0, Skipped: 0 — BUILD SUCCESS (0.265 s)
=== examples/skill-fixtures/section-basic ===
Tests run: 1, Failures: 0, Errors: 0, Skipped: 0 — BUILD SUCCESS (0.197 s)
=== examples/skill-fixtures/table-basic ===
Tests run: 1, Failures: 0, Errors: 0, Skipped: 0 — BUILD SUCCESS (0.195 s)
=== examples/skill-fixtures/layer-stack-badge ===
Tests run: 1, Failures: 0, Errors: 0, Skipped: 0 — BUILD SUCCESS (0.176 s)
=== examples/skill-fixtures/shape-container-card ===
Tests run: 1, Failures: 0, Errors: 0, Skipped: 0 — BUILD SUCCESS (0.211 s)
```

## Skill Coverage

| Fixture | Skills covered | 1.6.0 smoke | 1.6.6 re-smoke | 1.6.7 re-smoke |
|---|---|---|---|---|
| `row-basic` | `layout-primitives` | pass | pass | **pass** |
| `section-basic` | `layout-primitives`, `backgrounds-and-panels` | pass | pass | **pass** |
| `table-basic` | `tables`, `themes-and-colors` | pass | pass | **pass** |
| `layer-stack-badge` | `layer-stacks-and-overlays` | pass | pass | **pass** |
| `shape-container-card` | `shapes-and-containers` | pass | pass | **pass** |

## What this re-smoke proves

- The 1.6.6 → 1.6.7 jump is zero-defect for the covered API surface
  (six fixture-backed skills; eight remaining skills still rely on
  the auto-populated `partial: true` verdict per
  `scripts/lib/skill-validation-gate.mjs`).
- The skill-validation cache key shifts on the coordinate change
  (`io.github.demchaav:graph-compose:1.6.6` →
  `io.github.demchaav:graph-compose:1.6.7`) so every project's next
  render writes a fresh `skill-validation-report.md` keyed to the
  new coordinate without manual intervention — the cache design from
  Perf #2 + Wire #1 holds.

## What this re-smoke does not prove

- Visual parity (the same constraint v1.6.0 → v1.6.6 smoke
  acknowledged). The visual-diff baseline loop still has to land
  before any skill can leave `needs-validation` status.
- The eight uncovered skills' behaviour against the v1.6.7
  classpath narrowing. None of them depend on `flexmark-all`, the
  YAML / JSON-schema modules, or `commons-logging`, so the risk is
  low, but it is not zero until a fixture exercises each one.

## Follow-up

- The `verifiedAgainst: 1.6.7` frontmatter on every skill is now
  honest for the six fixture-backed skills and aspirational for the
  other eight (same shape as the 2026-06-01 v1.6.6 re-smoke).
- A future v1.6.8 will repeat this drill once
  [`MarkdownInline.append(...)`](https://github.com/DemchaAV/GraphCompose/blob/develop/CHANGELOG.md#v168--planned)
  ships its link-syntax extension. That is a real API addition and
  may surface a new fixture requirement for the inline-markdown skill.
