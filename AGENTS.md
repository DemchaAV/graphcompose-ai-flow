# Agents

This project uses a fixed chain of nine specialized agents to turn a visual
document reference into a maintainable GraphCompose Java template. Each agent
has a single responsibility, a defined set of input artifacts, a defined set
of output artifacts, and a list of forbidden behaviors. No agent generates
code or renders output outside of its role. The chain is linear and every
stage either produces a documented artifact or stops the pipeline.

## Pipeline

```text
Template Orchestrator Agent
        |
        v
Version + Skill Resolver Agent
        |
        v
Skill Validator Agent
        |
        v
Visual Analyzer Agent
        |
        v
Architecture Mapper Agent
        |
        v
Template Coder Agent
        |
        v
Test + Render Agent
        |
        v
Visual Review Agent
        |
        v
Revision Manager Agent
        |
        v
User Approval / Rollback
```

## Agents at a glance

| Agent | Responsibility | Prompt |
|---|---|---|
| Template Orchestrator | Detect task type, select base revision, route work, prevent overwriting approved revisions. | [prompts/orchestrator-agent.md](prompts/orchestrator-agent.md) |
| Version + Skill Resolver | Detect target GraphCompose version, select compatible skill pack, refuse stale skills. | [prompts/version-skill-resolver-agent.md](prompts/version-skill-resolver-agent.md) |
| Skill Validator | Verify skills against library behavior and verified fixtures, produce skill-fix reports on drift. | [prompts/skill-validator-agent.md](prompts/skill-validator-agent.md) |
| Visual Analyzer | Describe the reference (page, regions, hierarchy, components, colors, typography, spacing). | [prompts/visual-analyzer-agent.md](prompts/visual-analyzer-agent.md) |
| Architecture Mapper | Map the visual analysis onto GraphCompose primitives and a maintainable template shape. | [prompts/architecture-mapper-agent.md](prompts/architecture-mapper-agent.md) |
| Template Coder | Write Java template and test code using only documented APIs from the selected skill pack. | [prompts/template-coder-agent.md](prompts/template-coder-agent.md) |
| Test + Render | Compile, run tests, render the PDF, generate the preview, save logs and the layout snapshot. | [prompts/test-render-agent.md](prompts/test-render-agent.md) |
| Visual Review | Compare reference and output, classify mismatches, recommend the next revision or approval. | [prompts/visual-review-agent.md](prompts/visual-review-agent.md) |
| Revision Manager | Create, approve, reject, undo, revert, and selectively roll back revisions without destruction. | [prompts/revision-manager-agent.md](prompts/revision-manager-agent.md) |

The prompt files listed above are produced by a separate lane and will live
at the indicated paths.

## Shared rules

```markdown
# Shared Rules

- Do not invent GraphCompose API.
- Do not use direct PDFBox imports in generated templates.
- Do not use raw coordinates as the main layout strategy.
- Prefer semantic GraphCompose primitives.
- Use CanvasLayer only as a last resort.
- Every generated template must belong to a revision.
- Every revision must preserve artifacts.
- Every generated output must be visually compared with the reference.
- Every mismatch must be documented.
- Every change must be reversible.
- If skills disagree with library behavior, fix the skills.
```

## Full descriptions

See [docs/agents.md](docs/agents.md) for the complete description of each
agent: purpose, inputs, outputs, responsibilities, forbidden behavior, and
worked examples.
