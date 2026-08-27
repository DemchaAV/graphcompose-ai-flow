# Telemetry

What a run cost, in terms comparable to the next run.

The first acceptance run produced one number — "about an hour, roughly 240k
tokens". Enough to say the harness works; not enough to say whether a change
made it better, which correction was expensive, or what a cache-read
reduction is worth.

## What it reports

Three clocks, because they answer different questions:

| clock | measures from | answers |
|---|---|---|
| cycle | the user's last message | what this correction cost |
| run | `run-metrics start` | what producing this template cost |
| session | the host session's first line | what the sitting cost |

Five token figures, never one total:

```text
input · output · cache read · cache write · processed
```

A single total is dominated by cache reads. In one real session: 843k output
against 443M cache read. Reported together, a sixfold cache reduction would
be invisible next to a 5% output increase.

Counters are **derived from the workspace**, not accumulated: revisions,
renders and visual reviews are counted from what is on disk, so no tool has
to remember to increment anything and a counter cannot drift from the
artifacts it describes. There is no "build failures" figure because nothing
records one in a form that could be counted honestly.

## How it fits together

```text
hooks/hooks.json          SessionStart · UserPromptSubmit · Stop · SubagentStop · SessionEnd
                          (Gemini: SessionStart · BeforeAgent · AfterAgent · SessionEnd)
   ↓
claude-hook.mjs           the host's entry point; gemini-hook.mjs is the same, with
gemini-hook.mjs           Gemini's event names translated
   ↓
checkpoint.mjs            writes checkpoints. Decides nothing, calls no model, always exits 0.
   ↓
~/.graphcompose-flow/telemetry/<session>.json
   ↓
run-metrics.mjs           reads the transcript on demand and reports
   ↓
<workspace>/projects/<id>/telemetry/run-*.json     (on finish)
```

Session state lives outside any workspace: a session can begin before a
workspace exists, outlive one, or touch two.

```bash
node scripts/telemetry/run-metrics.mjs start  --project navy-sidebar-cv --workflow create-template
node scripts/telemetry/run-metrics.mjs report --project navy-sidebar-cv --status READY_FOR_APPROVAL
node scripts/telemetry/run-metrics.mjs cycles
node scripts/telemetry/run-metrics.mjs finish --project navy-sidebar-cv
```

## Two things that are load-bearing

**Deduplication.** A Claude transcript writes one request across several
assistant lines — a real session held 1699 lines carrying usage and 846
distinct request ids. Summing the lines doubles every figure, and a doubled
figure looks plausible. `providers/claude-code.mjs` counts by `requestId`.

**Never failing.** A hook that throws blocks the turn it was measuring. The
hook swallows every error and always exits 0, and the workflow skills say to
carry on when a report is unavailable. A workflow that stopped because a
measurement failed would be worse than one with no measurements.

## Accuracy

The host writes its transcript asynchronously, so a report printed before the
final response cannot include that response. The `Stop` hook closes the
cycle, which makes the *previous* cycle exact on the next turn. Reports say
so rather than presenting a partial figure as final.

## Other hosts

`core.mjs` is host-independent — clocks, counters, formatting, and the fold
that turns parsed usage events into one window's totals. Only *parsing* is
host-specific, because only the host knows where its transcript is and what is
in it. Which provider runs is not guessed at: the checkpoint writer records
`host` in the session state, and `run-metrics` reads it.

`providers/gemini.mjs` is implemented. Gemini writes one JSON document per
session with a `tokens` block on every model message, and three of its
conventions differ from Anthropic's — `cached` is part of `input` rather than
additional to it, `thoughts` is billed as output but reported separately, and
there is no cache-write figure at all. The provider maps all three explicitly;
the file says why each way round.

`providers/codex.mjs` is a named seam and says plainly that it is not
implemented; it returns nulls rather than zeros, because a run that looks
free invites the wrong conclusion.
