---
description: Change an existing GraphCompose template as a new revision — content, assets, theme, layout or a pure refactor — under the narrowest scope that fits, and prove it against that scope's gate.
argument-hint: "[what to change, e.g. \"make the sidebar wider\"]"
---

Revise the current GraphCompose template.

Follow the `revise-template` skill in
`skills/workflows/revise-template/SKILL.md`. The first decision is the
scope — `data-only`, `asset-only`, `theme-only`, `refactor-only` or
`visual-change` — and it must be verified against the surface the change
would actually touch, not just the wording of the request. Ambiguity
gets exactly one clarifying question before any revision is opened.

Then run only the stages that scope requires and prove the result
against the gate that scope implies: `AE == 0` for a refactor, region-
aware diff for data and asset edits, layer-by-layer review otherwise.

Requested change: $ARGUMENTS
