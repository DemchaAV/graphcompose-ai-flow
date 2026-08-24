# Rollback

Three rollback types are supported. All of them are implemented by
the Revision Manager Agent and all of them create a new revision —
nothing is overwritten in place.

## Undo last change

User says:

```text
Undo.
Верни назад.
Previous version was better.
```

Action:

```text
Create a rollback revision from the parent of the current draft.
Mark the rejected draft as REJECTED or SUPERSEDED.
```

The new revision's `parentRevisionId` is the parent of the draft that
the user wanted to discard. The discarded draft itself is not deleted
— it keeps its artifacts and is relabeled `REJECTED` or `SUPERSEDED`
in `revision.json`.

## Revert to approved

User says:

```text
Revert to approved.
Верни как было до правок.
```

Action:

```text
Create a new draft from currentApprovedRevisionId.
```

This is the "panic button" path. The draft pointer in
`template-project.json` is updated to the new revision, but the
approved pointer (`currentApprovedRevisionId`) is left untouched. See
[revision-model.md](revision-model.md) for how those two pointers
relate.

## Selective rollback

User says:

```text
Restore the old header but keep the new table.
```

Action:

```text
1. Take current draft as base.
2. Take Header implementation from older revision.
3. Keep current table implementation.
4. Create new revision.
5. Render again.
6. Compare again.
```

The new revision's `parentRevisionId` is the current draft. Its
`changedComponents` lists exactly which components were swapped in
from older revisions. The Test + Render and Visual Review steps then
run normally on the assembled template.

## Componentization is a rollback requirement

Selective rollback only works when the template is componentized. The
preferred template shape uses one named private render method per
visible component, for example:

```java
renderHeader(...)
renderHero(...)
renderTable(...)
renderFooter(...)
```

If the code is not componentized — for example if the whole layout
lives in a single `compose` method — then "restore the old header
but keep the new table" cannot be performed mechanically. Therefore
componentization is not just style. It is part of the rollback
architecture, and the Template Coder Agent enforces it.

For the Revision Manager's responsibilities and core safety rule see
`tools/revision-manager`,
and for the revision data model that backs all three flows see
[revision-model.md](revision-model.md).
