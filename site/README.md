# site/

Static landing page for GraphCompose AI Flow.
Built with Astro. Deployed to GitHub Pages by
[`.github/workflows/deploy-site.yml`](../.github/workflows/deploy-site.yml).

The page is data-driven: at build time it auto-pulls

- Version, plugin packaging, supported GraphCompose lines, gates and loop
  bounds from `../package.json`, `../.claude-plugin/`, `../skills/skill-manifest.json`
  and `../config/pipeline.json`
- The stage chain and the workflow skills from `../config/pipeline.json`
- Template metadata from `../templates/*/template.json`
- Preview images and the architecture diagram from `../assets/readme/`

So updating the repo updates the site on the next push. Facts that a file in
the repository owns belong in a sync script rather than in the markup — the
page advertised GraphCompose "1.6.0 via JitPack" for several releases after the
coordinate moved to Maven Central precisely because that one was typed into a
component by hand.

Two things guard the rest:

- `scripts/test/contracts.test.mjs` fails the build when a component links to a
  repository path that no longer exists, and when the run figures in
  `src/data/runs.json` stop matching the ones in the root `README.md`.
- Because that check greps the component text for `blob/main/<path>`, repository
  links are written out **literally** in the components. A helper that takes the
  path as a variable hides the link from the only thing checking it.

## Local development

```bash
cd site
npm install
npm run dev      # http://localhost:4321/graphcompose-ai-flow/
npm run build    # static output in dist/
npm run preview  # serve the built site
```

The `prebuild` / `predev` scripts run four sync scripts before Astro:

- `scripts/sync-assets.mjs` — copies preview images into `public/previews/`
- `scripts/extract-project.mjs` — version, hosts, library coordinate, skill
  packs, gates and loop bounds into `src/data/generated/project.json`
- `scripts/extract-pipeline.mjs` — the stages and workflow skills of the full
  chain into `src/data/generated/pipeline.json`
- `scripts/extract-templates.mjs` — published template manifests into
  `src/data/generated/templates.json`

Generated files and synced assets are gitignored; CI regenerates them from
source on every build.

## Deploy

The workflow triggers on push to `main` when anything under `site/`,
`config/`, `skills/`, `templates/`, `examples/cv-reference/reference/` or
`assets/readme/` changes, and also on `package.json`, `.claude-plugin/` and
`scripts/lib/version-resolver.mjs` — the page reads its version, its packaging
and the library coordinate out of those, so a bump has to redeploy it.

**One-time setup required:** in the repo settings on GitHub, go to
**Settings → Pages → Build and deployment → Source = "GitHub Actions"**.
After that, every push that touches the auto-pulled paths will rebuild and
redeploy the site.
