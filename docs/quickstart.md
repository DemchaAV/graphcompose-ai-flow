# Quickstart — working inside this repository

> **Using the harness rather than developing it?** You do not need this
> page. Install it into your agent —
> [`docs/plugin-installation.md`](plugin-installation.md) for Claude
> Code, [`adapters/codex/README.md`](../adapters/codex/README.md) for
> Codex — then open your own Java project and ask. Your work lands in
> that project, not here.

This page is the contributor path: running the harness from a clone, in
what the tools call **development mode**, where the workspace is this
repository's own `examples/` and `templates/` rather than a user's
project. Everything below assumes that.

Use it for three things:

- Run the invoice example and inspect real rendered output.
- Use the local tools: revision manager, preview renderer, visual diff.
- Start a new document-template project that follows the same artifact
  and review discipline.

## Requirements

> **Zero local install — GitHub Codespaces / Dev Container.** This repo ships
> [a dev container](../.devcontainer/devcontainer.json) with Java 21, Node 20,
> Maven, and ImageMagick preconfigured. On GitHub: **Code -> Codespaces ->
> Create**; or in VS Code: **Dev Containers: Reopen in Container**. It runs
> `npm run setup` on first create, so the tools build automatically -- skip
> straight to [First Smoke Test](#first-smoke-test). The manual requirements
> below are only for a local (non-container) setup.

Install these first:

- Java 21 or newer
- Maven
- Node.js 20 or newer
- Git

On Windows / PowerShell, check them with:

```powershell
java -version
mvn -version
node --version
npm --version
git --version
```

GraphCompose 1.9.0 is resolved by Maven through Maven Central as:

```text
io.github.demchaav:graph-compose:1.9.0
```

Older pins (≤ v1.6.5) continue to resolve through JitPack as
`com.github.DemchaAV:GraphCompose:vX.Y.Z` — no `<repositories>` block
is needed for 1.6.7+. That artifact is compiled for Java 21, so Java
17 is not enough for GraphCompose-backed renders or fixture
validation.

## Install the Tooling

From the repository root, run the setup script. It checks your toolchain
(Node 20+, npm, Java 21+, Maven), installs and builds the local Node tools,
and packages the Java preview renderer:

```powershell
.\setup.ps1
```

On macOS / Linux:

```bash
./setup.sh
```

Either is equivalent to `npm run setup`. To verify your toolchain without
installing anything, run `npm run setup:check`.

<details>
<summary>What the script runs (manual equivalent)</summary>

```powershell
cd tools\revision-manager
npm ci
npm run build

cd ..\visual-diff
npm ci
npm run build

cd ..\preview-renderer
mvn -q -B -Dmaven.test.skip=true package

cd ..\..
```

</details>

> Setup is build-only. The tool test suites (`npm test` in each Node tool,
> `mvn -q -B test` in preview-renderer) are for contributors, not required
> to install or use the kit — CI runs them on every push.

After this, the local tools are ready:

- `tools\revision-manager\bin\graphcompose-flow.mjs`
- `tools\preview-renderer\target\preview-renderer.jar`
- `tools\visual-diff\bin\visual-diff.mjs`

## First Smoke Test

Render the current invoice example:

```powershell
node scripts\render-invoice-reference.mjs
```

By default this renders the latest invoice draft, currently
`revision-003`.

Outputs:

```text
examples/invoice-reference/revisions/revision-003/output.pdf
examples/invoice-reference/revisions/revision-003/output.png
```

You can render a specific revision too:

```powershell
node scripts\render-invoice-reference.mjs revision-001
node scripts\render-invoice-reference.mjs revision-002
node scripts\render-invoice-reference.mjs revision-003
```

You can also render the two-page CV reference example:

```powershell
node scripts\render-cv-reference.mjs revision-002
```

Outputs:

```text
examples/cv-reference/revisions/revision-002/output.pdf
examples/cv-reference/revisions/revision-002/output.png
examples/cv-reference/revisions/revision-002/output-page-2.png
```

## Live preview (watch renders update)

Every render also refreshes a single stable copy of the latest output under
`live/` at the repository root:

```text
live/current.pdf        clean render (open this)
live/current-debug.pdf  debug render with guide lines
live/current.png        page-1 raster
live/current.txt        which project / revision / time it reflects
```

`live/current.pdf` always points at the most recent render, whatever project
or revision produced it — so you do not have to dig into
`examples/<project>/revisions/<latest>/` to find the newest output.

Open it once in [SumatraPDF](https://www.sumatrapdfreader.org/) — it reloads a
PDF automatically when the file changes and does not lock it — and leave it
open while you iterate; each render refreshes the view in place:

```powershell
node scripts\preview-live.mjs           # opens live\current.pdf
node scripts\preview-live.mjs --debug   # opens live\current-debug.pdf
```

`npm run preview` is the same thing. The helper finds SumatraPDF on `PATH`, at
`%LOCALAPPDATA%\SumatraPDF`, or via `SUMATRAPDF_PATH`; with none found it falls
back to the OS default PDF viewer (which may not live-reload).

The `live/` folder is gitignored. To keep it off OneDrive (avoiding sync churn)
point `GRAPHCOMPOSE_LIVE_DIR` at another path; disable the mirror entirely with
`RENDER_NO_LIVE=1`.

## Inspect the Revision History

```powershell
node tools\revision-manager\bin\graphcompose-flow.mjs status --project examples\invoice-reference
node tools\revision-manager\bin\graphcompose-flow.mjs history --project examples\invoice-reference
node tools\revision-manager\bin\graphcompose-flow.mjs diff revision-002 revision-003 --project examples\invoice-reference
```

The important idea: every change creates a new revision folder. Older
revisions stay on disk and can be compared, rejected, approved, or used
as rollback sources.

## How to Start a New Document Project

Create a project folder:

```powershell
cd examples
node ..\tools\revision-manager\bin\graphcompose-flow.mjs init my-document
cd ..
```

> This page is the **contributor** path, where the workspace is this
> repository's own `examples/`. In your own Java project it is one
> command instead, and it is the first one to run:
>
> ```powershell
> node scripts\init-workspace.mjs --project-dir C:\path\to\java-project --project my-document
> ```
>
> See [`plugin-installation.md`](plugin-installation.md).

Add your reference material:

```text
examples/my-document/reference/reference.png
examples/my-document/reference/reference.md
```

Use `reference.png` for the real visual target. Use `reference.md` to
describe anything that the image alone does not make clear: page size,
fonts, colors, spacing, table behavior, business data, and acceptable
differences.

Create the first draft revision:

```powershell
node tools\revision-manager\bin\graphcompose-flow.mjs new-revision "Create first template draft from the reference." --project examples\my-document
```

That creates:

```text
examples/my-document/revisions/revision-001/
```

Fill the revision artifacts by following the workflow skill that owns
the gesture — for a first draft from a reference that is
[`skills/workflows/create-template/SKILL.md`](../skills/workflows/create-template/SKILL.md).
To see the exact stages and commands for this project and revision:

```powershell
node scripts\run-pipeline.mjs my-document
```

That prints the skill to follow, the ordered stages, the render command
and the approve command. The chain comes from
[`config/pipeline.json`](../config/pipeline.json), which is the only
place it is declared.

The eleven-agent prompt chain this replaced has been removed; the
skills are the contract. The old files are in git history if you ever
need to see what they said.

The generated Java template should live in:

```text
examples/my-document/revisions/revision-001/generated-template.java
```

## Rendering a New Template

The shared preview renderer executes compiled template classes. It does
not compile raw `generated-template.java` files by itself.

For a new project, copy the pattern from:

```text
examples/invoice-reference/render-runner/
```

That runner shows how to:

- copy the selected revision's `generated-template.java` into Maven
  generated sources
- compile it against GraphCompose 1.9.0
- provide sample business data through a spec provider
- call `tools/preview-renderer` to write `output.pdf` and `output.png`

For a template that is already compiled, call the renderer directly:

```powershell
java -jar tools\preview-renderer\target\preview-renderer.jar render `
  --revision examples\my-document\revisions\revision-001 `
  --template-class com.example.GeneratedTemplate `
  --classpath-file path\to\runtime-classpath.txt `
  --spec-provider com.example.SampleSpecProvider `
  --output output.pdf `
  --preview output.png `
  --dpi 150 `
  --page 0
```

## Visual Diff

Once you have both a reference PNG and a rendered output PNG with the
same dimensions:

```powershell
node tools\visual-diff\bin\visual-diff.mjs `
  examples\my-document\reference\reference.png `
  examples\my-document\revisions\revision-001\output.png `
  --out examples\my-document\revisions\revision-001\output-diff.png `
  --update-revision examples\my-document\revisions\revision-001
```

This writes a diff image, JSON stats, and a review snippet into the
revision folder.

## Revision Commands

```powershell
node tools\revision-manager\bin\graphcompose-flow.mjs status --project examples\my-document
node tools\revision-manager\bin\graphcompose-flow.mjs history --project examples\my-document
node tools\revision-manager\bin\graphcompose-flow.mjs new-revision "Move footer lower." --project examples\my-document
node tools\revision-manager\bin\graphcompose-flow.mjs approve revision-001 --project examples\my-document
node tools\revision-manager\bin\graphcompose-flow.mjs reject revision-002 --project examples\my-document
node tools\revision-manager\bin\graphcompose-flow.mjs undo --project examples\my-document
node tools\revision-manager\bin\graphcompose-flow.mjs revert-approved --project examples\my-document
node tools\revision-manager\bin\graphcompose-flow.mjs diff revision-001 revision-002 --project examples\my-document
```

## What Is Still Manual

Today the repository gives you the workflow, prompts, versioned skills,
revision manager, renderer, visual-diff tool, fixtures, and a rendered
invoice example.

It does not yet provide:

- a GUI
- hosted agent orchestration
- automatic screenshot-to-approved-template generation
- automatic compilation for arbitrary `generated-template.java` files
- real visual baselines for the invoice example

The practical way to use it now is as a disciplined local lab: create a
reference, generate or write a GraphCompose template, render it, compare
it, revise it, and preserve every step as a revision.
