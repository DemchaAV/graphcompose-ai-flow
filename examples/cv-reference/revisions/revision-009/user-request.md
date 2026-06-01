# User request

Swap the contact email from `hello@email.com` to
`rose.harris@studio.example` across the CV (contact line on page 1
plus both references on page 2).

scope: data-only

This is the first revision authored under the
`prompts/orchestrator-agent.md` § "Revision scope" data-only contract.
Java code, theme tokens, asset request, and skill pack are unchanged
from `revision-008` (the APPROVED parent). Only `cv-data.json` differs:
three occurrences of `hello@email.com` flipped to
`rose.harris@studio.example`, and the matching `mailto:` URL updated.

The render must look identical to `revision-008` everywhere except the
two contact lines (page 1 header strip; page 2 References grid). Visual
Review applies the region-aware pixel-AE gate per
`prompts/visual-review-agent.md` § "Region-aware variant".
