# Test Result

## Command

```powershell
node scripts\render-cv-reference.mjs revision-002
```

## Result

| Check | Status |
|---|---|
| Preview renderer Maven package | PASS |
| CV render-runner Maven package | PASS |
| Runtime classpath generation | PASS |
| `output.pdf` generation | PASS |
| `output.png` page 1 preview generation | PASS |
| `output-page-2.png` page 2 preview generation | PASS |

SLF4J reports the expected no-provider warning and falls back to the
no-op logger.
