# Quickstart

This repository is not a hosted app and not a one-command
screenshot-to-template product yet. It is a local workflow kit for
building GraphCompose Java templates from visual document references with
revision history, rendering, and visual review.

Use it for three things:

- Run the invoice example and inspect real rendered output.
- Use the local tools: revision manager, preview renderer, visual diff.
- Start a new document-template project that follows the same artifact
  and review discipline.

## Requirements

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

GraphCompose 1.6.6 is resolved by Maven through Maven Central as:

```text
io.github.demchaav:graph-compose:1.6.6
```

Older pins (≤ v1.6.5) continue to resolve through JitPack as
`com.github.DemchaAV:GraphCompose:vX.Y.Z` — no `<repositories>` block
is needed for 1.6.6+. That artifact is compiled for Java 21, so Java
17 is not enough for GraphCompose-backed renders or fixture
validation.

## Install the Tooling

From the repository root:

```powershell
cd tools\revision-manager
npm ci
npm run build
npm test

cd ..\visual-diff
npm ci
npm run build
npm test

cd ..\preview-renderer
mvn -q -B test
mvn -q -B -DskipTests=true package

cd ..\..
node .github\scripts\repository-contract.mjs
```

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

Fill the revision artifacts by following the prompt chain in
`prompts/`:

```text
orchestrator-agent.md
version-skill-resolver-agent.md
skill-validator-agent.md
visual-analyzer-agent.md
architecture-mapper-agent.md
template-coder-agent.md
test-render-agent.md
visual-review-agent.md
revision-manager-agent.md
```

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
- compile it against GraphCompose 1.6.6
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
