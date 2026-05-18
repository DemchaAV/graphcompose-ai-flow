# Fixture Smoke Report

Date: 2026-05-18

Scope: compile/run smoke for the five committed skill fixtures
against GraphCompose 1.6.0 resolved from JitPack.

## GraphCompose Coordinate

```text
com.github.DemchaAV:GraphCompose:v1.6.0
```

## Commands

Run from each fixture directory:

```text
mvn test
```

Fixtures checked:

- `examples/skill-fixtures/row-basic`
- `examples/skill-fixtures/section-basic`
- `examples/skill-fixtures/table-basic`
- `examples/skill-fixtures/layer-stack-badge`
- `examples/skill-fixtures/shape-container-card`

## Result

All five fixture projects compiled and ran their JUnit test class
successfully. This confirms that the covered API calls resolve
against the real GraphCompose 1.6.0 artifact.

## Skill Coverage

| Fixture | Skills covered | Smoke result |
|---|---|---|
| `row-basic` | `layout-primitives` | pass |
| `section-basic` | `layout-primitives`, `backgrounds-and-panels` | pass |
| `table-basic` | `tables`, `themes-and-colors` | pass |
| `layer-stack-badge` | `layer-stacks-and-overlays` | pass |
| `shape-container-card` | `shapes-and-containers` | pass |

## What This Does Not Prove

This is not full visual validation. The smoke run does not refresh
committed `output.pdf`, generate `output.png`, compare visual diffs,
or approve fixture baselines against the visual accuracy contract.

Because of that, the skill manifest remains conservative:
`status: needs-validation` stays in place until the full render +
preview + visual-diff loop passes.

## Follow-Up

- Wire `tools/preview-renderer render` to instantiate templates and
  write `output.pdf`.
- Generate `output.png` through the existing `preview` command.
- Run `tools/visual-diff` against fixture baselines.
- Promote covered skills only after the full report has no critical
  or major mismatches.
