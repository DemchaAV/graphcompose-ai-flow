# Skill Validation Report

## Result

FAIL for the attempted `LayerStack` page-surface architecture.

## Concrete Validation

The following command failed during render:

```powershell
node scripts\render-noir-corporate-cv.mjs revision-006
```

The command successfully completed:

- asset resolution from `asset-request.json`
- `mvn package` for `tools/preview-renderer`
- `mvn package` for `examples/noir-corporate-cv/render-runner`
- Maven dependency classpath generation

The preview renderer then failed with:

```text
Row 'NoirCorporateCv[0]/PageSurfaceStack[0]/ContentLayer[1]/MainGrid[0]' cannot contain a nested horizontal row; use a section column instead.
```

## Drift Found

The `layer-stacks-and-overlays` skill documents stack layers built from
`SectionNode`, but this revision shows that a stacked `SectionNode` cannot
contain the existing row-based two-column layout in GraphCompose 1.6.0.

This should be folded back into the skill guidance before the flow tries this
architecture again.

## Skills Exercised

| Skill | Status in manifest | Revision-006 evidence |
|---|---:|---|
| `layer-stacks-and-overlays` | needs-validation | attempted page-wide top band behind content; render blocked |
| `backgrounds-and-panels` | needs-validation | page top/body surface layers compiled |
| `spacing-and-alignment` | needs-validation | existing row-based content layer is the blocker inside stack |
| `troubleshooting` | needs-validation | failure recorded; current usable draft remains `revision-005` |
