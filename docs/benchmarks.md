# Benchmarks

How this harness measures whether a change made it faster, and what the
baseline is. The rule that produced every optimization so far: **measure
first, then change** — three of the four shipped optimizations came out of
one telemetry read of one real run, and the fourth (the probe cache) began
by timing where a probe's six seconds actually went.

## Baseline v1 — serif-headline-cv, 2026-08-24

One real run in Claude Code, recorded by the harness's own telemetry.
The canonical numbers live in [`site/src/data/runs.json`](../site/src/data/runs.json)
and on the [README](../README.md#what-it-produces); a contract test keeps
the two in agreement, so this page deliberately does not repeat them —
the shape is what matters here:

```text
create from the reference   ~68 min · 211 requests   (the bulk of everything)
each correction              ~7-10 min · 32-39 requests  (~1/10 of create)
approve                      ~2 min · 11 requests
```

What that run did NOT have, because it ran on `0.5.0-beta.9`-era code:
recorded observations (it spent revisions discovering library behaviours
now on record), `preflight` (it opened with a dozen fact-finding calls),
the probe build cache, JSON-only artifacts everywhere, `crop-region`,
and all three composites (`approve-and-publish`, `render-and-diff`, the
one-call loop pass).

Caveat recorded at the time: the run's third correction happened in a
separate session and is not in the four cycle rows.

## The protocol for the next baseline

The point of v2 is to price what the optimizations bought. For the
comparison to mean anything, everything but the harness version must be
held still.

**The version under test is 0.12.0.** What it has that v1's run did not,
in the order the run will meet them:

| | v1 (0.5.0-beta.9 era) | 0.12.0 |
|---|---|---|
| opening | a dozen fact-finding shell calls | `preflight` |
| API questions | grep a 126 KB Markdown | `api-query` against a JSON surface read from the pinned jar — 357 types, and the Lombok members v1 could not see at all |
| library surprises | improvise a probe | `observations find <symbol>` — seven behaviours on record, four of them from CV work |
| a loop pass | 3–4 model turns | one `render-and-diff` |
| the workspace | authored by hand | `init-workspace` + `import-reference` + `scaffold-runner` |
| approval | 11 requests | one `approve-and-publish` |
| a document that flows | one page, measured once | an overflow fixture and `check-document-integrity` |
| dead links | noticed by the user, afterwards | `check-links` inside the loop pass |

Two of those are the ones to watch. `api-query` and `observations find`
should show up as **fewer requests**, because they replace search with a
question. The composites should show up as **fewer requests per
correction**, which is the ratio v1 measured at about a tenth of create.
Neither should move the model's own thinking much, so a large drop in
wall clock would be the surprising result, not the expected one.

1. **Same reference** — `serif-headline-cv`'s `reference.png`, unchanged.
2. **Same opening sentence**, verbatim, with the image attached:
   `Создай темлейт GraphCompose с этого референса`.
3. **Fresh project id** in the same workspace (`serif-headline-cv-v2`),
   so the old revisions cannot leak in as context.
4. **A fresh session**, so nothing is inherited.
5. **No steering** until the loop stops and asks — corrections only
   after that, phrased as observations, exactly as in v1.
6. Record the harness version (`package.json` — 0.12.0 at the time of
   writing), and afterwards run:

   ```bash
   node scripts/telemetry/run-metrics.mjs cycles
   node scripts/telemetry/run-metrics.mjs finish --project serif-headline-cv-v2
   ```

   `finish` archives the run into the project's `telemetry/`, which is
   what makes runs comparable later without keeping terminals open.

Compare per cycle, not per total: create-vs-create and correction-vs-
correction. The totals mix in how much steering the human chose to do,
which is not the harness's variable.

Fill this in from `run-metrics cycles`, so the comparison is arithmetic
rather than impression:

```text
                 v1 create      0.12.0 create     delta
wall clock       68 min         ?                ?
requests         211            ?                ?
output tokens    280.4k         ?                ?
cache read       61.0M          ?                ?

                 v1 correction  0.12.0 correction delta
wall clock       7-10 min       ?                ?
requests         32-39          ?                ?
```

One caveat that is honest rather than defensive: four of the seven
recorded observations came out of CV runs, so a CV benchmark gets a real
head start that a first-of-its-kind document would not. That is a
property of the harness and belongs in the measurement — but it is why a
single v2 number should not be read as "the harness is N% faster at
everything".

## Pre-diagnostics corpus baseline — 2026-08-26

A second kind of baseline, for a different question. The v1/v2 pair above
prices one *run*; this counts the *corpus*. The layout-diagnostics work —
a real layout snapshot out of the engine, an inspector, a diff, evidence
packages — is an investment, and the only honest way to find out
afterwards whether any of it helped is to have written down what things
looked like first, with a date on it.

Recount it at any time:

```bash
node scripts/telemetry/run-metrics.mjs baseline
```

It needs no session, which is the point: a run report can only be
produced while the hooks are running, so it cannot be re-derived later.
This can, by anyone, on a machine that never saw the work.

**The reproducible figures** — the six projects this repository tracks,
so a clone can check them:

```text
projects                  6
revisions                19
renders                  18
FAILED revisions          1
revisions editing Java   15
inset churn / revision    5.42   (mean of per-project means)
structural smells         2
negative insets           1
```

Per project, where there is anything to count:

| project | revisions | renders | Java edits | churn | smells |
|---|---|---|---|---|---|
| `cv-reference` | 9 | 9 | 7 | 3.25 | 1 |
| `invoice-reference` | 3 | 3 | 2 | 0.5 | 1 |
| `noir-corporate-cv` | 7 | 6 | 6 | 12.5 | 0 |

`cover-letter-reference`, `proposal-reference` and `skill-fixtures` hold
no revisions and contribute nothing but their names.

**The local corpus is larger and is not reproducible.** This machine also
carries five untracked projects — `charcoal-gold-cv`, `mocha-profile-cv`,
`navy-executive-cv`, `olive-curve-invoice`, `wilma-flintstone-cv` —
which take the same counts to 11 projects, 53 revisions, 52 renders, 44
Java edits, 5 structural smells and 2 negative insets. Quote the tracked
figures when comparing across machines; quote the local ones only against
another measurement on this machine.

### The two headline metrics are not in there, and that is deliberate

The point of the diagnostics work is that a mismatch should be traced to
its owner rather than guessed at. The two numbers that would show it:

- **visual mismatch → correct owner identified on first attempt**
- **average renders per geometry correction**

Neither is derivable from what a revision leaves on disk. Both need the
loop to record, per pass, which region it was trying to fix and which
property it changed — instrumentation that arrives with the layout diff
and the evidence packages. `baseline` reports them as `null` rather than
approximating them, because a number that is nearly the thing you wanted
gets quoted later as if it were the thing.

`collateralNodesPerRevision` is **computed** as of the layout diff: for every
pair of consecutive revisions where both sides carry an engine-written snapshot,
it counts the nodes that moved with no edit in that revision to explain them,
and averages. `collateralComparablePairs` is reported beside it, because an
average over one pair and an average over eight are not the same claim.

It still reads null across the whole corpus today, and for a reason worth
stating rather than hiding: **no project yet has two consecutive revisions that
both carry a real snapshot.** Only the newest revision of one project was
rendered after the snapshot writer landed, and the five older files that look
like snapshots are the illustrative ones — they parse as JSON, carry no `nodes`,
and are refused rather than counted. A refused pair contributes nothing instead
of a zero; a zero here would read as "nothing moved unexpectedly", which is the
opposite of "we could not look".

The number fills itself in on the next project that renders twice.

### One metric to stop expecting anything from

**Repeated geometry literals will not improve, and should not be the
headline.** The whole tracked corpus contains two, and the whole local
corpus five. Most of them sit in APPROVED revisions, which are immutable,
and in two published bundles that are rewritten from those revisions on
every publish. There is almost no room to move, so a flat number here
means nothing either way — it is recorded to catch a *regression*, not to
demonstrate a win.

What the authoring rules and the lint are for is the code written next.
That shows up in the two headline metrics above, once they can be
measured at all.

## What to expect, honestly

The composites remove turns, not thinking: the model's own generation
(roughly half of it thinking) dominated v1's wall clock, so the realistic
near-term win is fewer requests and a materially faster correction path —
not a 3× create. If v2's create lands at 40–50 min with corrections at
2–4, the optimizations did what they claimed. If it lands unchanged, that
is a finding, not a failure of the protocol — write it down and look at
where the requests went, the same way v1 was read.
