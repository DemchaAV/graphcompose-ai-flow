# Validation Report Template

Use this template for a periodic skill-pack validation run. Copy the
template into [reports/](reports/) as
`validation-<date>.md` or, when the run is tied to a release, as
`validation-<graphcompose-version>-<date>.md`. Fill in every section;
leave a section empty only when nothing applies, and say so
explicitly ("none observed") rather than deleting the heading.

## Header

- Report id:
- Run date:
- GraphCompose version validated against:
- Skill pack version (from [../skills/skill-manifest.json](../skills/skill-manifest.json)):
- Runner: CI / manual

## Summary

A short paragraph describing what was run, whether the run was a
full pass over all fixtures or a partial pass, and the overall
result (clean, drift observed, partial drift, blocked).

## Per-skill results

| Skill ID | Target version | Status | Fixture exists | Fixture executed | Drift detected | Last validated |
|---|---|---|---|---|---|---|
| | | | | | | |

Use the same columns as
[api-compatibility-checklist.md](api-compatibility-checklist.md) so
the two tables can be diffed by eye. After this report lands, sync
the matching rows in `api-compatibility-checklist.md` and update
[../skills/skill-manifest.json](../skills/skill-manifest.json) where
a status changes.

## Failures

List every fixture that failed to compile, render, or diff. Include
the fixture path, the step that failed (compile / render / diff),
and a short cause sentence. If no failures were observed, write
"none observed".

## Drift findings

List every drift finding with a link to its skill-fix report under
[reports/](reports/). Drift findings that were classified as
`MINOR` or `ACCEPTED_LIMITATION` per
[../docs/visual-accuracy-contract.md](../docs/visual-accuracy-contract.md)
must still be linked, not silenced. If no drift was observed, write
"none observed".

## Accepted limitations confirmed

List the entries from
[known-limitations.md](known-limitations.md) that this run
confirmed are still accepted. This is the place to record "yes, the
font substitution still applies" or "yes, color tolerance band is
still in use".

## New limitations discovered

List any limitation observed during the run that is not already
recorded in [known-limitations.md](known-limitations.md). Each new
limitation must be added to that page after the report lands, or
opened as an action item below.

## Action items

| Item | Owner | Due | Status |
|---|---|---|---|
| | | | |

Action items include skill files to fix, fixtures to add, new
limitations to document, and follow-up runs to schedule. Reference
each action by file path.

## How to file

1. Copy this file into [reports/](reports/) with the date-stamped
   name above.
2. Fill in every header field and every section. Use "none observed"
   rather than deleting a section.
3. Link skill-fix reports from the `Drift findings` section.
4. After the report is committed, update
   [api-compatibility-checklist.md](api-compatibility-checklist.md)
   and
   [../skills/skill-manifest.json](../skills/skill-manifest.json)
   to reflect the new statuses. Skills that pass move from
   `needs-validation` to `active`. Skills that drift move to
   `failed-validation` until a skill-fix report and a follow-up run
   confirm the fix.
