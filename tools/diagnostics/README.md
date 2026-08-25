# Diagnostics

Probes that ask the library how it behaves, so an agent does not write Java
to find out.

```bash
node scripts/probe.mjs --list
node scripts/probe.mjs anchor-alignment --version 2.2
node scripts/probe.mjs anchor-alignment --json
```

## What a probe is

One question, the smallest arrangement that settles it, and the numbers.
Each prints a single JSON object: measurements plus a `finding` **derived
from them**, never asserted. A probe that hardcodes its own conclusion
cannot report that the library changed under it, which is the main reason to
keep it around.

A refusal is an answer too. `row-nesting` and `timeline-nesting` both expect
the layout compiler to throw, catch it, and report the message — which in
GraphCompose usually names the supported alternative.

## Available for 2.2

| probe | question |
|---|---|
| `anchor-alignment` | Does a shape container centre a child taller than itself, or clamp it to the top? |
| `row-nesting` | Does a row lay out horizontally in a plain flow, in a LayerStack layer, and in a row cell? |
| `shape-paint` | Does a container paint its fill at its layout box, and does a bottom margin displace it? |
| `timeline-nesting` | Can `addTimeline(...)` be used inside a row cell, as a two-column page requires? |

`shape-paint` is the only one that renders. That is deliberate: its failure
mode is precisely that the layout is right and the painting is not, so a
layout snapshot cannot settle it.

## One project per line

```text
tools/diagnostics/graphcompose-2.2/
```

A probe is real code against one API, and its answer is only true of the
build that ran. Probes are not shared across lines; a new line gets its own
project, and the ones that still compile are ported into it. Bumping
`graphcompose.version` in a project's `pom.xml` re-runs every probe against
a new build, which is how an observation gets re-confirmed or retired.

The build is cached by `scripts/probe.mjs`, not left to Maven. Warm, `mvn
compile` still costs about 3 s and resolving the classpath about 3.6 s,
against 0.7 s for the probe itself — and `observations verify` runs one
probe per observation, so it used to pay both every time.

A cached run is about 0.7 s. Both steps are skipped only on evidence: no
source newer than the newest class, and a classpath resolved from the
pom's current **contents** whose every entry still exists. Contents
rather than timestamps, because a commit or a branch switch rewrites
`pom.xml` and a timestamp key threw the cache away after every ordinary
git operation.

`--refresh` forces a full rebuild. The cache lives under `target/`, which
git already ignores.

## What does not belong here

A probe that composes *your* template. The acceptance run also wrote a
`LayoutProbe` that laid its own CV out on an over-tall page to see which
block grew — genuinely useful, and specific to that document. Keep that kind
in the project. This directory is for questions about the library.

## Relationship to observations

A probe settles a question; an [observation](../../observations/README.md)
records the answer with the numbers, and `observations verify` re-runs the
probe to check it still holds. Probes are the evidence; observations are the
memory.
