# Version Resolution

## Target

- GraphCompose version: `1.6.0`
- Maven coordinate: `com.github.DemchaAV:GraphCompose:v1.6.0`
- Skill pack: `skills/versions/graphcompose-1.6`

## Source

The target version is inherited from:

- `examples/noir-corporate-cv/template-project.json`
- `examples/noir-corporate-cv/render-runner/pom.xml`
- parent revision `revision-005`

## Skills Used

- `graphcompose-basics`
- `visual-to-graphcompose-mapping`
- `layout-primitives`
- `spacing-and-alignment`
- `backgrounds-and-panels`
- `layer-stacks-and-overlays`
- `shapes-and-containers`
- `typography`
- `visual-regression`
- `revision-discipline`
- `troubleshooting`

## API Notes

The revision compiles against the real GraphCompose 1.6.0 artifact. The
attempted implementation uses public DSL calls:

- `SectionBuilder.fillColor(...)`
- `SectionBuilder.addContainer(...)`
- `ShapeContainerBuilder.circle(...)`
- `ShapeContainerBuilder.center(...)`
- `AbstractFlowBuilder.addLayerStack(...)`
- `LayerStackBuilder.layer(...)`
- `LayerAlign.TOP_LEFT`
- `TableBuilder` + `DocumentTableStyle` for full-width dark heading bars
- `RowBuilder.weights(...)` only for the top-level page grid

GraphCompose rejected the attempted top-surface architecture at render time
because the stacked content layer contains the existing two-column `MainGrid`
row. The current usable draft remains `revision-005`.
