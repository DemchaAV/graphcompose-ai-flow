# Gemini CLI adapter

Same skills, same tools, same contracts — only the packaging differs.

**What to expect.** The extension installs and the workflow runs, and the
templates Gemini CLI produces are noticeably weaker than Claude Code's or
Codex's on the same reference: more passes to a comparable render, more
corrections from you, more hand-finishing before approval. That is the
model behind the host, not the harness — the skills and the tools are
identical on all three. Use it when Gemini is the agent you have; start
with one of the other two when you can.

Gemini CLI has no plugins. It has **extensions**: one directory under
`~/.gemini/extensions/<name>/` with a `gemini-extension.json` manifest,
and conventional subdirectories the CLI picks up by itself — `commands/`
for slash commands (TOML, not Markdown), `hooks/hooks.json` for hooks,
and `skills/<name>/SKILL.md` for agent skills. Everything the Claude
plugin declares has somewhere to land; only the file formats and two
event names differ.

This adapter bridges that, and nothing else. **There is no Gemini fork of
the workflow**; if you find yourself editing behaviour here, it belongs
in [`skills/workflows/`](../../skills/workflows/README.md).

## Install

```bash
npm run setup                       # once: builds the tools
node adapters/gemini/install.mjs
```

Restart Gemini CLI afterwards — extensions, commands and hooks are read
at startup.

That writes one directory:

```text
~/.gemini/extensions/graphcompose-flow/
├── gemini-extension.json       name, version, description
├── GEMINI.md                   the always-loaded pointer, deliberately tiny
├── commands/                   create · revise · review · approve
├── hooks/hooks.json            telemetry checkpoints
└── skills/graphcompose-flow/   the harness runtime, with a router SKILL.md
```

**The source checkout is not needed afterwards.** You can move it, rename
it, put it on a drive you do not always mount, or delete it: the
extension carries its own copy of the runtime (~9 MB).

| Flag | Effect |
|---|---|
| `--dest <dir>` | extensions directory (default `~/.gemini/extensions`) |
| `--name <name>` | extension directory and manifest name (default `graphcompose-flow`) |
| `--link` | point the skill at THIS checkout instead of copying |
| `--skip-deps` | do not run `npm ci` inside the copy |
| `--dry-run` | print what would happen, change nothing |
| `--uninstall` | remove the extension directory |

## Why one skill, and not four

This is the one place where Gemini's model forces a different shape, and
it is worth understanding before changing anything here.

**A Gemini tool may only read inside the workspace.** Activating a skill
adds exactly one directory to that workspace — the one holding its
`SKILL.md` — and nothing else. The Codex adapter installs four stubs that
point at a runtime stored elsewhere; the same trick here would install
cleanly, list cleanly, activate cleanly, and then have every path the
skill names refused when the agent tried to open it.

That matters because the harness is not a page of instructions. A run
reads the version pack's loading map, four to six pack files, the API
allow-list, and the shared references — from the install.

So the runtime **is** the skill directory: `skills/graphcompose-flow/` is
the harness, and its generated `SKILL.md` is a router that points at
`AGENTS.md` and the four canonical workflow skills sitting beside it. One
activation, one confirmation, and everything the workflow reads is
readable. The four skill files stay canonical — Gemini reads the same
`skills/workflows/<name>/SKILL.md` that Claude Code and Codex do.

The alternative was four Gemini skills, each carrying its own copy of the
packs and references. That is four copies of one contract, and they start
drifting the day they are written.

## What you get

**Four slash commands**, generated from the same `commands/*.md` the
Claude plugin ships, with their descriptions copied verbatim:

```text
/create    a template from a reference
/revise    change an existing template, as a new revision
/review    what is still different, without opening a revision
/approve   the current draft, and publish the bundle
```

Extension commands have the lowest precedence in Gemini: if you already
have a `/create` of your own, this one becomes
`/graphcompose-flow.create` rather than shadowing yours.

**One skill**, which Gemini activates on its own when a request matches
its description — no command needed:

```text
Create a GraphCompose CV template from resume.png
```

**Telemetry hooks**, on Gemini's event names. `BeforeAgent` and
`AfterAgent` are where Claude fires `UserPromptSubmit` and `Stop`;
`SessionStart` and `SessionEnd` are the same word in both. They record
timestamps and the transcript path, decide nothing, and always exit 0.
Gemini's transcript carries per-message token counts, so
`run-metrics report` gives real figures here rather than the seam it has
for Codex — see [`scripts/telemetry/README.md`](../../scripts/telemetry/README.md).

## Checking the install

```bash
gemini extensions list
gemini extensions validate "<the extension directory>"
```

Inside a session, `/extensions list` and `/skills list` show what was
loaded. If the skill is listed and the commands are not, you are on a
Gemini older than the one that reads `commands/` out of an extension —
this adapter was built against **0.36.0**.

## Where the work goes, and where the shell stays

The harness install is never the workspace. Work lands in the user's Java
project, under `graphcompose-flow/` — see
[`workspace-layout.md`](../../skills/workflows/references/workspace-layout.md).

One Gemini-specific consequence: the skills write their commands
harness-relative (`node scripts/render.mjs`), and the generated router
and commands rewrite them to the absolute installed path. **Keep the
shell in the user's project.** Every command finds the workspace by
walking up from the working directory, so a shell moved into the harness
resolves the harness's own `examples/` instead — and the work is written
into the install. Every command prints which workspace it resolved;
believe that line.

## Contributors: `--link`

```bash
node adapters/gemini/install.mjs --link
```

The extension is generated as usual, but the skill points at your
checkout instead of a copy, so it tracks your working tree. Gemini can
only read the checkout while it is a workspace directory — which it is
when you have the repository open, and otherwise `/directory add <path>`
adds it. Re-run without `--link` for an install that survives moving the
checkout.

## Windows and PowerShell

Every command the skills document is a plain `node …` invocation, with no
pipes, no line continuations, no `$(…)`, no heredocs and no `/tmp`. They
run unchanged in PowerShell, cmd and bash — do not "translate" them. The
generated files use forward slashes everywhere for the same reason: a
Windows backslash is an escape character in two of the three shells.

Two things to know:

- Clone to a short path. Deep Java package names under
  `examples/skill-fixtures/` can exceed `MAX_PATH`; `git config --global
  core.longpaths true` fixes it permanently.
- `graphcompose-flow` and `visual-diff` exit with code 69 and an
  instruction until `npm run setup` has built them. That is the symptom,
  not a bug — and the installer refuses to run against an unbuilt
  checkout for the same reason.

## Where the contracts live

The router sends the agent to `AGENTS.md` inside the install, which
points at the same places every host's skills do, and duplicates none of
them:

| What | Where |
|---|---|
| Workflow | [`skills/workflows/`](../../skills/workflows/README.md) |
| Scope → stages routing, limits, failure categories | [`config/pipeline.json`](../../config/pipeline.json) |
| GraphCompose API knowledge | [`skills/versions/`](../../skills/versions/) |
| On-disk artifact shapes | [`schemas/`](../../schemas/) |
| What an installed harness consists of | [`adapters/lib/runtime.mjs`](../lib/runtime.mjs) |
