# Skill Fix Template

Copy this template into
`validation/reports/skill-fix-<skill-id>-<date>.md` when filing a
drift report. The template body below is verbatim from section 7.5
of the full project plan and must not be edited in place — fill it
in inside the copied report file.

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

## How to file

1. Identify the failing fixture under
   [../examples/skill-fixtures/](../examples/skill-fixtures/). Note
   the exact fixture directory; the report links to it.
2. Copy this template into
   `validation/reports/skill-fix-<skill-id>-<date>.md`, replacing
   `<skill-id>` with the affected skill id from
   [../skills/skill-manifest.json](../skills/skill-manifest.json)
   and `<date>` with today's ISO date.
3. Fill in the affected skill path, the GraphCompose version, the
   observed library behavior, and the expected behavior. Link the
   failing fixture in the `Failing example` section.
4. Commit the filled-in report under
   [reports/](reports/) and reference it from the relevant
   validation run report or from
   [api-compatibility-checklist.md](api-compatibility-checklist.md).
5. Update the affected skill file under
   `../skills/versions/graphcompose-1.6/` and set the matching entry
   in [../skills/skill-manifest.json](../skills/skill-manifest.json)
   to `failed-validation` until the fix lands, then to `active`
   once the fixture re-runs cleanly.
