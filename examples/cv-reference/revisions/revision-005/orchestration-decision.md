# Orchestration Decision

## Task

Make the four entries in the Social section clickable hyperlinks
without touching the rest of the approved baseline.

## Decision

This is a targeted revision of the now-approved `revision-004`. The
orchestrator opens `revision-005` as a DRAFT with `revision-004` as
its parent. The asset chain is reused verbatim — the icons,
manifest, fonts, and Awards/References layout from revision-004 stay
intact. The only template change is inside `renderSocial(...)` and the
new `iconLine(..., DocumentLinkOptions)` overload that wraps the
inline image and the visible label in shared link metadata.

```text
revision-004 (APPROVED, "Mint Editorial CV")
        ↓ parent
revision-005 (DRAFT) — clickable social links
```

The Architecture Mapper does not touch `asset-request.json`
(the icons and fonts are unchanged), so the Asset Resolver only runs
to confirm the manifest is still valid. The Template Coder is the
agent that actually changes the Java source.

## Scope

- Add a `SOCIAL_LINKS` map keyed by token: `twitter`, `facebook`,
  `pinterest`, `linkedin` → profile URL with explicit `https://`
  scheme (required by `DocumentLinkOptions`).
- Add an overload `iconLine(section, token, value, link)` and a
  helper `socialLine(...)` that looks the URL up from the table.
  Both the inline-image and the inline-text runs receive the same
  `DocumentLinkOptions` so the click target spans the whole row.
- Render through the wired flow to verify the link annotations land
  in the PDF.

## Out Of Scope For This Revision

- Adding links to the contact section (`tel:`, `mailto:`,
  `https://`) — user request explicitly said "только в SOCIAL".
- Replacing fixture URLs with real ones. The four URLs point to
  `roseharris` profiles to match the fixture name on the CV; they
  are placeholders for downstream content authors to override.
