# tools/api-surface — the GraphCompose allow-list, per release line

`extract-api.mjs` generates the **allow-list**: the complete list of every
public *authoring* method and constant a GraphCompose release exposes. The
agents treat it as a closed set — **if a symbol is not in the allow-list, it
does not exist for that version, so it must not be called.** That is what stops
a template-generation agent inventing API.

It reads the **compiled class files** of the pinned artifact with `javap`, not
the Java source. That is not a detail: GraphCompose declares much of its
authoring surface with Lombok, so `DocumentHeaderFooter`, `DocumentMetadata`,
`DocumentWatermark` and `DocumentProtection` have entire construction paths that
exist only in bytecode. The source parser this replaced listed them with no
members at all, and under the closed-set rule an agent correctly concluded they
could not be constructed — page headers and footers were unreachable.

`api-surface.json` is the contract; `00-api-surface.md` is rendered from it, so
the two cannot disagree. Ask it a question rather than reading it:

```bash
node scripts/api-query.mjs --exists TableBuilder.zebra   # 0 found, 3 absent
```

## Where it comes from

GraphCompose owns this generator. This repository holds a copy so a pack can be
built without a sibling checkout, and it is the copy to use for release lines
**at or before 2.2** — which is every line that predates GraphCompose publishing
a knowledge bundle of its own.

From 2.3 onward, prefer importing the published bundle
(`graph-compose-knowledge-<version>.zip`, attached to the GitHub Release with a
`.sha256` beside it) rather than regenerating here: the bundle is produced by the
same generator inside GraphCompose, gated by its CI against the commit it
describes, and carries routing and claims this copy cannot produce.

Do not fork the logic here. If the generator is wrong, it is wrong upstream.

## Regenerate a pack

Generate from a **published release**, never from a snapshot, so the output
matches an artifact a consumer can actually resolve:

```bash
node tools/api-surface/extract-api.mjs --version 2.2.2
node tools/api-surface/extract-api.mjs --version 2.2.2 --check   # exit 1 on drift
```

`--check` regenerates into memory and compares with what is on disk. Run it after
every GraphCompose release: a pack one patch version behind is not a cosmetic
lag. The 2.2 pack sat at 2.2.1 while 2.2.2 was out, and was missing five types
and thirty-five members — the whole layout-diagnostic snapshot API — which the
closed-set rule then forbade the flow from calling.

The front-matter (`skillId`, `targetVersion`, `verifiedAgainst`, `status`) is
emitted by the generator; nothing below it is hand-edited.

## Engine guides — `sync-engine-guides.mjs`

`sync-engine-guides.mjs` vendors the **how-to-use-the-engine** layer: the
verified developer guides from the GraphCompose private LLM wiki
(`.llm-wiki/12-docs-extraction/`). Where the allow-list says WHAT exists, these
guides show HOW to wire the primitives together — each is intent-first and
compile-smoke + render-proven upstream.

Unlike the allow-list, the guides are **curated, not regenerated from a tag**,
so this is a re-sync (copy + stamp), not a `--src` generation. The script
copies each `NN-*.md` body guide verbatim and prepends a provenance header
recording the source and the pinned release; the flow-owned index
(`guides/00-index.md`) is never overwritten.

```bash
node tools/api-surface/sync-engine-guides.mjs \
  --src "C:/Dev/Java/GraphCompose/.llm-wiki/12-docs-extraction" \
  --out skills/versions/graphcompose-1.9/guides \
  --verified 1.9.0
```

`--src` defaults to `$GRAPHCOMPOSE_WIKI/12-docs-extraction` when that env var is
set. The vendored guides live under
[skills/versions/graphcompose-1.9/guides/](../../skills/versions/graphcompose-1.9/guides/);
the index ([guides/00-index.md](../../skills/versions/graphcompose-1.9/guides/00-index.md))
is the `graphcompose-engine-guides` manifest skill.
