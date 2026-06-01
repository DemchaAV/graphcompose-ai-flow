# Orchestration Decision - revision-007

## Gesture

User feedback on the current usable draft.

## Routing

- Parent revision: `revision-005`
- `revision-006` remains `FAILED` because its LayerStack top-surface attempt is
  blocked by GraphCompose row nesting behavior.
- Changed components: sidebar spacing/typography, CV badge text, name bar,
  main section bars, work timeline.
- Agents required:
  - Architecture Mapper
  - Template Coder
  - Test + Render
  - Visual Review

## Decision

Open a new draft from the last successful render (`revision-005`) and apply the
user's concrete visual corrections. Avoid the failed `revision-006` LayerStack
architecture path.
