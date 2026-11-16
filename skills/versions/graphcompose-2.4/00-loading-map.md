---
skillId: graphcompose-loading-map
targetLibrary: GraphCompose
targetVersion: 2.4.x
status: active
verifiedAgainst: 2.4.0
lastValidated: 2026-09-21
---

# Loading map — which skill files this task needs

This pack is the 2.4 line. It is not a copy of 2.2: it carries pages
for what 2.4 added and changed, and it points at the 2.2 pack for the
topics 2.4 left alone. A typical task needs four to six files.

This page answers one question: **given what I am about to do, which
files do I open?**

## How this pack is shaped

2.4 arrives as a knowledge bundle — a closed API allow-list, routing and
claims, generated from the release's class files. The prose around it is
written here, and it comes in two kinds:

- **Pages in this directory** cover what 2.4 added or changed. They are
  the ones that would be wrong if you read the 2.2 page instead.
- **Links into `../graphcompose-2.2/`** cover topics where 2.4 added
  nothing: tables, themes, shapes, layer stacks, backgrounds,
  pagination, spacing, and the mapping from a reference to primitives.
  Those pages are borrowed on purpose, and
  [`whats-new-in-2-4.md`](whats-new-in-2-4.md) lists the specific places
  where a borrowed page is behind the line.

Nothing in the 2.2 pack decides what exists. The allow-list for this
line is 2.4's, and it is asked rather than read.

## Always

| File | Why |
|---|---|
| [`whats-new-in-2-4.md`](whats-new-in-2-4.md) | what this line added over 2.2, and which 2.2 constructions it replaced. Short, and it is the page that stops a 2.2 habit being written into a 2.4 template |
| [`../graphcompose-2.2/graphcompose-basics.md`](../graphcompose-2.2/graphcompose-basics.md) | what the engine is and how a document is assembled. Unchanged in 2.4 |

The allow-list is `api/authoring.md` and its four sibling surfaces.
**Do not read them.** They are deliberately not linked from this page:
a link here would put a 3,700-line generated surface into the list of
files a run loads every time. They are the closed set of
record, not a page: ask them instead, which costs a few lines rather
than a few thousand.

```bash
node scripts/api-query.mjs --version 2.4 --exists TimelineBuilder.rail
node scripts/api-query.mjs --version 2.4 --type DocumentPageZone
node scripts/api-query.mjs --version 2.4 --search letterSpacing
```

Exit `0` found, exit `3` does not exist. A `3` is a real answer, and it
is the one that stops an invented call.

## Before choosing how — ask for the route

A surface says what exists. It cannot say which of three ways is right,
and that is where wrong-API choices come from.

```bash
node scripts/api-query.mjs --version 2.4 --tasks
node scripts/api-query.mjs --version 2.4 --task timeline.dated-history
```

Twelve intents answer for this line. Five come from the release bundle
and carry `confirmedBy`; seven are harness-owned, cover what 2.4 added,
and report `confirmed: false` — a route, not a ruling. Each one names
the page below that explains it.

## By what you are doing

| Task | Add these |
|---|---|
| Reading a reference into regions and primitives | [`../graphcompose-2.2/visual-to-graphcompose-mapping.md`](../graphcompose-2.2/visual-to-graphcompose-mapping.md), [`../graphcompose-2.2/layout-primitives.md`](../graphcompose-2.2/layout-primitives.md), [`../graphcompose-2.2/spacing-and-alignment.md`](../graphcompose-2.2/spacing-and-alignment.md) |
| Writing or changing template code | [`../graphcompose-2.2/layout-primitives.md`](../graphcompose-2.2/layout-primitives.md) + [`flow-width-and-sizing.md`](flow-width-and-sizing.md) + the files for the visual features below |
| Judging a render against a reference or a parent | [`../graphcompose-2.2/visual-regression.md`](../graphcompose-2.2/visual-regression.md) |
| Opening, approving or rolling back a revision | [`../graphcompose-2.2/revision-discipline.md`](../graphcompose-2.2/revision-discipline.md) |
| Something broke and the cause is not obvious | [`../graphcompose-2.2/troubleshooting.md`](../graphcompose-2.2/troubleshooting.md), then the exceptions section of [`whats-new-in-2-4.md`](whats-new-in-2-4.md) — 2.4 added four that the 2.2 page cannot name |
| Needing worked usage rather than signatures | [`../graphcompose-2.2/guides/00-index.md`](../graphcompose-2.2/guides/00-index.md), then the one guide that matches |

## By what the reference actually contains

Load a file because the document has the thing, not because the
document kind usually does.

