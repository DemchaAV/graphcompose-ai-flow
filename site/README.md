# site/

Static landing page for GraphCompose AI Template Flow.
Built with Astro. Deployed to GitHub Pages by
[`.github/workflows/deploy-site.yml`](../.github/workflows/deploy-site.yml).

The page is data-driven: at build time it auto-pulls

- Agent list and roles from `../prompts/*-agent.md`
- Template metadata from `../templates/*/template.json`
- Preview PNGs from `../templates/*/preview/` and `../examples/cv-reference/reference/`
- Hero artwork from `../assets/readme/`

So updating the repo updates the site on the next push.

## Local development

```bash
cd site
npm install
npm run dev      # http://localhost:4321/graphcompose-ai-flow/
npm run build    # static output in dist/
npm run preview  # serve the built site
```

The `prebuild` / `predev` scripts run three sync scripts before Astro:

- `scripts/sync-assets.mjs` — copies preview PNGs into `public/previews/`
- `scripts/extract-agents.mjs` — parses agent prompts into `src/data/generated/agents.json`
- `scripts/extract-templates.mjs` — scans template manifests into `src/data/generated/templates.json`

Generated files and synced assets are gitignored; CI regenerates them from
source on every build.

## Deploy

The workflow triggers on push to `main` when anything under `site/`,
`prompts/`, `templates/`, `examples/cv-reference/reference/`, or
`assets/readme/` changes.

**One-time setup required:** in the repo settings on GitHub, go to
**Settings → Pages → Build and deployment → Source = "GitHub Actions"**.
After that, every push that touches the auto-pulled paths will rebuild and
redeploy the site.
