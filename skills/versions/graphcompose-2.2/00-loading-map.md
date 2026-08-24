---
skillId: graphcompose-loading-map
targetLibrary: GraphCompose
targetVersion: 2.2.x
verifiedAgainst: 2.2.0
status: active
lastValidated: 2026-08-24
---

# Loading map — which skill files this task needs

Sixteen files describe what GraphCompose 1.9 can do. A typical task
needs four to six of them. Reading the pack wholesale buries the part
that matters and spends context that the iteration loop will need later.

This page answers one question: **given what I am about to do, which
files do I open?**

## Always

| File | Why |
|---|---|
| [`00-api-surface.md`](00-api-surface.md) | the generated allow-list. Grep it for every builder you are about to call. If a method, overload or enum constant is not in it, it does not exist |
| [`graphcompose-basics.md`](graphcompose-basics.md) | what the engine is and how a document is assembled |

`00-api-surface.md` is large. Grep it for the symbol you need
(`TableBuilder`, `LayerStackBuilder`, `FontName`) rather than reading it
front to back.

## By what you are doing

| Task | Add these |
|---|---|
| Reading a reference into regions and primitives | [`visual-to-graphcompose-mapping.md`](visual-to-graphcompose-mapping.md), [`layout-primitives.md`](layout-primitives.md), [`spacing-and-alignment.md`](spacing-and-alignment.md) |
| Writing or changing template code | [`layout-primitives.md`](layout-primitives.md) + the files for the visual features below |
| Judging a render against a reference or a parent | [`visual-regression.md`](visual-regression.md) |
| Opening, approving or rolling back a revision | [`revision-discipline.md`](revision-discipline.md) |
| Something broke and the cause is not obvious | [`troubleshooting.md`](troubleshooting.md) |
| Needing worked usage rather than signatures | [`guides/00-index.md`](guides/00-index.md), then the one guide that matches |

## By what the reference actually contains

Load a file because the document has the thing, not because the
document kind usually does.

| The reference shows | Load |
|---|---|
| Structured rows and columns — line items, specs, schedules | [`tables.md`](tables.md) |
| Repeated colours, an accent, a palette worth naming | [`themes-and-colors.md`](themes-and-colors.md) |
| More than one type size or weight, any deliberate hierarchy | [`typography.md`](typography.md) |
| Coloured bands, panels, tinted sidebars, full-bleed surfaces | [`backgrounds-and-panels.md`](backgrounds-and-panels.md) |
| Circles, pills, badges, rounded cards, clipped images | [`shapes-and-containers.md`](shapes-and-containers.md) |
| Elements that genuinely overlap, or sit on top of a surface | [`layer-stacks-and-overlays.md`](layer-stacks-and-overlays.md) |
| More than one page, or content that will overflow | [`pagination.md`](pagination.md) |

## Worked starting points

Starting points, not prescriptions — check them against the reference
in front of you and add or drop files accordingly.

**Two-column CV**
`00-api-surface` · `graphcompose-basics` · `visual-to-graphcompose-mapping`
· `layout-primitives` · `spacing-and-alignment` · `typography`
· `layer-stacks-and-overlays` (avatar, badges) · `shapes-and-containers`
(circles, pills) · `themes-and-colors`

Not `tables` unless the CV has genuinely tabular content — a skills list
in two columns is a row with weights, not a table.

**Invoice or proposal**
`00-api-surface` · `graphcompose-basics` · `visual-to-graphcompose-mapping`
· `layout-primitives` · `tables` · `themes-and-colors`
· `backgrounds-and-panels` · `pagination` (line items overflow)

**Cover letter**
`00-api-surface` · `graphcompose-basics` · `layout-primitives`
· `typography` · `spacing-and-alignment` — plus whatever the paired CV's
masthead uses, since it is reused verbatim.

**Certificate, poster, one-page report**
`00-api-surface` · `graphcompose-basics` · `visual-to-graphcompose-mapping`
· `layout-primitives` · `typography` · `backgrounds-and-panels`
· `shapes-and-containers`

## By revision scope

A revision reloads far less than a first generation.

| Scope | Load |
|---|---|
| `data-only` | nothing new — the change is in `<doc-kind>-data.json`, and if it needs Java the scope was wrong |
| `asset-only` | `typography` for a font swap; `00-api-surface` for the icon and image APIs |
| `theme-only` | `themes-and-colors`, and `typography` if the type scale moves |
| `refactor-only` | `00-api-surface` for the primitives being moved; the render must not change |
| `visual-change` | the files for the region that changed, not for the whole document |

## What not to load

The point of the map is the omissions. Do not open the whole pack "to be
safe": every unnecessary file is context the loop cannot use for the
actual mismatch it is about to fix.

Concretely: no `tables` for a CV with no tabular content, no `pagination`
for a single-page document, no `troubleshooting` until something is
actually wrong, and no topic file at all for a `data-only` edit.

## Keeping this map honest

The `topics` array on each entry in
[`skills/skill-manifest.json`](../../skill-manifest.json) is the
machine-readable version of the same mapping, and
`scripts/test/pipeline-config.test.mjs` asserts that every file named
here exists and every manifest skill in this pack is reachable from some
row above. A skill nobody can find is a skill nobody loads.
