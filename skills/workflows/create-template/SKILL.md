---
name: create-template
description: Turn a document reference — a screenshot, PDF, or design image of a CV, invoice, proposal, cover letter, report, certificate — into a maintainable GraphCompose Java template, then render, compare against the reference, and iterate until it is ready for approval. Use when the user supplies a reference and asks to recreate, rebuild, or generate it with GraphCompose: "create this document", "recreate this screenshot", "make this CV with GraphCompose", "build a template from this reference", "turn this PDF into a template".
---

# Create a GraphCompose template from a reference

Reconstruct the document with **semantic GraphCompose primitives** —
sections, rows, weights, anchors, layer stacks. Never draw it with raw
coordinates: a coordinate drawing matches one reference at one size and
is unmaintainable the moment anything changes.

## When this applies

The user supplies a reference image or PDF and wants it as a template.
If a template already exists and they want it changed, use
`revise-template`.

## Before the first stage

**Start with preflight.** One call answers everything deterministic about
where you are and what you are about to run:

```bash
node scripts/preflight.mjs --project-dir <java-project> [--project <id>]
```

It returns the workspace and how it was resolved, the version read from
their build file and the pack it maps to, the scope and stages this
revision routes through, the loop bounds, the loading map as data, what
previous runs already learned about this line, and whether the tools are
built. Exit 3 means the pinned line has no pack — a **stop**, not a
fallback. Exit 4 means this is not a GraphCompose project.

It decides nothing. Which files to open is still yours; what it removes
is the ten to twenty shell calls that used to go into establishing facts.

Two things it hands you that are easy to skip and expensive to skip:

- `skills.startingPoint` — the pack's own worked set for this document
  kind, usually four to six files. Sixteen exist. What you do not load is
  context the iteration loop gets to spend on the real mismatch.
- `knowledge.observations` — behaviours previous runs paid to discover.
  Read these before the first render, not after the third.

Then create the project and the first revision:

```bash
node scripts/init-workspace.mjs --project-dir <java-project> --project <project-name>
node tools/revision-manager/bin/graphcompose-flow.mjs new-revision "<the user's words>" --project <project-dir>
node scripts/telemetry/run-metrics.mjs start --project <project-name> --workflow create-template
```

The last one marks where the run began, so the metrics can separate "this
whole template" from "this one correction". Skip it and the run clock
falls back to the first thing the user said, which is close but not the
same thing.

Put the reference in `reference/reference.png` (plus
`reference-page-N.png` for extra pages). Print the chain you are about
to run with `node scripts/run-pipeline.mjs <project-id>`.

## The stages

**Fan the analysis out, where the host can.** The first three artifacts
describe the same reference and do not read each other, so they can be
produced by three parallel subagents (in Claude Code: the Agent tool;
in a host without subagents, do the same three sequentially, in this
order):

| Subagent | Owns, exclusively | Reads |
|---|---|---|
| geometry | `visual-analysis.json` | the reference + its schema |
| content | `<doc-kind>-data.json` (+ `data-schema.md`) | the reference only |
| assets | `asset-request.json` | the reference + the request format |

The rules that make this safe are the same ones that make it fast. Each
subagent writes **only its own files** — the files are the join point,
and two writers on one file is a merge conflict with no merger. Each
gets the reference image and its task, **not** this conversation, so its
context stays a fraction of the parent's. Its reply should be one line
("wrote visual-analysis.json, 9 regions"); the parent reads results from
disk, never from transcripts. Rejoin when all three files exist, then
continue below — architecture depends on the geometry, the template on
all three. The render loop that follows is serial by nature (each pass
depends on the previous render); do not try to parallelise it.

**Analyse the reference** → `visual-analysis.json`
([schema](../../../schemas/visual-analysis.schema.json)).

Write the JSON only. The readable `.md` is generated — see **Reading
copies** below.

