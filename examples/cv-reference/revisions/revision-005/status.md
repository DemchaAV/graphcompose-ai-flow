# Status

- Template: **Mint Editorial CV** (`cv-reference`)
- Revision: `revision-005`
- Parent: `revision-004` (APPROVED)
- Status: `DRAFT`
- Renderable: YES
- Pixel diff vs `revision-004`: zero on both pages
- Annotation diff vs `revision-004`: +4 link rectangles (8 inline
  click targets, two per Social row) pointing at the URLs in the
  template's `SOCIAL_LINKS` table.

## How to re-render locally

```powershell
node .\scripts\render-cv-reference.mjs revision-005
```

The asset chain (icons + fonts) is reused verbatim from
`revision-004`; the resolver still runs and writes an identical
manifest. The only thing that differs from `revision-004` at the
template level is the Social hyperlink wiring.

## Social link table

| Token     | URL                                  |
|---|---|
| twitter   | https://twitter.com/roseharris        |
| facebook  | https://facebook.com/roseharris       |
| pinterest | https://pinterest.com/roseharris      |
| linkedin  | https://linkedin.com/in/roseharris    |

`DocumentLinkOptions` requires an absolute scheme — bare
`twitter.com/...` will be rejected at construction time.
