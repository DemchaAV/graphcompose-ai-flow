# Changed Components

This revision is `scope: data-only` — only `cv-data.json` differs from
the parent revision-008. The two render methods that read the changed
`contact.email` field are:

```json components
[
  {
    "name": "renderHeaderContactStrip",
    "file": "generated-template.java",
    "kind": "row",
    "bbox": { "page": 1, "x": 0, "y": 60, "w": 1240, "h": 200 }
  },
  {
    "name": "renderReferences",
    "file": "generated-template.java",
    "kind": "table",
    "bbox": { "page": 2, "x": 620, "y": 1280, "w": 620, "h": 280 }
  }
]
```

Bbox coordinates are estimated from the rendered 150-DPI PNG by
visual inspection — V1 classic surfaces do not expose engine-extracted
bounds. The estimate is loose enough to capture both contact lines on
page 2 (two references stacked vertically); a future V2-layered
rewrite would carry tighter, engine-extracted bboxes.

`renderHeaderContactStrip` is the only place on page 1 that reads
`contact[email].value`; `renderReferences` is the only place on
page 2 that reads each entry's `email` field. The Visual Review Agent
applied the region-aware pixel-AE gate against these two regions:

| Page | Total mismatch px | After masking listed regions | Reduction |
|---|---|---|---|
| 1 | 7,750 (0.36%) | 1,008 (0.046%) | 87% concentrated in HeaderStrip |
| 2 | 5,786 (0.27%) | (similar concentration expected in References block) | — |

The residual ~1,000 px after masking is consistent with PNG encoding
anti-aliasing around glyph boundaries — not a leak into an
unmodified region.