Describe the page in **ratios and dependencies, not pixels**. Name every
region with a stable kebab-case id — every later artifact addresses
regions by those ids — and give each one `bounds: {x, y, w, h}` as page
fractions. Four numbers per region, and they are what make a region
croppable later: a correction pass can then read two small crops instead
of two full pages. A region without bounds cannot be cropped, and the
tool refuses rather than guessing. Record, for each element whose position depends on
another, the *relationship* ("badge sits at the top-right of the
avatar"), not an offset. Shape ownership is mandatory for the five cases
that otherwise get drawn as free-floating text: initials or icons inside
circles, text inside pills or badges, content inside rounded cards,
images clipped by rounded shapes, badges anchored on a shape boundary.

**Decide fixed or flowing, and record it in `flow`.** A one-page invoice
*screenshot* is not a one-page *document*: the sample shows four line
items, real data brings thirty. `flow.kind: "fixed"` means the page is
the artifact (CV, certificate, poster) and content is curated to fit;
`"flowing"` means content volume is data-driven (line items,
transactions, an article body) and the layout must paginate. For flowing
documents name the growing region in `drivenBy` and say why in
`overflowExpectation`. This one field decides three things downstream:
`pagination.md` gets loaded, page furniture maps to chrome, and the
example data must overflow.

**Mark page furniture with `role`.** A region that repeats on every page
— a page header, a page footer, a table header — is chrome, not content:
`role: "page-header" | "page-footer"` regions map to
`DocumentSession.header/.footer` in the architecture, never to body
sections drawn once; `"table-header"` means `repeatHeader` on the table.
Drawing chrome as content is invisible on a one-page render and wrong on
every page after it.

**For a flowing document, the example data must reach page 2.** A
pagination path that the render never exercises is untested code shipped
as a template: give `<doc-kind>-data.json` enough rows that the render
actually paginates, and check the repeated headers and the footer on the
continuation page. Set `page.pageCount` in the analysis to what the
*data* produces, not what the screenshot shows.

Anything you cannot read confidently goes in `unclearParts` with the
assumption you are making. Do not silently guess — a recorded assumption
is a question the user can answer later; a silent one becomes a bug with
no author.

**Map it to GraphCompose** → `architecture-plan.json`
([schema](../../../schemas/architecture-plan.schema.json)). JSON only,
same as above.

The spine is `componentMapping`: region → **named render method** →
primitives. Every visible region gets its own method (`renderHeader`,
not `part1`), because that name is what review, `changedComponents` and
selective rollback all address later. Pick the anchor primitives here;
derive the base constants here. Primitives must exist in the pinned
pack's allow-list.

**Resolve assets** → `asset-request.json`, then run the resolver;
`assets-manifest.json` is the source of truth for what was actually
fetched.

**Write the template** — following
[the authoring rules](../references/authoring-rules.md): derived
geometry, named anchors, content in `<doc-kind>-data.json` behind a
typed spec, no invented API.

**Compile and render:**

```bash
node scripts/render-and-diff.mjs --project <project-id> --revision <revision-id> [--root <workspace>]
```

One call renders, scales the reference to the render's size (persisting
`reference-scaled.png` for later passes and crops), diffs with the
evidence written into the revision, and answers with the loop verdict as
its exit code: 0 ready, 2 revise, 3 blocked, 1 a step failed. Do not run
render, diff and iterate-status as separate turns — that is three trips
for one deterministic chain.

**Review** with `review-template` → `visual-review.json`.

## When the library surprises you

Before writing a page of Java to find out how something behaves, check what
is already known and what can already be asked:

```bash
node scripts/api-query.mjs --exists TimelineBuilder.entry
node scripts/observations.mjs list
node scripts/probe.mjs --list
node scripts/probe.mjs anchor-alignment
```

`api-query` answers the allow-list without reading it. `--exists
Type.method` is the one to reach for before writing a call you are not
certain of: exit 0 with the overloads, exit 3 with the type reported and
no overloads. That is a closed answer, not a search result — the pack is
generated from source, so absent means it does not exist.

