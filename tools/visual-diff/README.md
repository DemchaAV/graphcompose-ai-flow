# visual-diff

Pixel-diff CLI for the GraphCompose AI Template Flow. Given a reference
PNG and a rendered output PNG, it produces a diff highlight image, a
mismatch percentage, a strict parity score (0-100), and a suggested
classification per [docs/visual-accuracy-contract.md](../../docs/visual-accuracy-contract.md).

The tool is deliberately small. It does not perform layout analysis,
OCR, or structural comparison. It is a pixel diff plus a classifier
shaped to feed the Visual Review Agent's `visual-review.md`.

## Install

```bash
cd tools/visual-diff
npm install
npm run build
```

Node 20+ is required. The CLI is launched via `bin/visual-diff.mjs`.

## Usage

```bash
node bin/visual-diff.mjs <reference.png> <output.png> [options]
```

Options:

| Flag | Default | Meaning |
|---|---|---|
| `--out <file>` | `./diff.png` | Where to write the highlight PNG. Changed pixels are tinted red. |
| `--threshold <0..1>` | `0.1` | pixelmatch threshold. Lower is stricter. |
| `--include-aa` | off | Include anti-aliased pixels in the diff (default: ignored). |
| `--json` | off | Print machine-readable stats JSON instead of a human summary. |
| `--update-revision <folder>` | (none) | Also write the diff PNG, the stats JSON, and a classification snippet into a revision folder. |

The two PNGs must share the same dimensions; the CLI exits non-zero
with a clear message if not.

## mask-regions

Companion CLI for region-aware diffs (used by the Visual Review
Agent on `data-only` and `asset-only` revisions per
[`skills/workflows/review-template/SKILL.md`](../../skills/workflows/review-template/SKILL.md)
§ "Region-aware variant"). Paints rectangular regions with a solid
colour (`--mode mask-out`, default) or paints everything outside the
regions (`--mode keep-only`). Pure pngjs — no ImageMagick / Sharp
dependency.

```bash
node bin/mask-regions.mjs \
  --input  examples/<project>/revisions/<id>/output.png \
  --output validation/diffs/<id>-masked.png \
  --regions '[{"x":0,"y":0,"w":600,"h":100,"label":"Header"}]' \
  [--mode mask-out|keep-only] \
  [--color white|black|transparent|#RRGGBB|#RRGGBBAA] \
  [--regions-file path/to/regions.json] \
  [--json]
```

Typical Visual Review pipeline: mask the same regions in both the
parent and the child PNG, then run `visual-diff` on the two masked
outputs. In `mask-out` mode, the affected regions become byte-
identical in both files, so any remaining mismatch is a leak into
a region the user did NOT ask to change.

## Score formula

```text
percent      = mismatchPx / totalPx * 100
parityScore  = clamp(round(100 - percent * 4), 0, 100)
```

So:

| Mismatch % | Parity score |
|---|---|
| 0% | 100 |
| 1% | 96 |
| 5% | 80 |
| 12.5% | 50 |
| 25% | 0 |

The score is intentionally strict so that even a few percent of pixel
diff shows up clearly in a 0-100 number. The score is a signal; the
classification is the gate.

## Classification thresholds

| Mismatch % | Suggested label |
|---|---|
| `percent === 0` | `IDENTICAL` |
| `percent < 0.5` | `MINOR` |
| `0.5 <= percent < 5` | `MAJOR` |
| `percent >= 5` | `CRITICAL` |

`ACCEPTED_LIMITATION` and `INTENTIONAL_DIFFERENCE` are never
auto-applied. Those labels require a human note (a known API limitation
or an explicit user-approved difference). The CLI will only ever emit
the four labels above. See
[docs/visual-accuracy-contract.md](../../docs/visual-accuracy-contract.md)
for the canonical definitions.

## `--update-revision` workflow

When you pass `--update-revision <folder>`, the CLI also writes three
files into that folder:

```text
<folder>/output-diff.png
<folder>/visual-diff-stats.json
<folder>/visual-review-classification.md
```

The markdown snippet uses the same headings as the Visual Review
Agent's `visual-review.md`, so a human can paste it directly into the
revision's review document. The snippet is overwritten on every run;
running the CLI twice never appends a duplicate section.

Writes are atomic (tmp file plus rename) so a crash mid-update never
leaves a half-written file behind.

## Fixtures

The repository commits two tiny PNGs in `fixtures/`:

```text
identical-a.png   32x32 solid white
identical-b.png   byte-identical copy
```

They power the "is the diff plumbing wired up correctly" smoke test in
`test/diff.test.ts`. All other test images are synthesized in-memory
inside the tests (`test/helpers.ts`).

If the fixtures are missing or corrupted, rebuild them with:

```bash
node fixtures/build-fixtures.mjs
```

The script is deterministic and idempotent.

## Development

```bash
npm test           # vitest
npm run build      # tsc, emits dist/
npm run dev        # tsx src/cli.ts -- ...
```

The build is strict TypeScript with ESM output. There are no native
dependencies.
