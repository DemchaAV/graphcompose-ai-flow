# Test Result

Output of the Test + Render Agent for `revision-001`. The minimum
and better checks below come from the project plan (§5.7) and
[`../../../../docs/agents.md`](../../../../skills/workflows/README.md).

## Minimum checks

| Check | Status | Notes |
|---|---|---|
| Template compiles | PASS | `node ../../../../scripts/render-invoice-reference.mjs revision-001` compiled this revision through `examples/invoice-reference/render-runner`. |
| PDF file is generated | PASS | [`./output.pdf`](./output.pdf) was written by `tools/preview-renderer render`. |
| PDF file is not empty | PASS | The committed PDF has a valid `%PDF-` header and non-zero size. |
| Preview image is generated | PASS | [`./output.png`](./output.png) was rasterized from the generated PDF at 150 DPI. |
| Layout snapshot is generated | PRESENT (illustrative) | [`./layout-snapshot.json`](./layout-snapshot.json) is committed but its bounding boxes are computed from the textual reference description, not from a real engine run. The `notes` field at the top of the file makes that explicit. |
| Render does not throw | PASS | The shared render command completed successfully for this revision. |

The remaining caveat is visual, not render-related: the example still
has only a textual reference description, so no pixel diff against
`reference.png` has been run.

## Better checks

| Check | Status |
|---|---|
| Layout snapshot regression test | PENDING (snapshot runner) |
| Visual comparison test | PENDING (reference.png absent) |
| Pagination expectation test | PENDING |
| Component-level snapshot test | PENDING |
| Render output size sanity check | PASS |
| Missing page check | PASS |

The single-page reference does not exercise pagination in this
revision, but the table is configured to repeat its header so the
test will be meaningful once a real overflow case is exercised by
validation fixtures.

## Logs

`render.log` is produced locally by the render command but ignored by
the repository log policy. The committed proof is the generated PDF,
preview PNG, and the empty `pendingArtifacts` array in
[`./revision.json`](./revision.json).

## Conclusion

This revision now has real render artifacts, but it is still not
suitable for approval because no `reference.png` baseline exists for
visual-diff and the user has not approved it.
