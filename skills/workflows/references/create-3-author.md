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
timeline, an overlap — not because the kind usually does. Grep
`00-api-surface.md` for each builder you are about to call rather than
reading it; `node scripts/api-query.mjs --query <topic>` answers the same
question from the jar.

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
   node scripts/api-query.mjs --query footer
   ```

   The allow-list is generated from the pinned artifact's class files, so
   absent means it does not exist. Members Lombok generates (`builder()`,
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
