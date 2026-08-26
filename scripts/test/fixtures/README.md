# Test fixtures

## `layout-snapshot.charcoal-gold-cv.json`

A byte copy of
`examples/charcoal-gold-cv/revisions/revision-009/layout-snapshot.json`, written
by `LayoutSnapshotWriter` from `DocumentSession.layoutSnapshot()` during a real
render against GraphCompose 2.2.1 on 2026-08-26. 248 nodes, one page.

**Every number in it was measured by the engine.** None was authored here, and
none may be edited by hand. Ten files of invented geometry were deleted from
this repository the day the real writer landed — they declared themselves
illustrative and were still being read as if they were measurements. Pinning the
layout inspector against numbers no engine produced would put that back, one
layer further from anybody noticing.

It is a copy rather than a reference because the example it came from is not
tracked in git. This file is the only copy of that measurement under version
control, which is also why it is committed whole rather than trimmed: the
inspector's coverage test reproduces a per-rule classification of all 248 nodes,
and pruning a node's siblings would break the container-height invariant the
engine actually holds (`height == padding + Σ(children + margins)`, true on
134 of 134 container nodes) and teach a reader a failure mode that does not
exist.

To refresh it, re-render the project and copy the file again — do not patch it.

`graphComposeVersion` is `null` on purpose: the published jar does not set the
`Implementation-Version` manifest attribute the writer reads. The schema allows
it, and the inspector must not assume otherwise.

## `layout-diff-pair/`

Two snapshots of the same document differing by **exactly one property**:
`Panel`'s `padding.left`, 0 in `before/` and 12 in `after/`. Both were rendered
by the real preview-renderer against GraphCompose 2.2.0 on 2026-08-26, so both
are engine measurements; only the source that produced them was authored.

Eight nodes, and the pair is shaped to make `layout diff` provable in all three
directions at once:

- **The intended change** — `Panel.padding.left` 0 → 12.
- **Its descendants** — the three paragraphs move from x 0 to x 12, and nothing
  about them changes except x.
- **Collateral upward** — `LayoutDiffFixture`, the root, grows from 95.704 to
  107.704 because its widest child got wider. A diff that only looked
  downward from the changed node would miss it, and that is exactly the class of
  surprise the collateral gate exists to catch.
- **A subtree that must not move** — `Untouched` and its two paragraphs are
  byte-identical between the two files. "Only the intended thing changed" is not
  provable without something that was supposed to stay put.

`LayoutDiffFixtureDocument.java.txt` is the source, kept as a `.txt` so no build
picks it up. It is the recipe, not a compiled artifact. To regenerate:

```bash
# a pom copied from examples/skill-fixtures/row-basic/pom.xml is enough
mvn -B -q -DskipTests -f <scratch>/pom.xml compile
mvn -B -q -f <scratch>/pom.xml dependency:build-classpath -Dmdep.outputFile=target/cp.txt
java -jar tools/preview-renderer/target/preview-renderer.jar render \
  --revision <scratch-revision-dir> \
  --template-class com.demcha.compose.document.fixtures.layoutdiff.LayoutDiffFixtureDocument \
  --classpath <scratch>/target/classes --classpath-file <scratch>/target/cp.txt \
  --output output.pdf --preview output.png --dpi 150 --page 0
```

Render once at `PANEL_PADDING_LEFT = 0f`, once at `12f`. Do not edit either
snapshot by hand — a fixture pair whose difference was typed rather than
measured cannot prove a diff engine right.
