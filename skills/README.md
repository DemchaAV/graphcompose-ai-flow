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

The active skill pack is
[`versions/graphcompose-1.9/`](versions/graphcompose-1.9/) — a port of the
1.7.x pack (which itself ported the 1.6.x pack); 1.7.0 → 1.9.0 is additive
with zero breaking changes, so the copies are a valid starting point. The
earlier packs are retained as frozen snapshots under
[`versions/graphcompose-1.7/`](versions/graphcompose-1.7/) and
[`versions/graphcompose-1.6/`](versions/graphcompose-1.6/) for projects
pinned back to those minors. The pack lists 15 skills in
[`skill-manifest.json`](skill-manifest.json):

- `graphcompose-api-surface`
  ([`versions/graphcompose-1.9/00-api-surface.md`](versions/graphcompose-1.9/00-api-surface.md))
  — the source-generated public-API allow-list, `status: active`. It is
  verified-by-construction against the `v1.9.0` tag (a closed set, not a
  visual render), so it is safe to rely on as the authoritative existence
  check.
- the 14 conceptual skills — `status: needs-validation`. Five fixture
  projects compile and run against GraphCompose 1.9.0 from Maven Central
  (`io.github.demchaav:graph-compose:1.9.0`; JitPack remains a fallback
  for pre-1.6.7 pins), which proves the covered API calls resolve against
  the real library, but full validation still requires the render +
  preview + visual-diff loop, so none is promoted to `status: active`.

Skills found to conflict with the library will be marked
`failed-validation` and fixed per the
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

The lookup priority is **skill → allow-list → Javadoc**, not the old
"skill → Javadoc → guess". When a skill page does not document the
exact method signature, the agent MUST resolve it against the
source-generated allow-list first, and NEVER guess or grep an
unverified copy of the GraphCompose source:

1. **Allow-list (authoritative closed set):**
   [`versions/graphcompose-1.9/00-api-surface.md`](versions/graphcompose-1.9/00-api-surface.md)
   — the complete, source-generated list of every public authoring
   method and constant for the target version. **Not listed = does not
   exist; do not invent one.**
2. **Pinned-version Javadoc (current target):**
   [javadoc.io/doc/io.github.demchaav/graph-compose/1.9.0](https://javadoc.io/doc/io.github.demchaav/graph-compose/1.9.0)
   — for parameter names and `@since` / `@Beta` tags the allow-list
   does not carry.
3. **Stable-version alias:**
   [javadoc.io/doc/io.github.demchaav/graph-compose](https://javadoc.io/doc/io.github.demchaav/graph-compose)

`graphcompose-basics` documents the full lookup priority (skill →
allow-list → Javadoc → fixture → ask the user) and the meaning of
`@Beta` / `@since` tags in the published Javadoc. The allow-list is
regenerated per release by
[`tools/api-surface/api-index.py`](../tools/api-surface/api-index.py).
