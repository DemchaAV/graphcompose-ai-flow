---
skillId: pagination
targetLibrary: GraphCompose
targetVersion: 2.2.x
verifiedAgainst: 2.2.0
status: needs-validation
lastValidated: 2026-08-24
---

# Pagination Skill

Use this skill when the document is expected to span more than one
page, when a table can overflow into another page, when headers and
footers must reappear on every page, or when certain blocks must not
be split mid-content. Pagination is owned by GraphCompose's page-flow
primitive — templates declare intent, the engine performs the breaks.

## When to load

Load this skill whenever any of the following is true for the
reference:

- the reference is multi-page or the data set is expected to produce
  more than one page at render time
- the reference contains a table whose row count is data-driven and
  could grow beyond a single page
- the reference shows the same header or footer on every page
- the reference shows a block (a totals card, a signed agreement
  panel) that should never split across pages
- the analyser flagged "pagination" as a visual risk in
  `visual-analysis.md`

If the reference is strictly single-page and the data is bounded,
load only [`layout-primitives`](layout-primitives.md) and skip this
skill.

## Core rule: let pageFlow handle page breaks

```text
Do not insert manual page breaks when the page-flow primitive can
compute them.
```

GraphCompose's page-flow primitive is the page-break authority.
Templates compose content into a flow and let the engine decide where
pages end. Manually computing page positions is a coordinate-soup
pattern and a defect under this workflow.

Manual page breaks may be acceptable in two narrow situations only:

