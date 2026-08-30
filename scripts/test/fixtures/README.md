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

## `charcoal-gold-cv/revision-00{9,10}.*` and `olive-curve-invoice/`

The Java the bundle splitter is measured against, and the architecture plan that
names revision-009's sections. Copies, for the reason above and one more: the
test that reads them used to read their real paths —
`examples/charcoal-gold-cv/revisions/revision-00{9,10}/` and
`templates/olive-curve-invoice/src/` — neither of which is tracked. It guarded
that with a skip, so **CI checked one of the four templates and reported the
other three as passing tests**. The three that were skipped are the ones that
found every defect in the v0.18.0–v0.20.0 split work: an over-wide plan entry,
an overloaded helper, a nested record's package-private members.

charcoal-gold revision-009 carries a plan and revision-010 does not, which is the
pair the splitter's naming rule needs: the plan enriches the section list, and the
`render*` prefix is what selects it. `OliveCurveInvoiceTemplate.java` is the
published bundle's own source, copied rather than referenced because the bundle
itself does not pass `verify-published-template` — its README names a
`revisions/` path that exists only inside the harness — and committing a bundle
that fails the gate would fail CI for a reason that has nothing to do with these
tests.

None of the three may be edited. They are what a real run produced; a fixture
someone tidied is a fixture that stopped being evidence.

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

## `typography-crops/`

Six crops of the same string, `Handgloves 0123`, set at 24pt in six
families and rendered by the real preview-renderer at 200 dpi on
2026-08-26. They are slices of one specimen sheet, cut by the layout
snapshot that same render produced — which is what the specimen approach
buys: no image analysis is needed to find where a candidate landed.

They exist so the matcher's ranking is tested against actual letterforms.
Rendering candidates needs Maven and a JVM and `npm test` is the pure-Node
suite, so the crops are committed and the scoring half — normalise,
measure the ink, compare, rank — runs against them through ImageMagick.

The test feeds each crop back in as its own reference and asserts that
family ranks first. It also asserts the six are separable **by width
alone**: the same string runs 1.4x wider in JetBrains Mono than in Barlow
Condensed, and if that ever collapses the ranking is leaning entirely on
the shape metric without anybody noticing.

To regenerate, run `scripts/typography.mjs match --keep` and take the
crops out of the scratch directory it names.

## `typography-snapshot/`

One engine snapshot from a render against **GraphCompose 2.2.2-SNAPSHOT**, the
first version that reports typography. Three paragraphs, chosen so the fixture
carries every case the harness has to handle:

- `Heading` declares `HELVETICA_BOLD` and is set in `Helvetica`. That is the
  substitution the whole feature exists for — a standard-14 *face* is an alias of
  its family, the face comes from the style's decoration, so the heading renders
  regular. It lays out, it draws, nothing fails, and no pixel comparison will ever
  say so. `fontSubstituted: true` is the only thing that does.
- `Body` wraps onto two lines in a font it actually got, so the per-line bounds and
  baselines have something to be right about.
- `RightNote` is right-aligned in Courier, so the line's `x` is not the content
  box's `x` and a mistake there cannot hide.

`TypographyFixtureDocument.java.txt` is the source, kept as `.txt` so no build
picks it up. Regenerate the way `layout-diff-pair/` documents, with the pom's
`graphcompose.version` set to a build that reports typography.

**The `charcoal-gold-cv/` and `layout-diff-pair/` fixtures are deliberately left
on format 2.0**, without typography. Every revision rendered before 2.2.2 looks
like that, and the tests need a snapshot that proves the difference between "this
region has no font problem" and "nothing looked" — two answers a consumer must
never collapse into one.
