---
name: revise-template
description: Change an existing GraphCompose template — content, assets, theme, structure, or a pure refactor — as a new revision with the right gate. Use when the user asks for a modification to a document that already renders: "change the email", "make the header darker", "use Lato", "swap the icon set", "make the sidebar wider", "add a section", "rename that helper", "make it navy". Picks the narrowest scope the change really needs, runs only the stages that scope requires, and proves the result against the gate that scope implies.
---

# Revise a GraphCompose template

The whole craft here is picking the **narrowest** scope the change
honestly fits, because the scope decides both which stages run and what
"correct" is measured against.

## When this applies

The document already renders and the user wants it different. If there
is no template yet, use `create-template`. If they want to know
what is different rather than change it, use `review-template`.

## Steps

**1. Pick the scope.** Read the gesture, then verify it against the
surface the change would actually touch — the table and the
verification rule are in
[scope routing](../references/scope-routing.md). Ambiguity gets exactly
one clarifying question, asked before any revision is opened.

**2. Open the revision.** Never edit the current draft in place; every
change is a new revision.

```bash
node tools/revision-manager/bin/graphcompose-flow.mjs new-revision "<the user's words>" --project <project-dir>
```

Then write `orchestration-decision.json`
([schema](../../../schemas/orchestration.schema.json)) with `intent`,
`scope`, `parentRevision`, and the `stages` + `gate` copied from the
scope's entry in `config/pipeline.json`. Print the chain with
`node scripts/run-pipeline.mjs <project-id>` rather than retyping it
from memory.

**3. Run only what the scope requires.**

| Scope | What you actually do |
|---|---|
| `data-only` | edit `<doc-kind>-data.json`. **No Java.** If Java has to change, the scope was wrong |
| `asset-only` | edit `asset-request.json`, re-run the asset resolver, leave Java alone |
| `theme-only` | edit the theme bundle file only |
| `refactor-only` | change Java structure with zero intended visual effect |
| `visual-change` | analyse the changed region, update the architecture plan, then the code |

For `visual-change`, re-analyse **only the region that changed**. Doing
a whole-document analysis for a sidebar tweak invents differences in
regions nobody touched.

Load skills the same way: the pack's `00-loading-map.md` has a
per-scope row. A `data-only` revision needs no topic file at all; a
`theme-only` needs colours and possibly typography; a `refactor-only`
needs the allow-list for the primitives being moved. Reloading the
whole pack for a one-line change is the cost the map exists to avoid.

Follow [the authoring rules](../references/authoring-rules.md)
throughout: derived geometry, named anchors, no content literals in
Java, no invented API.

**4. Render.**

```bash
node scripts/render.mjs <project-id> <revision-id> [--root <workspace>]
```

**5. Prove it against the gate.** Not "it looks right" — the gate:

- `refactor-only` → `magick compare -metric AE` must be **0 on every
  page** against the parent. Quote the number. A refactor that changes
  one pixel is not a refactor; either it was a `visual-change` all
  along, or the refactor has a bug.
- `data-only` / `asset-only` → affected regions may differ; every other
  region must be `AE == 0` against the parent. A stray difference
  outside the affected regions means the edit reached further than the
  scope claimed.
- `theme-only` / `visual-change` → layer-by-layer review against the
  reference (use `review-template`).

**6. Iterate or stop — and ask, do not estimate.** After the review,
run:

```bash
node scripts/iterate-status.mjs <project-id> [--root <workspace>]
```

Exit 0 means ready (stop and report), 2 means fix the **one** mismatch
it names and go round again, 3 means blocked (stop and report the
`failureCategory`). Reuse a mismatch id when the problem survives a fix:
that repetition is what the tool counts. See
[the iteration loop](../references/iteration-loop.md).

**7. Record what moved.** `changedComponents` on the revision lists the
render methods actually touched. This is what makes selective rollback
work later ("keep the new awards but restore the old header").

## Judgement calls

- **When the scope stops fitting mid-flight, stop and say so.** A
  `data-only` edit that turns out to need a new row is a
  `visual-change`; opening the correct scope is cheap, and a gate
  applied to the wrong baseline silently passes unreviewed work.
- **Rollback is not revision.** "Previous was better" / "undo" is
  `graphcompose-flow undo`; "restore the old header but keep the rest"
  is `restore-component`. Both create a new DRAFT and neither rewrites
  history.
- **A user asking for two unrelated changes gets two revisions.** One
  revision per intent keeps the diff attributable and the rollback
  useful.

## Related

- [`../references/scope-routing.md`](../references/scope-routing.md) — picking the scope and its gate
- [`../references/authoring-rules.md`](../references/authoring-rules.md) — geometry, anchors, data spec, API discipline
- [`../references/iteration-loop.md`](../references/iteration-loop.md) — bounds and failure categories
- [`../review-template/SKILL.md`](../review-template/SKILL.md) — producing the verdict
- [`../approve-template/SKILL.md`](../approve-template/SKILL.md) — when the user accepts it
