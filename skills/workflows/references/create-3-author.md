# Create, phase 3 — author the template

## Start from the handoff, not from the conversation

```bash
node scripts/handoff.mjs show --project <id>      # the five inputs, by path
node scripts/handoff.mjs verify --project <id>    # still what the barrier passed?
```

Phase 2 ended by recording `handoff.json`. It names the five files
authoring reads and the hash each had when the barrier passed them. That
is the whole input: **the discovery conversation is not one.** Everything
in it that authoring needs is already in those files, and everything else
— the measurements, the reference crops, the reasoning that produced the
plan — is how they were made, not what they say.

`verify` exits 1 when an artifact has changed or gone since the handoff
was written. That is worth knowing before the Java, not after: a stale
handoff still looks like durable state, and authoring against a plan
someone has since edited fails later and somewhere else.

## Cross the boundary: hand authoring to a fresh context

**On a host with subagents this is the instruction, not a suggestion.**
Claude Code: declare it, then spawn **exactly one** `Agent`, and do not
write the template yourself.

```bash
node scripts/handoff.mjs request --project <id> --mechanism Agent
```

Then one `Agent` call whose entire prompt is the author's contract plus
its task. Get the contract from the tool rather than retyping it:

```bash
node scripts/check-analysis.mjs --contract author
```

and hand the worker that, followed by:

```text
node scripts/handoff.mjs claim --project <id> --by <your agent name>

Run that first: it prints the five artifact paths that are your only
inputs, and it records that this context — not the coordinator — is
doing the authoring.

Then write generated-template.java and the spec provider, and report one
line when it compiles.
```

Give it nothing else. **Not** the discovery conversation, not the worker
transcripts, not a summary of the analysis — the five files say all of
it, and anything you paste in is the cost this boundary exists to avoid.

**The contract's negative half is the part with a measurement behind it.**
The first fresh authoring context started at 43.8k and reached 333.7k in
131 requests; its opening moves were `cat` of the whole
`authoring-rules.md`, then whole pack pages, then a harness source file,
then another project's revision. It released 167.4k at the boundary and
read most of it back — the same carry cost, one phase later. So the
contract names what not to load *by default*, and
`handoff.mjs escalate --read <path> --because <what the narrow tool could
not answer>` is how a genuinely needed page gets read and recorded. A
considered read and a habit are indistinguishable in a transcript; only
one of them is willing to say why.

Three earlier versions of this page said authoring "may", then "must",
run in a fresh context, and three real runs authored in the coordinator
anyway: 3 subagents each time, context climbing 283k → 348k and 253k →
299k straight through. Neither word was the problem. A page that names a
*state* gives a host nothing to execute; the fan-out below works because
it names the call. `handoff.mjs status` is what says whether this
actually happened — `written` is not `taken`.

**On a host without subagents**, carry on in this context. Concurrency is
an optimization; correctness does not depend on it. Say so in the report
rather than pretending the boundary was crossed.

It is the *only* boundary in the create chain. The author/render/revise
loop that follows keeps one context on purpose: each pass is a correction
to the one before it, and restoring that from disk every time would cost
more than carrying it.

## Then check that what you are about to read is finished

```bash
node scripts/check-analysis.mjs --project <id> --for authoring
```

**Exit 1 means do not start.** Re-run whatever it names; do not work
around it and do not begin the Java while it is red. (A handoff exists
only because this was clear when phase 2 ended; run it again when you are
resuming, or when `verify` reported a change.)

It is not only a sentence. `render-and-diff` runs this same barrier
before it compiles a first render and fails the pass while it is red
(`config/pipeline.json`, `barriers.analysis`) — so skipping it here
moves the same answer to after the Java is written, which is the
expensive place to hear it.

This barrier exists because phase 2 no longer runs in a line. Asset
resolution starts the moment the request validates and runs beside the
architecture plan, and the plan usually finishes first — so "the plan is
written" no longer means "everything authoring reads is ready". Starting
here on a manifest still being written gives a template that references
assets which are not there yet, and the failure arrives later as a
missing icon rather than as a race.

