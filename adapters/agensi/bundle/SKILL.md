---
name: graphcompose-ai-flow
description: 'Turn a document reference (screenshot, PDF or design image of a CV, invoice, proposal, cover letter, report or certificate) into a maintainable GraphCompose Java template, then render, compare against the reference and iterate until it is ready for approval. Also revises, reviews and approves existing templates. Use when the user wants to recreate a document with GraphCompose, change or compare a GraphCompose template, or set up GraphCompose AI Flow for the first time.'
license: MIT
metadata:
  version: '{{VERSION}}'
---

# GraphCompose AI Flow

A harness, not a prompt: it walks you through analysing a reference,
writing GraphCompose code, rendering it, measuring the difference against
the reference and fixing one cause per pass, until the result is ready for
the user's approval. It works in Claude Code and Codex.

**Harness root:** this skill's own directory, the one holding this file.
Every command below and in the workflow skills runs from there.

## First run (do this before anything else)

Setup is done when `.bootstrap.json` exists in the harness root and its
`missing` list is empty. If it does not exist, or `missing` is not empty:

1. Check the machine. Nothing is changed:

   ```
   node install/bootstrap.mjs --check
   ```

   If `node` itself is missing or older than 20, use the wrapper instead:
   `powershell -ExecutionPolicy Bypass -File install/bootstrap.ps1` on
   Windows, `bash install/bootstrap.sh` on macOS/Linux. They take the same
   flags.

2. If Java 21+, Maven or ImageMagick is reported missing, **tell the user
   which ones and ask before installing them**. They are system packages
   (winget/Scoop on Windows, Homebrew on macOS, apt on Linux). With a yes:

   ```
   node install/bootstrap.mjs --install-missing
   ```

   Without a yes, show the commands the check printed and stop.

3. With everything present, finish the install:

   ```
   node install/bootstrap.mjs
   ```

   It installs the npm runtime dependencies, builds the preview renderer
   from the Java sources in `tools/preview-renderer/` with Maven,
   pre-fetches the GraphCompose library into the local Maven repository,
   and registers the four workflow skills with the agent that loaded this
   bundle (`~/.claude/skills` or `~/.codex/skills`). Pass `--host claude`
   or `--host codex` if it reports `host: none`.

On Windows, a tool installed during step 2 may need a new terminal before
it appears on PATH; re-run step 1 to confirm.

## What this skill runs, reads and connects to

Nothing here is downloaded or executed that is not either in this bundle
as readable source or installed by a package manager you approved.

- **Commands:** `node` (the scripts in this bundle), `mvn` (to build the
  preview renderer and compile and render templates), `magick` (to
  compare renders), and, only with `--install-missing`, the platform
  package manager (`winget`/`scoop`, `brew`, `apt-get`).
- **Network:** the npm registry (registry.npmjs.org) for five small
  runtime dependencies (commander, pixelmatch, pngjs, ajv, ajv-formats),
  and Maven Central (repo.maven.apache.org) for GraphCompose, PDFBox and
  the Maven build plugins. Nothing else, and nothing is sent anywhere.
- **Environment variables:** `PATH`; `CLAUDE_CONFIG_DIR` / `CODEX_HOME`
  if you set them, to find the agent's skills directory; the harness's
  own optional switches (`RENDER_*`, `MAGICK_BINARY`,
  `GRAPHCOMPOSE_LIVE_DIR`, `NO_COLOR`); on Windows `LOCALAPPDATA` and
  `ProgramFiles(x86)`, only to locate ImageMagick and SumatraPDF; and
  `CLAUDE_CODE_SESSION_ID`, only to label which session holds a project
  lock. None of them is logged or sent anywhere.
- **Files written:** `.bootstrap.json` and `node_modules/` inside this
  bundle, the built jar under `tools/preview-renderer/target/`, four stub
  skills in the agent's skills directory, and your work under
  `graphcompose-flow/` in your Java project.

In a sandboxed agent (Codex by default), run the bootstrap with network
allowed.

## Then: pick the workflow

Read the matching skill in full before acting. Each is the contract for
its job: steps, commands, gates.

| The user wants to… | Read |
|---|---|
| recreate a document from a screenshot, PDF or image | `skills/workflows/create-template/SKILL.md` |
| change a template that already renders | `skills/workflows/revise-template/SKILL.md` |
| know what is still different, without changing anything | `skills/workflows/review-template/SKILL.md` |
| accept the current render ("approve", "ship it", "looks good") | `skills/workflows/approve-template/SKILL.md` |

Start every run with the preflight. It points at the user's Java project,
and the work lands there, never inside this bundle:

```
node scripts/preflight.mjs --project-dir <the user's Java project>
```

## Holds regardless

- Never invent GraphCompose API. The pinned knowledge pack's
  `00-api-surface.md` is a closed set.
- Every change opens a new revision. Never overwrite an APPROVED one.
- Resolve the GraphCompose version from the user's build file, never by
  asking.
- Work goes in the user's workspace (`graphcompose-flow/`), not in this
  bundle.
- Parity is proved by `render-and-diff`, not by "looks identical".

## Uninstall

```
node install/bootstrap.mjs --uninstall
```

Removes the registered workflow skills and the marker. Then delete this
directory.
