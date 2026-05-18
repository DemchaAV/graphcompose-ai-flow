# Skill Validation

Skills must be tested against real library behavior. This page
documents the planned validation discipline. The actual `validation/`
folder and the fixture projects ship in Phase 4 of the roadmap — see
[roadmap.md](roadmap.md). For Phase 1 this page exists as a contract
for what validation must look like once it is in place.

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
[agents.md#skill-validator-agent](agents.md#skill-validator-agent)
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

When drift is detected the Skill Validator Agent files a skill fix
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

The actual `validation/` folder, the skill-fixture projects under
`examples/skill-fixtures/`, and the CI to run them ship in Phase 4 of
the roadmap. For now this page documents the planned discipline so
that skill authors and prompt authors can write skills that will pass
validation when it is wired up. See [versioned-skills.md](versioned-skills.md)
for the manifest, statuses, and the no-invented-API rule that
validation enforces.
