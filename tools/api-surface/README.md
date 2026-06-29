# tools/api-surface — GraphCompose public-API allow-list generator

`api-index.py` generates the **allow-list**: the complete, exact list of
every public *authoring* method and constant GraphCompose exposes for a
given release. The agents treat it as a closed set — **if a symbol is not
in the allow-list, it does not exist for that version, so it must not be
called.** This is what stops the template-generation agents from inventing
non-existent GraphCompose API.

The script is vendored verbatim from the GraphCompose repo
(`.llm-wiki/tools/api-index/api-index.py`) so this flow can regenerate the
allow-list for each new GraphCompose release without depending on a sibling
checkout. Re-sync it from upstream when the generator itself changes; do not
fork its logic here.

## What it parses

It walks `src/main/java` of a GraphCompose checkout and extracts the public
members of the authoring packages only (`com.demcha.compose.GraphCompose`,
`document.api` / `dsl` / `theme` / `style` / `table` / `chart` / `node` /
`image` / `svg` / `output`, `document.templates.{builtins,data,api,theme}`,
and `font`). Engine / layout / internal packages are excluded on purpose —
they are not what a "compose this document" task should reach for. The
`**GraphCompose version:**` stamp is read from the checkout's `pom.xml`.

## Regenerate for a release

Generate from the **tagged release source**, never from `develop`, so the
output matches a published Maven Central artifact exactly:

```bash
# 1. Get a clean checkout of the release tag (worktree off the GC repo):
git -C C:/Dev/Java/GraphCompose worktree add --detach \
  C:/Dev/Java/GraphCompose-wt-v190 v1.9.0

# 2. Generate the allow-list into the matching skill pack:
python tools/api-surface/api-index.py \
  --src C:/Dev/Java/GraphCompose-wt-v190 \
  --out skills/versions/graphcompose-1.9/00-api-surface.md
```

Then **prepend the YAML front-matter** the other skills carry
(`skillId: graphcompose-api-surface`, `targetVersion`, `verifiedAgainst`,
`status`) above the generated body. Do **not** hand-edit the generated body
below the front-matter — if a method looks wrong, fix the generator or
regenerate from the correct tag.

> Note: the generated header's "Regenerate ..." line still prints the
> upstream `.llm-wiki/tools/api-index/api-index.py` path (it is emitted by
> the script). In this flow the script lives at
> `tools/api-surface/api-index.py` — use the command above.

## Verifying a fresh generation

After generating, confirm the version and that release-specific API is
present (for 1.9.0, e.g. `addTableOfContents`, `addPageReference`,
`toImage` / `toImages`):

```bash
grep -m1 'GraphCompose version:' skills/versions/graphcompose-1.9/00-api-surface.md
grep -c 'addTableOfContents\|addPageReference\|toImages' skills/versions/graphcompose-1.9/00-api-surface.md
```

The current allow-list is
[skills/versions/graphcompose-1.9/00-api-surface.md](../../skills/versions/graphcompose-1.9/00-api-surface.md).
