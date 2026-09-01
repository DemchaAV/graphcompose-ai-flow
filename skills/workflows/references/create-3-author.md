# Create, phase 3 — author the template

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
