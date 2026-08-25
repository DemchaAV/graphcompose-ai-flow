# Link integrity

The visual loop compares two images. A link annotation has no pixels, so
the loop is structurally unable to see whether a document's links work.
A CV whose every contact is dead text diffs identically to one where
they all resolve — same glyphs, same accent colour, same underline, zero
mismatch.

That is not a hypothetical. It is what both acceptance runs shipped.

## What the two runs actually did

Read back out of the rendered PDFs, revision by revision:

```text
serif-headline-cv   revisions 001-010   0 link annotations
                    revision  011       8 annotations, 4 targets
navy-sidebar-cv     revisions 001-008   0 link annotations   (approved, published)
```

Two different failures, one per stage of the chain.

**serif** recorded the targets and never rendered them. By the end,
`cv-data.json` carried four hrefs — `mailto:`, a `tel:`, LinkedIn,
GitHub — and the Java drew the `value` beside each one as ordinary text.
The contract was explicit and the render broke it. It went live in
revision 011, the last one, after the user asked.

**navy** never recorded them at all. `your.email@gmail.com` and
`linkedin.com/in/yourname` sit in the data as plain strings with no href
anywhere. Nothing was broken, because nobody ever said there was a link.
The published bundle ships dead contact text to this day.

Neither was caught by review, by the diff, or by publication, because
none of those look at the file that has the answer.

## The check

`scripts/check-links.mjs` reads the link targets back out of the
rendered PDF and compares them to the data spec. `scripts/lib/pdf-links.mjs`
does the reading: a PDF's link annotations are `/Subtype /Link`
dictionaries carrying `/A << /URI (…) >>`, and they live either in the
raw file or in a Flate object stream, both of which node opens with no
dependency.

It is a reader, not a parser. It does not resolve the object graph, so
it cannot say *which* text carries a link — only which targets the
document contains. That answers the question being asked and stays
immune to how the writer laid the objects out.

The two failures above get different treatment, and the distinction is
the whole design:

| Finding | Meaning | Result |
|---|---|---|
| declared but not rendered | the data says `href`, the PDF has no such target | **failure** — the contract was explicit |
| link-shaped but undeclared | a value reads as a URL or an email, no href near it | **warning** — whether it should be clickable is a judgement |

Conflating them would either nag about every phone number or stay silent
on a broken contract. Only the first fails.

Candidates are deliberately narrow — a URL or an email is unambiguous;
a phone number, a street address and a company name are not. Warning
about those trains the reader to ignore the warnings.

## Where it runs

**Every loop pass**, inside `render-and-diff`. It costs no extra model
turn, and a dead link turns a `READY_FOR_APPROVAL` verdict into `REVISE`
with focus `dead-links`. Only READY is downgraded: an already-revising
pass keeps the focus its reviewer chose, and `BLOCKED` stays blocked.

**Before approval**, inside `approve-and-publish`, ahead of any state
change. This is the one defect the person approving cannot have seen —
they are judging the render, where a dead link looks exactly like a live
one — so "the user approved it" is not informed consent about this. The
refusal names the targets and points at the manual path, the same shape
as the `BLOCKED` refusal beside it.

Run it alone when you want just the answer:

```bash
node scripts/check-links.mjs --project <id> --revision <id> [--root <workspace>]
```

Exit 0 clean or nothing to check, 1 a declared href is missing, 2 usage.

## Authoring

The rule is in
[`skills/workflows/references/authoring-rules.md`](../skills/workflows/references/authoring-rules.md):
a field carrying a target must reach the PDF through the link API of
whatever primitive draws it — `addLink(text, uri)` on a flow builder,
`inlineLink(...)` for one run inside a paragraph, `.linkTo(…)` /
`.link(…)` on an image, shape or barcode. A paragraph-level link makes
the whole paragraph clickable; an inline link makes one run clickable.

The data side is in the create workflow: every address is a pair.

```json
{ "value": "linkedin.com/in/alexmorgan", "href": "https://www.linkedin.com/in/alexmorgan" }
```

The reference cannot tell you this — a screenshot of a clickable link
and a screenshot of dead text are the same pixels — which is exactly why
it has to be asked for while the reference is still being read, and
checked from the file afterwards.
