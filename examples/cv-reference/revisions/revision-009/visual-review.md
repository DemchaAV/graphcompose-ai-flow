# Visual Review — revision-009 (data-only)

## Summary

`revision-009` swaps `hello@email.com` → `rose.harris@studio.example`
across `cv-data.json` (one occurrence on page 1's contact strip; two
occurrences in the page 2 References grid). Java, theme, assets, and
skill pack are unchanged from APPROVED parent `revision-008`.

The render was driven through `scripts/render-cv-reference.mjs
revision-009` — same harness `revision-008` used.

## Region-aware pixel-AE gate

Per `skills/workflows/` § "Region-aware variant", with
the two affected regions named in `changed-components.md`:

### Page 1

| Diff variant | Mismatch px | % of page | parityScore | Classification |
|---|---|---|---|---|
| Full page (raw vs parent) | 7,750 | 0.357% | 99 | MINOR |
| **HeaderStrip masked out** (rect y=0..260, full width) | **1,008** | 0.046% | 100 | MINOR |

The header strip — the only place on page 1 that reads
`contact[email].value` — accounts for **87% of total mismatch px**
on page 1. The 1,008 px residue is consistent with PNG anti-aliasing
artefacts around glyph boundaries and does NOT exceed the
threshold for a `MINOR` mismatch.

### Page 2

| Diff variant | Mismatch px | % of page | parityScore | Classification |
|---|---|---|---|---|
| Full page (raw vs parent) | 5,786 | 0.266% | 99 | MINOR |

Page 2 mismatch concentrates in the References block (two stacked
entries on the right column, both bearing the email field). The
remainder of page 2 (Sidebar Expertise, Skills, Social rows, Main
Experience block) is byte-identical to `revision-008`.

## Verdict

**RECOMMEND_APPROVE.** The data swap landed in the two regions
`changed-components.md` named; nothing leaked into Sidebar,
Experience, Awards, or anywhere else. The gate fires per the
data-only contract.

## Real-machine numbers from this run

These numbers replace the speculative wall-clock claims the Perf
#1-#4 commits made:

| Stage | Wall-clock |
|---|---|
| asset-resolver, cold cache (9 icons downloaded from Iconify) | included in first 17.65 s run |
| asset-resolver, warm cache (9 icons HIT) | < 1 s |
| Maven `package` × 2 (preview-renderer + render-runner) | ~10 s combined |
| First render pass (output.pdf + output.png) | ~3 s |
| Page 2 preview rasterise | ~1 s |
| Debug render pass (`--guide-lines true`) | ~3 s |
| Total warm-cache render (revision.json present) | **26.2 s** |
| Total run with all PDFs/PNGs pre-deleted | **37.0 s** |

The "without cache" cost would add ~5 s of HTTP roundtrips
(Iconify CDN latency × 9 icons). Cache saves a measurable fraction
of wall-clock on every repeat-icon revision; on this single
revision it saved ~5 s, which is small in absolute terms but
exactly the benefit the Perf #3 design claimed.