| The reference shows | Load |
|---|---|
| A dated history — roles, projects, milestones — with markers down the page, with or without a connecting line | [`timeline-and-rails.md`](timeline-and-rails.md) |
| Running headers or footers that differ between pages — no footer on the cover, "Page 2 of 7" after it | [`page-zones-and-chrome.md`](page-zones-and-chrome.md) |
| A block that keeps its own width inside a wider column — a pill, a card, a signature rule | [`flow-width-and-sizing.md`](flow-width-and-sizing.md) |
| Tracked type — a spaced wordmark, letter-spaced small caps, a deliberately tight heading | [`typography-2-4.md`](typography-2-4.md) |
| Lists whose wrapped lines align under the text, icon bullets, or a highlighted token inside a sentence | [`lists-and-inline-2-4.md`](lists-and-inline-2-4.md) |
| More than one type size or weight, any deliberate hierarchy | [`typography-2-4.md`](typography-2-4.md), then [`../graphcompose-2.2/typography.md`](../graphcompose-2.2/typography.md) for the parts 2.4 did not touch |
| Structured rows and columns — line items, specs, schedules | [`../graphcompose-2.2/tables.md`](../graphcompose-2.2/tables.md) |
| Repeated colours, an accent, a palette worth naming | [`../graphcompose-2.2/themes-and-colors.md`](../graphcompose-2.2/themes-and-colors.md) |
| Coloured bands, panels, tinted sidebars, full-bleed surfaces | [`../graphcompose-2.2/backgrounds-and-panels.md`](../graphcompose-2.2/backgrounds-and-panels.md) |
| Circles, pills, badges, rounded cards, clipped images | [`../graphcompose-2.2/shapes-and-containers.md`](../graphcompose-2.2/shapes-and-containers.md) |
| Elements that genuinely overlap, or sit on top of a surface | [`../graphcompose-2.2/layer-stacks-and-overlays.md`](../graphcompose-2.2/layer-stacks-and-overlays.md) |
| More than one page — or any repeated-row content (line items, transactions, an article body), **even when the screenshot shows one page**: the sample is short, real data is not | [`../graphcompose-2.2/pagination.md`](../graphcompose-2.2/pagination.md), then [`page-zones-and-chrome.md`](page-zones-and-chrome.md) if the pages differ |

## Worked starting points

Starting points, not prescriptions — check them against the reference
in front of you and add or drop files accordingly.

**Two-column CV**
`whats-new-in-2-4` · `../graphcompose-2.2/graphcompose-basics`
· `../graphcompose-2.2/visual-to-graphcompose-mapping`
· `../graphcompose-2.2/layout-primitives`
· `../graphcompose-2.2/spacing-and-alignment` · `typography-2-4`
· `../graphcompose-2.2/layer-stacks-and-overlays`
· `../graphcompose-2.2/shapes-and-containers`
· `../graphcompose-2.2/themes-and-colors`

Add `timeline-and-rails` when the experience section has markers or a
rail — on this line that is a primitive, not a row to hand-build. Not
`tables` unless the CV has genuinely tabular content: a skills list in
two columns is a row with weights.

**Invoice or proposal**
`whats-new-in-2-4` · `../graphcompose-2.2/graphcompose-basics`
· `../graphcompose-2.2/visual-to-graphcompose-mapping`
· `../graphcompose-2.2/layout-primitives` · `../graphcompose-2.2/tables`
· `../graphcompose-2.2/themes-and-colors`
· `../graphcompose-2.2/backgrounds-and-panels`
· `../graphcompose-2.2/pagination` · `page-zones-and-chrome`

**Cover letter**
`whats-new-in-2-4` · `../graphcompose-2.2/graphcompose-basics`
· `../graphcompose-2.2/layout-primitives` · `typography-2-4`
· `../graphcompose-2.2/spacing-and-alignment` — plus whatever the paired
CV's masthead uses, since it is reused verbatim.

**Certificate, poster, one-page report**
`whats-new-in-2-4` · `../graphcompose-2.2/graphcompose-basics`
· `../graphcompose-2.2/visual-to-graphcompose-mapping`
· `../graphcompose-2.2/layout-primitives` · `typography-2-4`
· `../graphcompose-2.2/backgrounds-and-panels`
· `../graphcompose-2.2/shapes-and-containers` · `flow-width-and-sizing`

## By revision scope

A revision reloads far less than a first generation.

| Scope | Load |
|---|---|
| `data-only` | nothing new — the change is in `<doc-kind>-data.json`, and if it needs Java the scope was wrong |
| `asset-only` | `typography-2-4` for a font swap; ask `api-query` for the icon and image APIs |
| `theme-only` | `../graphcompose-2.2/themes-and-colors`, and `typography-2-4` if the type scale or its tracking moves |
| `refactor-only` | ask `api-query` for the primitives being moved; the render must not change |
| `visual-change` | the files for the region that changed, not for the whole document |

## What not to load

The point of the map is the omissions. Do not open the whole pack "to be
safe": every unnecessary file is context the loop cannot use for the
actual mismatch it is about to fix.

Concretely: no `tables` for a CV with no tabular content, no `pagination`
for a single-page document, no `page-zones-and-chrome` unless the pages
genuinely differ, no `troubleshooting` until something is actually
wrong, and no topic file at all for a `data-only` edit.

And do not open the API surfaces. Every question they answer,
`api-query` answers in a few lines — including the one that matters
most, which is whether a call exists at all.

## Keeping this map honest

The `topics` array on each entry in
[`skills/skill-manifest.json`](../../skill-manifest.json) is the
machine-readable version of the same mapping, and
`scripts/test/pipeline-config.test.mjs` asserts that every file named
here exists and every manifest skill in this pack is reachable from some
row above. A skill nobody can find is a skill nobody loads.

The routes are checked the same way: `scripts/api-query.mjs --tasks`
merges the bundle's `routing/tasks.json` with this pack's
`routing/tasks.local.json`, and every page named by a harness-owned
route is a page in this directory.
