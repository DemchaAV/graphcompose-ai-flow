# Test Result - revision-002

## Command

```powershell
node scripts\render-noir-corporate-cv.mjs revision-002
```

## Build

| Step | Result |
|---|---|
| asset-resolver | PASS |
| `mvn package` for `tools/preview-renderer` | PASS |
| `mvn package` for `examples/noir-corporate-cv/render-runner` | PASS |
| `mvn dependency:build-classpath` | PASS |

## Render

| Pass | Result | Artifact |
|---|---|---|
| Clean render | PASS | `output.pdf`, `output.png` |
| Debug render with guide lines | PASS | `output-debug.pdf`, `output-debug.png` |

## Notes

The first implementation attempt used nested rows for dot meters and
work-experience markers. GraphCompose 1.6.0 rejected that shape at render time,
so the final revision avoids nested rows inside the top-level grid.

SLF4J prints the expected no-provider warning during render. It does not block
PDF or PNG generation.
