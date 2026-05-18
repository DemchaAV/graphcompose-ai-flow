# Visual Review

## Summary

`revision-003` adds root page padding so the rendered invoice no longer
touches the page's top-left edge.

Render artifacts exist:

- [`./output.pdf`](./output.pdf)
- [`./output.png`](./output.png)

This review remains provisional because the example still has no
committed `reference.png` baseline for visual-diff.

## Observations

| Area | Result | Notes |
|---|---|---|
| Top page edge | PASS | Content now starts below a visible white margin. |
| Left page edge | PASS | Header, hero, table, summary, footer, and contact text are inset from the edge. |
| Hero metadata | PASS | `Invoice`, `Issued`, `Due`, and `Status Pending` remain on one line at the selected margin. |
| Existing summary change | PRESERVED | The `revision-002` dedicated `Summary` section is unchanged. |

## Known Limitations

- No pixel score is available until `reference/reference.png` exists.
- `layout-snapshot.json` is still illustrative, not extracted from the
  engine.

## Recommendation

Keep `revision-003` as the current draft. The next useful step is to add
a real `reference.png` and run visual-diff against this rendered output.
