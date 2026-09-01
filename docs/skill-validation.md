# Skill Validation

Skills must be tested against real library behavior. This page
documents the validation discipline. Phase 4 has shipped the
[`validation/`](../validation/) folder (templates, checklists, the
baseline report) and the
[`examples/skill-fixtures/`](../examples/skill-fixtures/) projects.
The fixture projects now compile and run against GraphCompose 1.9.0
from Maven Central (`io.github.demchaav:graph-compose:1.9.0`; older
pre-1.6.7 pins remain resolvable via JitPack as
`com.github.DemchaAV:GraphCompose:vX.Y.Z`). The remaining validation
work is the full render + preview + visual-diff loop that promotes
skills out of `needs-validation`. See [roadmap.md](roadmap.md) for the phase
ordering.

## Skill validation rule

A skill is valid only if:

- it targets a specific GraphCompose version
- its code examples compile
- its examples render successfully where applicable
- it does not reference removed APIs
- it does not recommend deprecated patterns
- it has at least one verified fixture when possible
- it documents known limitations

The `scripts/validate-skills.mjs` owns this check. See
[`skills/workflows/`](../skills/workflows/README.md)
for inputs, outputs, and the core rule that the library — not the
skill — is the source of truth.

## Recommended validation structure

```text
validation/
  README.md
  skill-validation.md
  api-compatibility-checklist.md
  known-limitations.md
  verified-examples.md
  skill-fix-template.md
  validation-report-template.md
```

## Fixture examples

Each fixture is a small standalone GraphCompose project that exercises
one skill end-to-end.

```text
examples/
  skill-fixtures/
    row-basic/
    section-basic/
    table-basic/
    table-repeated-header/
    invoice-layout/
    layer-stack-badge/
    shape-container-card/
    pagination-basic/
```

Each fixture should have:

```text
README.md
pom.xml
src/test/java/...
expected-output/
  output.pdf
  output.png
  layout-snapshot.json
```

The fixture's expected output is what skill validation compares
against when it re-renders the example with the current GraphCompose
release.

## Skill drift rule

```text
If GraphCompose behavior differs from the skill documentation, the library is treated as the source of truth.

The skill must be updated.

The agent must not silently work around incorrect skills.
```

When drift is detected the `scripts/validate-skills.mjs` files a skill fix
report rather than patching the template to dodge the broken skill.

## Skill fix report template

File:

```text
validation/skill-fix-template.md
```

Template:

```markdown
# Skill Fix Report

## Affected skill

`skills/versions/graphcompose-1.6/tables.md`

## GraphCompose version

`1.6.0`

## Problem

The skill says that table headers repeat automatically, but the current API requires explicit configuration.

## Expected according to skill

```java
table.enableRepeatedHeader();
```

## Actual library behavior

The method is not available / behavior is different.

## Failing example

`examples/skill-fixtures/table-basic`

## Required skill update

Document the correct API and update the example.

## Status

FAILED / NEEDS UPDATE / FIXED
```

## Phase status

Phase 4 has shipped:

- [`validation/README.md`](../validation/README.md),
  [`validation/skill-validation.md`](../validation/skill-validation.md),
  [`validation/api-compatibility-checklist.md`](../validation/api-compatibility-checklist.md),
  [`validation/known-limitations.md`](../validation/known-limitations.md),
  [`validation/verified-examples.md`](../validation/verified-examples.md),
  [`validation/skill-fix-template.md`](../validation/skill-fix-template.md),
  [`validation/validation-report-template.md`](../validation/validation-report-template.md)
- [`validation/reports/phase-4-baseline.md`](../validation/reports/phase-4-baseline.md) —
  the historical baseline report from before fixture execution.
- [`validation/reports/fixture-smoke-2026-05-18.md`](../validation/reports/fixture-smoke-2026-05-18.md) —
  the first compile/run smoke report against GraphCompose 1.6.0 via
  JitPack (historical; the fixtures now resolve 1.9.0 from Maven Central).
- Five fixture projects under
  [`examples/skill-fixtures/`](../examples/skill-fixtures/):
  `row-basic`, `section-basic`, `table-basic`, `layer-stack-badge`,
  `shape-container-card`. The plan also lists `table-repeated-header`,
  `invoice-layout`, and `pagination-basic` as future fixtures; those
  are not part of the Phase 4 scope.

The fixture smoke proves the covered DSL calls compile and run against
the real 1.9.0 artifact. As of 2026-06-03 the render + visual-diff loop
is built too: `scripts/validate-skills.mjs` renders each fixture
through `tools/preview-renderer` (a no-arg `*FixtureDocument` adapter
per fixture) and compares the PNG against a committed
`expected-output/output.png` baseline via `tools/visual-diff`. All five
fixtures render and re-render `IDENTICAL` vs baseline locally — see
[`validation/reports/skill-render-validation-2026-06-03.md`](../validation/reports/skill-render-validation-2026-06-03.md).
CI runs the loop in `--render-only` mode because PNG baselines are
platform-specific (font rasterisation differs across OS/JDK).

Every skill in [`skill-manifest.json`](../skills/skill-manifest.json)
still reads `status: needs-validation`. Flipping the six
fixture-covered skills to `active` is a deliberate follow-up pending an
author review of the remaining criteria (no deprecated patterns;
documented limitations). See
[versioned-skills.md](versioned-skills.md) for the manifest, statuses,
and the no-invented-API rule that validation enforces.