1. The reference itself shows a forced break (for example "Terms and
   Conditions start on a new page") that is part of the document
   semantics, not the rendering. Express the intent explicitly, not as
   a coordinate hack.
2. A specific atomic block must start on a new page for legal or
   structural reasons. Same rule: express the intent.

Otherwise the engine handles breaks.

## Tables across pages

A table that overflows must:

- repeat its header on every page it appears on
- preserve column proportions across pages
- not produce a single-row fragment on the last page when the row is
  visually part of the block above it
- preserve any zebra-row colouring rhythm if the reference uses it

See [`tables`](tables.md) for the table-builder rules; this skill
covers only the pagination contract.

### Repeated table headers

Repeated headers are not "the header is duplicated". They are the
table header reappearing at the top of every page the table reaches.
The template declares the intent on the table primitive; the engine
draws the header on every continuation page.

A reference that shows the table header only on page 1 is unusual; in
that case the template must explicitly suppress repetition rather
than relying on rendering accident.

### Avoiding orphan rows

A one-row fragment on the last page (one line of the table, marooned
on its own page) is a `MAJOR` mismatch under
[`../../../docs/visual-accuracy-contract.md`](../../../docs/visual-accuracy-contract.md).
Mark the totals row or footer row as atomic with the preceding rows
when the reference reads them as one block. See atomic blocks below.

## Atomic blocks that must never split

Some blocks lose meaning when split:

- a totals card that summarises the table above it
- a signed agreement panel (signature line + name + date)
- a hero card that must appear whole
- a coloured panel whose surface visually anchors its content

Declare these blocks atomic. The page-flow primitive treats atomic
blocks as a unit: if the block does not fit on the current page, the
engine moves the whole block to the next page rather than splitting
it.

Do not declare entire sections atomic just to avoid thinking about
page flow — that produces giant ragged page bottoms. Atomicity is for
blocks whose meaning depends on visual cohesion.

## Atomicity has a granularity, and the section is the wrong one

"Do not declare entire sections atomic" says what not to do. This is what
to do instead, and the difference is which node carries the rule.

Take a CV's experience section. The section is a list; an entry is the
unit whose meaning depends on cohesion. Declaring the section atomic asks
the engine to keep six entries together on a page that holds four —
a request it cannot honour, so it either ignores it or moves the whole
block and leaves a page half empty. Declaring the *entry* atomic asks for
something the engine can always do.

Inside an entry, atomicity is still too blunt: a role with eight bullets
may legitimately continue onto the next page, and only its opening lines
must not be orphaned from each other. That is `keepWithNext`, which
exists on `SectionBuilder` and on `LineBuilder`:

```java
section.addSection("ExperienceEntry", entry -> {
    // Role and period sit above the employer; splitting between them
    // leaves a date stranded at a page foot.
    entry.addSection("RoleLine", role -> {
        role.keepWithNext();
        …
    });
    entry.addSection("Employer", employer -> {
        employer.keepWithNext();
        …
    });
    // The first bullet joins the header. The rest may flow.
    entry.addSection("Bullets", bullets -> { … });
});
```

**Call it inside the consumer, not on the result.** `addSection` returns
the builder you called it on — `T addSection(String, Consumer<SectionBuilder>)`
— so `entry.addSection("RoleLine", …).keepWithNext()` reads like it
keeps the role line with what follows and in fact sets the flag on
`entry`. The child is only in scope inside the lambda, which is where
the rule belongs.

The rule of thumb, in order of preference:

| what | rule | why |
|---|---|---|
| the section holding the entries | nothing | it is a list, and a list may flow |
| one entry, when it is short | `keepTogether()` | it fits, so the engine can honour it |
| role → employer → first bullet | `keepWithNext()` on each but the last | the opening must not be orphaned |
| remaining bullets | nothing | a long entry is allowed to continue |

`keepTogether` on a block taller than the printable area is not a
stronger version of the same request — it is a request with no satisfying
answer, and the engine's choice of how to fail is not something a
template should depend on.

### Group the heading with what it introduces

`keepWithNext` needs a node to attach to, which is why a flat section
cannot express it. A heading, its rule and its body as three siblings
have no name for "the heading and its rule": you can keep the heading
with the rule, and the rule with the body, but the intent — *this header
belongs to this body* — is spread across two calls that a later edit can
separate.

Nest it instead:

```text
Profile
├─ ProfileHeader        keepWithNext()
│  ├─ Heading
│  └─ Rule
└─ Body
```

One node carries the rule, the snapshot has a box for the header as a
unit, and `layout.mjs inspect ProfileHeader` answers about the thing the
designer drew. The flat version gives three boxes and no name for the
one that matters.

**What nothing here can check.** The layout snapshot records where every
node ended up — bounds, insets, pages — and does **not** record whether a
node asked to be kept together. So no gate in this harness can tell a
template that put atomicity at the section level from one that put it at
the entry level; the difference only shows when real content overflows,
which a one-page reference never does. Until the snapshot carries those
flags, this is a rule you follow rather than one you are caught breaking.

## Timelines across pages (1.7.0)

The 1.7.0 timeline primitive (`addTimeline(...)`, see
[`layout-primitives`](layout-primitives.md)) is paginated, not atomic.
The engine breaks between entries, and a single tall entry splits
within itself with the connector rail continuing across the page break.
A long work-history or milestone timeline is therefore allowed to flow
onto the next page — do NOT declare the whole timeline atomic to keep
it together (that reproduces the giant-ragged-bottom mistake above).
Declare only an individual entry atomic if its marker and content must
never separate. Verify, on every continuation page, that the rail
resumes at the top and the marker-to-content alignment holds.

## Vertical budgeting — availableHeight() (1.7.0)

When a composition needs to know how much vertical room a page offers —
to size a sidebar to full height, to decide whether a block fits, or to
split content deliberately — read `DocumentSession.availableHeight()`
(the usable content height: page height minus top and bottom margins, a
one-call alias for `canvas().innerHeight()`). Derive vertical sizing
from it relationally instead of hardcoding a page height; a hardcoded
height breaks the moment the page size or margins change, exactly like
the tail-spacer anti-pattern in
[`backgrounds-and-panels`](backgrounds-and-panels.md).

## Headers and footers across pages

The header and footer of a paginated document are not normal content
rows. They reappear on every page through the page-flow primitive's
header and footer slots, not by being duplicated in the body.

Required behaviour:

- the header reappears on every page at the same vertical position
- the footer reappears on every page at the same vertical position
- page numbers, if shown, advance correctly
- the surface (background or panel) of the header and footer
  reappears as well, not just the text content

If the reference shows a different header on page 1 (a hero header
that only appears once), express that as a page-1-only header
override, not as a manual page break.

## Manual page breaks

A manual page break is acceptable when the reference itself shows the
break as part of the document's structure, not the rendering — for
example "Terms and Conditions begin on a new page". Express it as an
explicit break in the page flow, not as a position computed from
coordinates. The break belongs to the document semantics.

## Required visual checks across pages

Every multi-page revision must verify, on every page:

- the header reappears in the same position and at the same size
- the footer reappears in the same position and at the same size
- the table header reappears whenever the table continues on this
  page
- there is no orphan one-row fragment from the previous page's
  content
- no section title is chopped at the bottom of a page (the title
  must stay attached to its content)
- no atomic block is split across pages
- page numbers, if present, are correct on every page
- backgrounds and panels declared as page-wide redraw on every page
  the reference draws them on (see
  [`backgrounds-and-panels`](backgrounds-and-panels.md))

The Visual Review Agent must walk through these checks page by page,
not only on page 1.

## Pagination snapshot expectations

When the Test + Render Agent produces `layout-snapshot.json`, the
snapshot includes per-page boundaries. Pagination changes must be
visible in the snapshot diff between revisions; a "darker totals row"
revision should not produce a different page break unless that change
was intended.

## Common mistakes

1. **Computing the page height manually and inserting a break at a
   fixed y-coordinate.** Always wrong under this workflow. Use the
   page-flow primitive.
2. **Forgetting to declare repeated table headers.** Default
   behaviour varies; declare the intent explicitly.
3. **Declaring an entire section atomic.** Atomicity is for blocks
   whose meaning depends on visual cohesion, not for spilling-prone
   sections.
4. **Duplicating header content in the body** so it "reappears" on
   page 2. The header slot exists; use it.
5. **Treating an orphan totals row as acceptable** because "it's only
   one row". One marooned row is a `MAJOR` mismatch.

## Known limitations

- Differences in font metrics between renderers can shift the page
  break by a row or two. Document those as `MINOR` mismatches.
- Atomicity is local: a block declared atomic is treated as a unit on
  its own page, but the engine cannot infer atomicity across more
  than one block. Declare each atomic block explicitly.

## Cross-references

- [`tables`](tables.md) — table-builder rules; this skill only covers
  the pagination contract
- [`visual-regression`](visual-regression.md) — diffing rendered
  pages across revisions
- [`layout-primitives`](layout-primitives.md) — the row, section, and
  table primitives that compose the page flow
- [`backgrounds-and-panels`](backgrounds-and-panels.md) — page-wide
  surfaces that must redraw on every page
- [`../../../docs/visual-accuracy-contract.md`](../../../docs/visual-accuracy-contract.md)
  — classification of pagination defects
