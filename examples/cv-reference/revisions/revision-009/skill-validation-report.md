# Skill Validation Report (auto-populated)

**partial: true** — not every covered skill is fixture-backed; see the "Not fixture-validated" list below.

Target coordinate: `io.github.demchaav:graph-compose:1.6.6`  
Skill pack: `skills/versions/graphcompose-1.6`  
Cache key: `ed41dc6e088aebece5b8c5cdd9fa8b40fb7df0a496ba2b040eb4857a5f9c5ce9`

## Source

This report was written by a render script (not by the Skill
Validator Agent). The pass verdict is keyed to the CI skill-
fixtures matrix in `.github/workflows/ci.yml`, which compiles
and runs the fixtures listed below against the resolved
coordinate on every push. If those jobs are green for this
commit, every fixture-backed skill has been re-validated.

Fixture coverage is parsed from
[validation/api-compatibility-checklist.md](../../../../validation/api-compatibility-checklist.md)
— rows whose `Fixture exists` AND `Fixture executed` columns
both start with `yes` are treated as fixture-backed.

## Fixture-backed (verdict: pass keyed to CI)

- `layout-primitives`
- `tables`
- `themes-and-colors`
- `backgrounds-and-panels`
- `layer-stacks-and-overlays`
- `shapes-and-containers`

## Not fixture-validated (verdict still pass, but no live gate)

- `graphcompose-basics`
- `visual-to-graphcompose-mapping`
- `typography`
- `spacing-and-alignment`
- `pagination`
- `visual-regression`
- `revision-discipline`
- `troubleshooting`

## CI fixtures backing the fixture-backed list

- `examples/skill-fixtures/row-basic`
- `examples/skill-fixtures/section-basic`
- `examples/skill-fixtures/table-basic`
- `examples/skill-fixtures/layer-stack-badge`
- `examples/skill-fixtures/shape-container-card`

## Notes

- The fixture matrix runs `mvn -B test` against each module,
  picking up `io.github.demchaav:graph-compose:1.6.6` from Maven
  Central. A failing fixture would block the merge that produced
  this revision, so by induction the fixture-backed list is
  honest as long as the run is reproducible from main.
- The "Not fixture-validated" list documents the honest gap.
  Authoring a fixture for those skills would tighten the gate.
  Until then the report is `partial: true` and a downstream agent
  may decide to require an agent-driven Skill Validator pass
  before approving anything that depends on those skills.
- An agent-driven Skill Validator pass would write a richer
  report and could surface per-skill drift the fixture matrix
  does not catch. This auto-populated path is the floor, not the
  ceiling.

verdict: pass