It checks three things phase 2's own barrier does not: the plan
validates, the manifest validates, and every icon token and font role
the request asked for has a record in the manifest. That last one is the
disagreement no schema can see — both files can be perfectly shaped and
still leave a token unresolved, and the template then has nothing to
read for it.

Write the template from the plan, following
[the authoring rules](authoring-rules.md) throughout: derived geometry,
named anchors, layout on the node that owns it, content in
`<doc-kind>-data.json` behind a typed spec, one named render method per
visible region, no invented API. The rules are the difference between a
template someone can maintain and a drawing that happens to look right
once; they are not restated here.

## What to load

The loading map (`skills.startingPoint` in the preflight payload, or the
pack's `00-loading-map.md`) names four to six files for this document
kind. Load a topic file because the reference has the thing — a table, a
timeline, an overlap — not because the kind usually does. Ask the pack
about each builder you are about to call rather than reading or grepping
it: `node scripts/api-query.mjs --search <topic>` answers the same
question from the jar, in a few lines.

### When the pinned line has no prose

A pack imported from a GraphCompose knowledge bundle carries `api/`,
`routing/` and `claims/` and no pages at all. Preflight says so —
`skills.knowledgeOnly: true`, `loadingMap: null` — and names the nearest
**older** line that has prose under `skills.guidance`. Read that, with
two rules:

1. **The pinned line's allow-list is still the authority.** Verify every
   call with `api-query --version <pinned line>` before you write it. The
   borrowed pages are how-to, never a statement of what exists — which is
   why the allow-list is the one file `guidance.startingPoint` drops.
2. **Older prose can teach a construction the pinned line has replaced.**
   That is the bounded risk of borrowing downward, and `--task` is the
   cheaper answer where a route exists: it is generated from the pinned
   line, so it cannot describe a superseded path.

Never read a *newer* line's prose for an older pinned line. Preflight will
not offer it, and it would name API the pinned line does not have.

## Containers are already measured — build to the numbers

`visual-analysis.json` carries `shapeOwnership` and `icons`, and the plan
says which of your render methods owns each one. Those are measurements,
not suggestions: do not re-decide a radius or a width by eye from the
reference, and do not soften one because the render "looks about right".
The barrier already refused a plan that left a measured container
unclaimed, so every id you were given has your name against it.

| The analysis says | You write | Getting it wrong looks like |
|---|---|---|
| `cornerRadiusRatio` | radius = ratio × the box's **shorter side**. 0.09 on a 32px box is ~3px | 0.09 built as a capsule — the error this contract exists to stop |
| `shape: pill` | and only then radius = height ÷ 2 | every rounded box becoming a capsule |
| `sizing: fill-parent` | a container that spans its parent's content width | ten boxes shrinking to ten different widths |
| `sizing: hug-content` | a container that wraps its content | a short label stretched across the column |
| `fill.present: false` | **no fill at all** — the ground shows through | a white box painted over a coloured panel |
| `stroke.present: false` | no stroke — not a zero-width one, and not one in the background colour | a hairline nobody asked for (see the note below) |
| `padding` per side | each side separately | content optically off-centre |
| `gap` | between children; `padding` is the frame | one number doing both jobs badly |
| `icons[].sizeRelativeToText` | icon height = ratio × the adjacent text height | 1.45 emitted as a text-sized inline glyph |
| `icons[].inline: false` | its own child, positioned independently | an independent icon dropped into a text run |

Ratios are against the container's shorter side; resolve them once into a
named constant rather than sprinkling the arithmetic.

**"No stroke" is not a stroke you cannot see.** A zero-width stroke, or one
in the page colour, still paints — on a tinted panel it leaves a pale band
around every box. If `stroke.present` is false, emit no stroke.

## Before you choose a primitive, ask for the route

The surfaces say what exists. They cannot say which of three ways is the
right one, and that is where wrong-API choices come from — a skills list
in two columns is a row with weights, and nothing in a signature says so.

```bash
node scripts/api-query.mjs --tasks                      # every intent it answers
node scripts/api-query.mjs --task layout.two-columns    # the decision for one
```

1. **Ask routing first.** Exit 3 means no route for that intent; fall
   through to `--search` and choose as before.
2. **Take `recommended` when there is one.** `alternatives` say when the
   other ways are right and what each costs; take one only when its
   `useWhen` is your case, and say which in the architecture plan.
3. **Honour `constraints`.** They are named engine behaviours, not
   advice — `row.rejects-a-nested-row` is a rejection, not a preference.
4. **Verify `symbols` before you call them.** A route names the symbols;
   `--exists` confirms them against this line. A route from an older pack
   can name a symbol this version does not have.
5. **`docs` is an anchor, not a file you have.** Those paths live in the
   GraphCompose repository, and the answer says so. The decision is in the
   route itself — do not go looking for the page.

Routing arrives with a GraphCompose knowledge bundle
(`tools/api-surface/import-bundle.mjs`). A pack that predates it says so
and names that command; that is not an error to work around, it means
this line has no routing table and step 1 falls through.

## When the library surprises you

**In this order, and stop at the first one that answers.** Writing a page
of Java to find out how something behaves is the last step, not the first.

1. **Has a previous run already paid for this?** Ask by the symbol you
   are about to call:

   ```bash
   node scripts/observations.mjs find DocumentTableCell.node
   ```

   Exit 0 with what is known and what to do instead; exit 3 means nothing
   is on record. An entry marked **ENGINE DEFECT** is a fault in this
   version with a workaround attached — use the workaround, and do not
   carry it into a later line without re-running its probe there.

2. **Does the API exist, and with what signature?**

   ```bash
   node scripts/api-query.mjs --exists TimelineBuilder.entry
   node scripts/api-query.mjs --search footer
   node scripts/api-query.mjs --surface authoring --search footer   # bundle packs
   ```

   The allow-list is generated from the pinned artifact's class files, so
   absent means it does not exist. On a bundle-imported pack the answer
   also carries `surface` and, when it is not stable, `stability`: a
   `[beta]` member is callable and its contract may still move, and a
   symbol outside `authoring` is not yours to call from a template. Members Lombok generates (`builder()`,
   getters, nested `…Builder` types) are in it; a value type with no
   visible constructor is still constructible through its builder.

3. **Is there already a probe for it?** `node scripts/probe.mjs --list`,
   then `node scripts/probe.mjs <name>`. A probe answers "how does
   GraphCompose behave?" by running it — against the build this workspace
   resolved.

4. **Only now, write one.** In `tools/diagnostics/graphcompose-<line>/`,
   not as a one-off in the project: one question, measurements, a finding,
   re-runnable by anyone. Record what it found with `node
   scripts/observations.mjs record <file.json>` — into the workspace, never
   the install tree, which is replaced on upgrade.

Skipping steps 1–3 is the single most expensive habit available here: the
answer is usually on disk, and rediscovering it costs a build, a render and
several turns.

## Apply a small change in a small way

Edit the file directly, with the editor the host gives you. A throwaway
patch script is model output, and a 9 KB patcher to move one padding
value costs more than the edit it performs — one run wrote five of them,
nearly 30 KB, to change a handful of lines. Reach for a script only when
the rewrite is genuinely repetitive across many sites. The Bash guard
refuses inline-script patches of Java for this reason.

Read the template through the harness, not the shell: `node
scripts/source.mjs outline` lists every method with its line range for
about a fortieth of the file; `symbol <name>` returns one with its
Javadoc — which is where this harness records *why* a constant has its
value. (Measured over one run: `sed` and `cat` returned 48k tokens across
35 calls, all hunting for one method.)

## Compile and render

That is phase 4's first step: `node scripts/pass.mjs --project <id>`. A
compile error comes back on that screen with the compiler's own line, not
the resolver's chatter — do not re-run the render by hand to read it.
