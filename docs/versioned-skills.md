# Versioned Skills

The most important architectural rule of this project is that agents
must not guess the GraphCompose API. They must load versioned
skills.

## Skills are contracts

```text
Skills are not static documentation.
They are versioned contracts between the agent and the GraphCompose API.
```

A skill targets a specific GraphCompose version, documents specific
primitives, and is expected to be validated against real library
behavior. If the library changes, the skill must be updated. See
[skill-validation.md](skill-validation.md) for the planned
validation discipline.

## Recommended structure

```text
skills/
  README.md
  skill-manifest.json

  versions/
    graphcompose-1.5/
      graphcompose-basics.md
      visual-to-graphcompose-mapping.md
      layout-primitives.md
      tables.md
      themes-and-colors.md
      typography.md
      spacing-and-alignment.md
      backgrounds-and-panels.md
      layer-stacks-and-overlays.md
      shapes-and-containers.md
      pagination.md
      visual-regression.md
      revision-discipline.md
      troubleshooting.md

    graphcompose-1.6/
      graphcompose-basics.md
      visual-to-graphcompose-mapping.md
      layout-primitives.md
      tables.md
      themes-and-colors.md
      typography.md
      spacing-and-alignment.md
      backgrounds-and-panels.md
      layer-stacks-and-overlays.md
      shapes-and-containers.md
      pagination.md
      visual-regression.md
      revision-discipline.md
      troubleshooting.md

    graphcompose-1.9/
      00-api-surface.md   (source-generated public-API allow-list)
      (+ the same 14 files — the active pack, ported to 1.9.x and
       verified against 1.9.0; graphcompose-1.7/ and graphcompose-1.6/
       are retained as the frozen 1.7.x / 1.6.x snapshots)
```

Skills are physically duplicated per supported GraphCompose version
rather than shared with branching. That keeps each skill pack a
self-contained snapshot of "what the API looked like at this
version".

## Skill manifest

File:

```text
skills/skill-manifest.json
```

Example:

```json
{
  "skillsVersion": "1.0.0",
  "targetLibrary": "GraphCompose",
  "supportedGraphComposeVersions": [
    "1.5.x",
    "1.6.x"
  ],
  "defaultGraphComposeVersion": "1.6.x",
  "skills": [
    {
      "id": "graphcompose-basics",
      "file": "versions/graphcompose-1.6/graphcompose-basics.md",
      "verifiedAgainst": "1.6.0",
      "status": "active"
    },
    {
      "id": "visual-to-graphcompose-mapping",
      "file": "versions/graphcompose-1.6/visual-to-graphcompose-mapping.md",
      "verifiedAgainst": "1.6.0",
      "status": "active"
    },
    {
      "id": "tables",
      "file": "versions/graphcompose-1.6/tables.md",
      "verifiedAgainst": "1.6.0",
      "status": "active"
    }
  ]
}
```

The Version + Skill Resolver Agent reads `skill-manifest.json` to
pick the matching skill pack. See
[agents.md#version--skill-resolver-agent](agents.md#version--skill-resolver-agent).

## Skill statuses

```text
active
experimental
deprecated
needs-validation
failed-validation
```

| Status | Meaning |
|---|---|
| `active` | Verified against the recorded GraphCompose version and ready to use |
| `experimental` | Authored but not fully validated; use only with caution |
| `deprecated` | Still present for historical reference but no longer recommended |
| `needs-validation` | Scheduled for validation; not safe to ship in skill pack yet |
| `failed-validation` | Validation has run and failed; the skill must be fixed before reuse |

## Skill metadata block

Every skill file should start with metadata:

```yaml
---
skillId: tables
targetLibrary: GraphCompose
targetVersion: 1.6.x
verifiedAgainst: 1.6.0
status: active
lastValidated: 2026-05-18
---
```

The metadata block makes each skill file self-describing. Tooling can
read it without going through the manifest.

## No Invented API Rule

```text
The agent must never invent GraphCompose methods, builders, options, or configuration APIs.
```

If a method is not documented in the selected skill version or
verified examples, the agent must treat it as unavailable.

When unsure, the agent must generate a conservative template using
known primitives.

Bad:

```java
section.enableUltraSmartPixelPerfectLayout(true);
```

Good:

```java
// Use documented RowBuilder / SectionBuilder / TableBuilder primitives.
// If exact visual behavior is uncertain, document it in visual-review.md.
```

The rule is enforced both by the Template Coder Agent at code
generation time and by the Skill Validator Agent when it checks the
skill pack itself.

## Further reading

- [skill-validation.md](skill-validation.md) — the validation flow,
  drift handling, and skill fix report template
- [agents.md#skill-validator-agent](agents.md#skill-validator-agent) —
  responsibilities of the validator agent
- [agents.md#template-coder-agent](agents.md#template-coder-agent) —
  the coder agent's rules around API usage
