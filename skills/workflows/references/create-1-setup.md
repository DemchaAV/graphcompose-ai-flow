# Create, phase 1 — set up

Everything deterministic about where you are and what you are about to
run, before anything is designed. Each step is a command because each is
a place where two runs of the same request would otherwise diverge.

## Preflight

```bash
node scripts/preflight.mjs --project-dir <java-project> [--project <id>]
```

One call returns the workspace and how it was resolved, the version read
from their build file and the pack it maps to, the scope and stages this
revision routes through, the loop bounds, the loading map as data, what
previous runs learned about this line, and whether the tools are built
(it builds them when they are not). It decides nothing; it removes the
ten to twenty shell calls that used to go into establishing facts.

| exit | meaning | what you do |
|---|---|---|
| `0` | ready | continue |
| `3` | the pinned line has no skill pack | **stop** and say so — authoring against another line's allow-list emits calls that do not compile |
| `4` | not a GraphCompose project | this is not your task |
| `5` | the installed skills are newer than these tools | **stop** and say so; every diagnostic named later would silently be missing |
| `6` | the pin is a `-SNAPSHOT`, which names no single build | put the question to the user, then `node scripts/resolve-version.mjs --accept-build --decision "<which build, and why>"` — the acceptance binds to that jar |

Two things in the payload that are cheap to skip and expensive to have
skipped:

- `skills.startingPoint` — the pack's worked set for this document kind,
  usually four to six files of the sixteen. Load those; load a topic file
  later only when the reference turns out to contain the thing.
- `knowledge.observations` — behaviours previous runs paid to discover,
  shipped and learned in this workspace alike. Read them before the first
  render, not after the third.

## The project, the reference, the first revision

```bash
node scripts/init-workspace.mjs --project-dir <java-project> --project <project-name>
node scripts/import-reference.mjs --project <project-name> --file <the reference the user gave you>
node tools/revision-manager/bin/graphcompose-flow.mjs new-revision "<the user's words>" --project <project-dir>
node scripts/telemetry/run-metrics.mjs start --project <project-name> --workflow create-template
```

`import-reference` takes png, jpg, webp or pdf, keeps the original as
`reference/source.<ext>`, and writes `reference/reference.png` — the one
path every later step reads — rasterising a PDF through the same PDFBox
the render loop uses. Do not copy or convert the file yourself: that is
the one step where two runs end up measuring against two different
images. A multi-page PDF becomes `reference.png` plus
`reference-page-N.png`, and the import sets `render.pages` so the render
is rasterised to match.

The metrics call marks where the run began, so the numbers can separate
"this whole template" from "this one correction". Telemetry never fails
the work: if any of its commands report no session, say nothing and carry
on.

## Settle the page size before anything is designed against it

`import-reference` measures the page and ranks the standards. Its exit
code is the instruction:

| exit | meaning | what you do |
|---|---|---|
| `0` | a standard matched within 1% | build at `page.format`; do not ask |
| `5` | nothing matched, the pages disagree, or the page could not be measured | **stop and ask the user**, then continue |

On exit `5` the output carries the whole question — the measured
dimensions, the nearest standard, what building at it costs in percent,
and the exact `DocumentPageSize.of(w, h)` that keeps the reference's
proportions. Put that choice to the user in their own terms and wait. Do
not pick the nearest standard yourself and do not proceed on A4: both are
defensible, they produce visibly different documents, and only the person
holding the source knows which one it is. Record the answer once:

```bash
node scripts/page-size.mjs --project <project-name> --use <A4|LETTER|LEGAL|WxH> --decision "<what you asked and what they said>"
```

Why this is a gate: `visual-diff --scale-reference` resamples the
reference to the render's exact width **and** height, so a page built at
the wrong proportions is stretched to fit immediately before the pixels
are compared. The diff reports parity, the review reads a stretched
reference, and every ratio built on the page is faithfully wrong. Five of
sixteen real projects were built at A4 from a 1.50-aspect reference after
the tool had said "ask"; the loop now refuses to aim at a region while
this is open (`page-size-unsettled`), so it has to be answered anyway —
answer it here, once.

Carry the measurement into `visual-analysis.json` — `page.format`,
`page.orientation`, `page.referencePx`, `page.aspect`, `page.sizePt`,
`page.sizeSource`, and `page.sizeDecision` when the user decided. The
schema requires them, and this is the one thing in the analysis copied
from a measurement rather than read off the image.

## Print the chain, open the live file

`node scripts/run-pipeline.mjs <project-id>` prints the stages this scope
runs; do not retype them from memory.

After the first successful render — not now, and once per project —
`node scripts/preview-live.mjs --project <project-id>` opens
`<project>/current.pdf` in a viewer that reloads on change (SumatraPDF);
every later render then refreshes in place. Name the path on the first
handoff and not again. If it reports nothing to open, carry on and name
the path instead.
