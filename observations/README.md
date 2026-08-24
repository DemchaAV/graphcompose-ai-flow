# Observations

What we have learned about how a GraphCompose line actually behaves — kept
apart from the skill packs on purpose.

## Why this is not a skill

A skill pack is the allow-list an agent authors against: if a method is not
in `00-api-surface.md`, it does not exist. That file is generated from the
library. An observation is the opposite kind of claim — something noticed
while building a document, true of one build, discovered because a render
came out wrong.

Folding the second into the first automatically would put an unverified
claim where an agent reads the API contract. So observations live here as
evidence, and moving one into a pack is a deliberate step with a gate in
front of it.

## The path

```text
a render comes out wrong
   ↓
a probe isolates it            tools/diagnostics/graphcompose-<line>/
   ↓
an observation records it      observations/graphcompose-<line>/<id>.json
   ↓
`observations verify` re-runs the probe and agrees
   ↓
`observations promote` folds it into a versioned skill
```

Each observation names the probe that settles it and the numbers that probe
reported. `verify` re-runs the probe and compares:

```bash
node scripts/observations.mjs verify
```

That is what makes an observation retirable. When the library fixes a
behaviour, the probe stops agreeing, verify fails, and the record is set to
`retired` — kept rather than deleted, so the next reader knows it was
checked and not merely forgotten.

An observation with no probe cannot be re-confirmed. `verify` fails it
rather than passing it, and it can never be promoted.

## Commands

```bash
node scripts/observations.mjs list
node scripts/observations.mjs show <id>
node scripts/observations.mjs verify [--id <id>]
node scripts/observations.mjs promote <id> --into skills/versions/graphcompose-2.2/<file>.md
```

`promote` re-verifies first, appends a drafted section to the pack, and
records `promotedTo` on the observation. **Read what it wrote.** A generated
paragraph is a draft; the pack is prose someone is expected to trust.

## What is on record

Three behaviours of GraphCompose 2.2, all from the first acceptance run
(2026-08-24), all confirmed by probes:

| id | in one line |
|---|---|
| `shape-container-margin-paints-high` | a container's fill paints `marginBottom` above its box |
| `shape-container-top-clamps-tall-child` | an over-tall child is clamped to the top, not centred |
| `row-cannot-nest-in-row-cell` | a row refuses to nest in a row cell, and LayerStack does not rescue it |

That run cost three revisions to establish the first one. The point of this
directory is that the next one does not.

## Schema

[`schemas/observation.schema.json`](../schemas/observation.schema.json).
`confidence` is `suspected` (seen once), `confirmed` (a probe reproduces it),
or `retired` (the library changed).
