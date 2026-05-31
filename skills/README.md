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

## Current status

Phase 2 has shipped the first skill pack under
[`versions/graphcompose-1.6/`](versions/graphcompose-1.6/). It contains 14
skill files, all listed in [`skill-manifest.json`](skill-manifest.json) with
`status: needs-validation`. Five fixture projects now compile and run
against GraphCompose 1.6.6 from Maven Central
(`io.github.demchaav:graph-compose:1.6.6`; JitPack remains a fallback
for pre-1.6.6 pins), which proves the covered API calls resolve
against the real library. Full skill validation still requires the
render + preview + visual-diff loop, so no skill is promoted to
`status: active` yet. Skills found to conflict with the library will be
marked `failed-validation` and fixed per the
[skill drift rule](../docs/skill-validation.md).

## Skill statuses

| Status | Meaning |
|---|---|
| `active` | Validated against the target GraphCompose version and safe for agents to use. |
| `experimental` | Newly drafted skill; use with caution and verify against a fixture. |
| `deprecated` | Superseded by a newer skill or no longer recommended for the target version. |
| `needs-validation` | Skill still needs full render/visual validation, even if compile smoke has passed. |
| `failed-validation` | Skill conflicts with current library behavior; do not use until fixed. |

## No invented API rule

```text
The agent must never invent GraphCompose methods, builders, options, or configuration APIs.

If a method is not documented in the selected skill version or verified examples, the agent must treat it as unavailable.

When unsure, the agent must generate a conservative template using known primitives.
```

## Authoritative API reference

When a skill page does not document the exact method signature, the
agent MUST consult the hosted Javadoc rather than guess or grep an
unverified copy of the GraphCompose source:

- **Pinned-version Javadoc (current target):**
  [javadoc.io/doc/io.github.demchaav/graph-compose/1.6.6](https://javadoc.io/doc/io.github.demchaav/graph-compose/1.6.6)
- **Stable-version alias:**
  [javadoc.io/doc/io.github.demchaav/graph-compose](https://javadoc.io/doc/io.github.demchaav/graph-compose)

`graphcompose-basics` documents the lookup priority (skill → Javadoc
→ fixture → ask the user) and the meaning of `@Beta` / `@since` tags
in the published Javadoc.
