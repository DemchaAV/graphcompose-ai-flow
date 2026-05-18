# GraphCompose Skills

Skills are versioned instructions for AI agents.

They explain how to use GraphCompose correctly for a specific library version.

A skill must not describe imaginary API.

A skill must be validated against real GraphCompose examples.

If GraphCompose changes, the skill must be updated.

The agent must always load the skill set that matches the target GraphCompose
version before generating code.

## Manifest

The authoritative list of skills and their compatibility is in
[`skill-manifest.json`](skill-manifest.json). Agents must read the manifest
first and load only the skill files it references.

## Phase 1 status

The first skill pack targets `graphcompose-1.6` and ships in Phase 2. In the
current phase the `versions/` directory is intentionally empty and the
`skills` array in the manifest is empty. Phase 2 will populate the directory
with the skill files listed in the repository structure docs.

## Skill statuses

| Status | Meaning |
|---|---|
| `active` | Validated against the target GraphCompose version and safe for agents to use. |
| `experimental` | Newly drafted skill; use with caution and verify against a fixture. |
| `deprecated` | Superseded by a newer skill or no longer recommended for the target version. |
| `needs-validation` | Skill has not yet been checked against the current library or fixtures. |
| `failed-validation` | Skill conflicts with current library behavior; do not use until fixed. |

## No invented API rule

```text
The agent must never invent GraphCompose methods, builders, options, or configuration APIs.

If a method is not documented in the selected skill version or verified examples, the agent must treat it as unavailable.

When unsure, the agent must generate a conservative template using known primitives.
```