Observations are behaviours previous runs paid to discover, each confirmed
by a probe that re-runs on demand. Probes answer one question about the
pinned line and print measurements plus a finding.

If neither covers it, write a probe rather than a one-off in your project:
`tools/diagnostics/graphcompose-<line>/`. Then record what it found with
`observations`, so the next run does not buy the same answer twice. A probe
that composes *your* template stays in your project — this is for questions
about the library.

## Reporting back

Every handoff to the user — ready for approval, blocked, or answering a
correction — ends with the metrics block when it is available:

```bash
node scripts/telemetry/run-metrics.mjs report --project <project-id> --status <verdict>
```

It prints three clocks (this cycle, this run, this session) and five token
figures rather than one total, because a single number is dominated by
cache reads and hides everything worth seeing.

**Telemetry never fails the work.** If the command prints that no session is
on record, or fails for any other reason, say nothing about it and carry on:
a workflow that stopped because a measurement was unavailable would be worse
than one with no measurements.

## Reading copies

Three artifacts have a Markdown twin: `visual-analysis`,
`architecture-plan`, `visual-review`. **Do not write them.** Generate
them, once per revision, after the JSON is final:

```bash
node scripts/render-artifact-md.mjs --revision <revision-dir>
```

Writing both by hand cost the first acceptance run roughly 29k tokens
across eight revisions — an eighth of the run — restating JSON that had
just been written. The worse cost is that two documents describing one
revision drift, and nothing notices which one is wrong.

Anything the schema cannot carry — a table comparing this revision to
the previous two, a paragraph explaining *why* something was wrong —
goes in the JSON's `notes` array. The generator emits it verbatim, so
the narrative survives without a second source of truth.

## Then loop

This is the part that is easy to stop too early. A successful render is
**not** the finish line. After every render: write the review, then ask
whether the loop may continue.

```bash
node scripts/iterate-status.mjs <project-id> [--root <workspace>]
```

| Exit | Then |
|---|---|
| 0 — `READY_FOR_APPROVAL` | stop and report |
| 2 — `REVISE` | fix the **one** mismatch it names, render, review, ask again |
| 3 — `BLOCKED` | stop and report the `failureCategory` |

Fix one thing per pass and reuse the mismatch id when a problem
survives — that repetition is how the tool sees a loop going nowhere.
Do not raise a limit to keep going, and do not decide for yourself that
another pass is warranted; the whole point of asking is that a circling
agent is the last thing qualified to judge whether it is circling. The
priority order for choosing what to fix is in
[the iteration loop](../references/iteration-loop.md).

When it says stop, report:

- what the document is and where it lives
- the parity verdict and any remaining mismatches, honestly
- the paths to `output.pdf` and `output.png`
- that it is waiting for approval

Do not approve on the user's behalf. `approve-template` runs when
they say so.

## Judgement calls

- **Do not open a revision for an ambiguous request.** One clarifying
  question first: which document kind, how many pages, is the sample
  content real or placeholder.
- **First render will not match.** That is expected — the loop is the
  method, not a fallback for a bad first attempt.
- **A reference that cannot be reproduced is a report, not a bodge.**
  If parity needs an API that does not exist, stop with
  `GRAPHCOMPOSE_API_LIMITATION` naming the API and what was tried —
  rather than faking the appearance with hardcoded offsets that will
  break on the next content change.

## Related

- [`../references/workspace.md`](../references/workspace.md) — roots, version, skill pack
- [`../references/authoring-rules.md`](../references/authoring-rules.md) — the non-negotiables
- [`../references/iteration-loop.md`](../references/iteration-loop.md) — bounds, failure categories
- [`../review-template/SKILL.md`](../review-template/SKILL.md) · [`../revise-template/SKILL.md`](../revise-template/SKILL.md) · [`../approve-template/SKILL.md`](../approve-template/SKILL.md)
