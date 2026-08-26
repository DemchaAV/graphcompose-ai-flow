# GraphCompose Skills

Two kinds of skill live here, and they change on different clocks:

| Directory | Answers | Changes with |
|---|---|---|
| [`workflows/`](workflows/README.md) | *how the work is done* — create, revise, review, approve | this project |
| [`versions/`](versions/) | *what GraphCompose can do*, per library version | the library |

The rest of this page is about the versioned packs.

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
[`versions/graphcompose-2.2/`](versions/graphcompose-2.2/), ported from
the 1.9 pack. Unlike the earlier ports, this one crossed a major: 2.0
reorganised the template surface, so the port was a diff against the
regenerated allow-list rather than a copy. What moved is tabulated in
[`versions/graphcompose-2.2/graphcompose-basics.md`](versions/graphcompose-2.2/graphcompose-basics.md)
under "What moved in 2.0" — in short, `document.theme` became
`templates.core.theme` (`BrandTheme`), `templates.builtins` became
per-kind presets, and the legacy `GraphCompose.pdf(...)` surface is gone.

Earlier packs are retained as frozen snapshots for projects pinned to
those lines — [1.9](versions/graphcompose-1.9/),
[1.7](versions/graphcompose-1.7/), [1.6](versions/graphcompose-1.6/).
They are not listed in the manifest and are not updated; the resolver
finds them on disk by directory name.

The active pack lists 17 skills in
[`skill-manifest.json`](skill-manifest.json):

- `graphcompose-api-surface`
  ([`versions/graphcompose-2.2/00-api-surface.md`](versions/graphcompose-2.2/00-api-surface.md))
  — the source-generated public-API allow-list, `status: active`. It is
  verified-by-construction against the `v2.2.0` tag (a closed set, not a
  visual render), so it is safe to rely on as the authoritative existence
  check: 268 types, 1886 methods, 317 constants across core and the
  templates module.
- `graphcompose-loading-map`
  ([`versions/graphcompose-2.2/00-loading-map.md`](versions/graphcompose-2.2/00-loading-map.md))
  — which files a given task should open, so a task loads four to six of
  them rather than all seventeen.
- the 15 conceptual skills — `status: needs-validation`. The five
  fixture projects under
  [`examples/skill-fixtures/`](../examples/skill-fixtures/) compile,
  test and render against GraphCompose 2.2.0, and every render is
  `IDENTICAL` against its committed baseline — so the compile-smoke
  evidence for this pack is proven, not inherited. What still keeps the
  status is coverage rather than doubt: five fixtures exercise rows,
  sections, tables, layer stacks and shape containers, which is a subset
  of what the fourteen skills describe. A skill is promoted to `active`
  when a fixture covers it.

  Porting those fixtures across the major was not a formality. They used
  `com.demcha.compose.document.theme.BusinessTheme`, which 2.0 moved
  into GraphCompose's own `examples` module — unpublished, so no project
  depending on `io.github.demchaav:graph-compose` can reach it. Each
  fixture now carries a small `FixtureTheme` built from `DocumentColor`
  and `DocumentTextStyle` alone, reproducing the values
  `BusinessTheme.modern()` used; that the renders came back pixel-
  identical is what confirms the reproduction.

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

The lookup priority is **skill → allow-list → engine guides → Javadoc**,
not the old "skill → Javadoc → guess". When a skill page does not
document the exact method signature, the agent MUST resolve it against
the source-generated allow-list first, and NEVER guess or grep an
unverified copy of the GraphCompose source:

1. **Allow-list (authoritative closed set):**
   [`versions/graphcompose-2.2/00-api-surface.md`](versions/graphcompose-2.2/00-api-surface.md)
   — the complete, source-generated list of every public authoring
   method and constant for the target version. **Not listed = does not
   exist; do not invent one.**
2. **Engine guides (how to use it):**
   [`versions/graphcompose-2.2/guides/00-index.md`](versions/graphcompose-2.2/guides/00-index.md)
   — verified, render-proven how-to guides vendored from the GraphCompose
   LLM wiki. The allow-list says WHAT exists; the guides show HOW to wire
   the primitives together.
3. **Pinned-version Javadoc (current target):**
   [javadoc.io/doc/io.github.demchaav/graph-compose/2.2.0](https://javadoc.io/doc/io.github.demchaav/graph-compose/2.2.0)
   — for parameter names and `@since` / `@Beta` tags the allow-list
   does not carry.
4. **Stable-version alias:**
   [javadoc.io/doc/io.github.demchaav/graph-compose](https://javadoc.io/doc/io.github.demchaav/graph-compose)

`graphcompose-basics` documents the full lookup priority (skill →
allow-list → engine guides → Javadoc → fixture → ask the user) and the
meaning of `@Beta` / `@since` tags in the published Javadoc. The
allow-list is regenerated per release by
[`tools/api-surface/api-index.py`](../tools/api-surface/api-index.py); the
engine guides are re-synced by
[`tools/api-surface/sync-engine-guides.mjs`](../tools/api-surface/sync-engine-guides.mjs).
