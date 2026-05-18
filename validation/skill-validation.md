# Skill Validation

This is the operational guide. It records the rule, the folder
layout, the fixture layout, the drift handling, and the steps a
validation run takes. Background framing lives in
[../docs/skill-validation.md](../docs/skill-validation.md) and in
section 7 of the full project plan.

## Skill validation rule

A skill is valid only if:

- it targets a specific GraphCompose version
- its code examples compile
- its examples render successfully where applicable
- it does not reference removed APIs
- it does not recommend deprecated patterns
- it has at least one verified fixture when possible
- it documents known limitations

The Skill Validator Agent owns this check. See
[../docs/agents.md](../docs/agents.md) for the agent's inputs,
outputs, and the core rule that the library — not the skill — is
the source of truth.

## Recommended validation structure

This is what the current folder looks like:

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

Each fixture is a small standalone GraphCompose project that
exercises one skill end-to-end. The layout mirrors
[../examples/skill-fixtures/](../examples/skill-fixtures/):

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

The fixture's `expected-output/` is what skill validation compares
against when it re-renders the example with the current GraphCompose
release.

## Skill drift rule

```text
If GraphCompose behavior differs from the skill documentation, the library is treated as the source of truth.

The skill must be updated.

The agent must not silently work around incorrect skills.
```

When drift is detected the Skill Validator Agent files a skill-fix
report rather than patching the template to dodge the broken skill.
See [skill-fix-template.md](skill-fix-template.md) for the template
and the steps to file the report.

## How validation runs

A single validation run for one fixture proceeds as follows. Steps 2
through 4 require the renderer and visual-diff tools that ship in
Phase 6 and Phase 7, so this section also describes what is not yet
runnable in Phase 4.

1. Load the fixture from `../examples/skill-fixtures/<fixture-id>`.
   Confirm `pom.xml`, the test source, and `expected-output/` are
   present.
2. Run `mvnw test` against the fixture. This compiles the template,
   runs the fixture's test class, and writes a fresh
   `expected-output/output.pdf`. Phase 6 dependency: the
   preview-renderer tool must be in place before this step can run
   automatically.
3. Convert the fresh `output.pdf` to `output.png` and produce a
   `layout-snapshot.json`. Phase 6 dependency.
4. Diff the freshly rendered `output.png` against the committed
   baseline `expected-output/output.png`. Phase 7 dependency: the
   visual-diff tool must be in place before this step can run
   automatically.
5. Classify any mismatch against the visual-mismatch policy in
   [../docs/visual-accuracy-contract.md](../docs/visual-accuracy-contract.md)
   (`CRITICAL`, `MAJOR`, `MINOR`, `ACCEPTED_LIMITATION`,
   `INTENTIONAL_DIFFERENCE`).
6. Write a report from [validation-report-template.md](validation-report-template.md)
   and commit it under [reports/](reports/). Update
   [api-compatibility-checklist.md](api-compatibility-checklist.md)
   with the new `Last validated` date and any `Drift detected`
   status change. Update
   [../skills/skill-manifest.json](../skills/skill-manifest.json)
   to move a skill out of `needs-validation` to `active` (passing)
   or `failed-validation` (drift), per
   [../docs/versioned-skills.md](../docs/versioned-skills.md).

## When to file a skill-fix report

File a skill-fix report whenever the validation run detects skill
drift — that is, whenever a fixture's rendered output does not match
its committed baseline and the cause is the skill, not the test
data. Examples include:

- a documented method or builder no longer exists in the target
  GraphCompose version
- a documented method behaves differently (different defaults,
  different return type, different side effect)
- a documented pattern produces a visibly different layout
- an example in the skill no longer compiles against the target
  version

Use the verbatim template in
[skill-fix-template.md](skill-fix-template.md) and commit the
filled-in report under [reports/](reports/) as
`skill-fix-<skill-id>-<date>.md`. The drift rule above forbids
silently working around a broken skill; the fix must land in the
skill file, not in the fixture or the agent prompt.
