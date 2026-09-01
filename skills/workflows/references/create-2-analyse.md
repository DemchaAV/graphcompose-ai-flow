# Create, phase 2 — analyse the reference

Three artifacts describe the reference before any code exists:
`visual-analysis.json`, `<doc-kind>-data.json`, `asset-request.json`.
Then `architecture-plan.json` maps the analysis to primitives. Write the
JSON only; the readable `.md` twins are generated (see the end).

## Measure first, in one call

```bash
node scripts/reference.mjs analyze --project <id> --json
```

Page size and margins, the palette by coverage, every rule, the columns
with their gutters and share of the page, and the text bands **per
column** — about 5 KB, no window, no judgement. These are the questions
you have before you have read the document, which is why one call answers
them all. Bands are cut per column because a whole-page scan merges two
columns at overlapping heights into one run; a column inked edge to edge
comes back `separable: false` rather than as one meaningless band.

**Independent measurements go in one call.** A run's bill is its turn
count multiplied by its context, and every turn re-reads the whole prompt.
When the next thing to learn does not depend on the last thing learned,
learn them together: `reference.mjs` takes `--window` repeatedly;
`probe.mjs`, `javap` and a grep over the API surface can be one command.
Anything whose *result changes what you would ask next* stays its own
call. (One reference-analysis stage measured 61 calls, most a single
measurement each; one run spent 35% of its wall clock composing 76 one-off
measurement scripts for under five minutes of computation.)

## Fan the analysis out

The three artifacts describe the same reference and do not read each
other. **On a host with subagents, produce them concurrently** — this is
the instruction, not a suggestion. Claude Code: one message carrying
three `Agent` calls. A host without subagents does the same three in the
order below, and nothing else changes.

The earlier wording said three subagents *can* produce them, and a real
0.22.0 run read that as permission and went serial. Permission is not an
instruction, and the serial reading is the expensive one: these three are
the whole of discovery, and everything after them waits.

| Subagent | Owns, exclusively | Reads | Done when |
|---|---|---|---|
| geometry | `visual-analysis.json` | the reference + its schema | validates against [`visual-analysis.schema.json`](../../../schemas/visual-analysis.schema.json) |
| content | `<doc-kind>-data.json` (+ `data-schema.md`) | the reference only | parses, and every field the spec requires is present |
| assets | `asset-request.json` | the reference + the request format | validates against [`asset-request.schema.json`](../../../schemas/asset-request.schema.json) |

