# Test Result - revision-006

## Command

```powershell
node scripts\render-noir-corporate-cv.mjs revision-006
```

## Result

FAIL.

## Evidence

The template compiled, asset resolution completed, and the preview renderer
started. Rendering failed with:

```text
Row 'NoirCorporateCv[0]/PageSurfaceStack[0]/ContentLayer[1]/MainGrid[0]' cannot contain a nested horizontal row; use a section column instead.
```

The first failed attempt also showed a harmless surface-height edge case:

```text
Node 'NoirCorporateCv[0]/PageSurfaceStack[0]' requires outer height 842.0 but page capacity is 841.88977.
```

That height issue was corrected before the row-in-layer blocker was reached.
