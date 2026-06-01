# Skill Validation Report (auto-populated)

Target coordinate: `io.github.demchaav:graph-compose:1.6.6`  
Skill pack: `skills/versions/graphcompose-1.6`  
Cache key: `ed41dc6e088aebece5b8c5cdd9fa8b40fb7df0a496ba2b040eb4857a5f9c5ce9`

## Source

This report was written by a render script (not by the Skill
Validator Agent). The pass verdict is keyed to the CI skill-
fixtures matrix in `.github/workflows/ci.yml`, which compiles
and runs every fixture against the resolved coordinate on every
push. If that job is green for this commit, every covered skill
has been re-validated.

## Covered skills

- `graphcompose-basics`
- `visual-to-graphcompose-mapping`
- `layout-primitives`
- `tables`
- `themes-and-colors`
- `typography`
- `spacing-and-alignment`
- `backgrounds-and-panels`
- `layer-stacks-and-overlays`
- `shapes-and-containers`
- `pagination`
- `visual-regression`
- `revision-discipline`
- `troubleshooting`

## CI fixtures backing this verdict

- `examples/skill-fixtures/row-basic`
- `examples/skill-fixtures/section-basic`
- `examples/skill-fixtures/table-basic`
- `examples/skill-fixtures/layer-stack-badge`
- `examples/skill-fixtures/shape-container-card`

## Notes

- The fixture matrix runs `mvn -B test` against each module,
  picking up `io.github.demchaav:graph-compose:1.6.6` from Maven
  Central. A failing fixture would block the merge that produced
  this revision, so by induction this verdict is honest as long
  as the run is reproducible from main.
- An agent-driven Skill Validator pass would write a richer
  report and could surface per-skill drift the fixture matrix
  does not catch. This auto-populated path is the floor, not the
  ceiling.

verdict: pass