Each writes only its own files — two writers on one file is a merge
conflict with no merger. Each gets the reference and its task, **not**
this conversation. Its reply is one line ("wrote visual-analysis.json, 9
regions"); the parent reads results from disk.

### The join is on validated artifacts, not on files existing

```bash
node scripts/check-analysis.mjs --project <id> [--revision <id>]
```

Exit 0 means all three are complete and the architecture plan may start;
exit 1 names which one is not and why.

A file exists the moment a subagent starts writing it, and a truncated
or half-shaped artifact is worse than a missing one: the next stage
reads it, believes it, and plans around a document it has only half
seen. So the barrier is *validates*, not *is there*.

An artifact that fails validation is re-run, not patched around, and no
later stage starts until all three pass. The render loop that follows is
serial by nature; do not parallelise it.

## `visual-analysis.json` ([schema](../../../schemas/visual-analysis.schema.json))

Describe the page in **ratios and dependencies, not pixels** — with one
exception: the `page` block carries the measurement from phase 1.

- **Every region has a stable kebab-case id and `bounds: {x, y, w, h}` as
  page fractions.** Every later artifact addresses regions by id; the
  bounds are what make a region croppable and measurable. A region without
  bounds cannot be evidenced, and the tool refuses rather than guessing.
- **Record relationships, not offsets** — "badge sits at the top-right of
  the avatar". Shape ownership is mandatory for the five cases otherwise
  drawn as free-floating text: initials or icons inside circles, text in
  pills or badges, content in rounded cards, images clipped by shapes,
  badges anchored on a shape boundary.
- **`role` is the contract for how a region may be built.** `page-header`
  / `page-footer` are chrome the engine repeats — they go through
  `DocumentSession.header` / `.footer`; drawn as body content they appear
  on page one and nowhere else. `table` must be `addTable` (rows of shapes
  have no columns to align and cannot break across a page); `table-header`
  needs `repeatHeader`; `image` must be `addImage` and `icon`
  `addSvgIcon`. `check-region-primitives` compares roles to the render
  methods the plan maps them to, and every pass runs it.
- **Decide fixed or flowing, in `flow`.** A one-page invoice *screenshot*
  is not a one-page *document*: the sample shows four line items, real
  data brings thirty. `fixed` means the page is the artifact (CV,
  certificate, poster); `flowing` means content volume is data-driven and
  the layout must paginate — name the growing region in `drivenBy`. This
  field decides three things downstream: `pagination.md` gets loaded,
  furniture maps to chrome, the example data must overflow.
- **Decide whether a missing page has to be detectable, in
  `flow.pageEnumeration`.** Required for a flowing document, and
  `required: false` with a reason is a good answer. An invoice, a
  statement, a proposal or a report is a record someone may print or file;
  a CV or a poster carries no such duty. When required, `"Page {page} of
  {pages}"` in chrome is what carries it:

  ```java
  session.footer(DocumentHeaderFooter.builder()
          .zone(DocumentHeaderFooterZone.FOOTER)
          .centerText("Page {page} of {pages}")
          .build());
  ```

- **Decide the page model for a multi-page reference, in
  `pagination`.** Read every page: a continuation page is not a copy of
  the first — usually no masthead, maybe a repeated header row, the page
  numbering. `pageModel` is `uniform`, `first-page-different` or
  `sectioned`; `firstPageDiffers` says what page one does that the rest do
  not. `DocumentSession.pageMargins(List.of(PageMarginRule.page(1,
  DocumentInsets.zero())))` states margins per page; `flow.addPageBreak(pb
  -> pb.name("afterCover"))` puts a break where the document means one;
  `flow.addSection("Chapter" + i, s -> s.anchor("ch" + i))` names a run of
  pages.
- **List where the flow may not break, in `keepRules`.** `keepTogether`
  keeps a block whole across a boundary; `keepWithNext` stops a heading
  being orphaned above its content or a table header sitting alone at the
  foot of a page. Both are on `SectionBuilder` and `ModuleBuilder`. Neither
  is discoverable from a one-page render, and `check-region-primitives`
  reports a rule the plan decided and the template never built.
- **Set `page.pageCount`** to what the reference-shaped data produces —
  the overflow fixture's count is not a property of the document.
- **Anything you cannot read confidently goes in `unclearParts`** with
  the assumption you are making. A recorded assumption is a question the
  user can answer later; a silent one is a bug with no author.

## `<doc-kind>-data.json`

Every variable string — names, contacts, dates, items — lives here behind
a typed spec; the template carries no content literals.

**Every address gets an `href`.** An email, a profile URL, a site, a
repository: the text as the reference shows it, and the target.

```json
{ "value": "linkedin.com/in/alexmorgan", "href": "https://www.linkedin.com/in/alexmorgan" }
```

A screenshot of a link and a screenshot of dead text are the same pixels.
`render-and-diff` checks the PDF's annotations against this field every
pass; an href you write is a promise the loop holds you to, one you omit
is a link nobody will notice is missing.

**For a flowing document, ship two datasets.** `<doc-kind>-data.json`
mirrors the reference — five line items, not thirty — because that is what
the diff compares. `<doc-kind>-data.overflow.json` crosses a page break —
the only place the page break, the repeated header and the numbering are
ever rendered. `render-and-diff` renders it automatically when present;
without it `pagination-never-exercised` fires. Two defects only the
overflow render shows: a continuation page with no masthead whose first
row starts hard against the paper's edge (needs `session.pageMargins(...)`
with `PageMarginRule.from(2, …)`), and a last row running into the page
number (needs a bottom margin reserving the footer's height).

## `architecture-plan.json` ([schema](../../../schemas/architecture-plan.schema.json))

The spine is `componentMapping`: region → **named render method** →
primitives. Every visible region gets its own method (`renderHeader`, not
`part1`): that name is what review, `changedComponents` and selective
rollback address. Pick the anchor primitives here; derive the base
constants here and record them under `baseConstants` with their
derivation, so a later revision changes one number instead of fifteen.
Every primitive must exist in the pinned pack's allow-list — `node
scripts/api-query.mjs --exists <Type>.<method>`.

## Assets

Write `asset-request.json`, run the resolver, and treat
`assets-manifest.json` as the source of truth for what was fetched — the
format (`svg` or `png`) included; the template branches on it rather than
assuming an extension (see [authoring rules](authoring-rules.md#asset-flow)).

## Reading copies

`visual-analysis`, `architecture-plan` and `visual-review` have Markdown
twins. **Do not write them.** Generate them once per revision, after the
JSON is final:

```bash
node scripts/render-artifact-md.mjs --revision <revision-dir>
```

Anything the schema cannot carry — a paragraph of reasoning, a comparison
with the previous two revisions — goes in the JSON's `notes` array; the
generator emits it verbatim. Two hand-written documents describing one
revision drift, and nothing notices which is wrong.
