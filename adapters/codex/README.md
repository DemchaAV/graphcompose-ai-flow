# Codex adapter

Same skills, same tools, same contracts — only the packaging differs.

Claude Code takes a plugin manifest that can point at a nested skills
directory. Codex looks for `~/.codex/skills/<name>/SKILL.md`: flat, one
directory per skill, no manifest. This adapter bridges that, and nothing
else. **There is no Codex fork of the workflow**; if you find yourself
editing behaviour here, it belongs in
[`skills/workflows/`](../../skills/workflows/README.md).

## Install

```bash
npm run setup                      # once: builds the tools
node adapters/codex/install.mjs
```

That installs two things:

```text
~/.codex/graphcompose-flow/<version>/   the harness runtime, copied (~6 MB)
~/.codex/skills/graphcompose-*/         four stubs pointing into it
```

**The source checkout is not needed afterwards.** You can move it,
rename it, put it on a drive you do not always mount, or delete it: the
skills keep working, because they point at the installed copy rather
than at where you happened to clone.

| Flag | Effect |
|---|---|
| `--home <dir>` | where the runtime goes (default `~/.codex/graphcompose-flow`) |
| `--dest <dir>` | skills directory (default `~/.codex/skills`) |
| `--prefix <p>` | change the `graphcompose-` name prefix |
| `--link` | point the skills at THIS checkout instead of copying |
| `--skip-deps` | do not run `npm ci` inside the copy |
| `--prune` | remove installed versions other than this one |
| `--dry-run` | print what would happen, change nothing |
| `--uninstall` | remove the stubs and the installed runtime |

Installing a new release writes a new version directory, so it cannot
half-overwrite the one a running session is using. `--prune` reclaims
the old ones when you want the disk back.

Working on the harness itself? `--link` keeps the old behaviour — the
skills track your working tree, and break if it moves. That trade is
right for a contributor and wrong for everyone else.

## What is copied, and what is not

Only what the skills actually reach for at run time: `config/`,
`schemas/`, `scripts/`, `skills/` (all version packs), the four tools —
the two TypeScript CLIs as their build output plus their runtime
dependencies, the asset resolver as source, and the preview renderer's
jar. Roughly 6 MB.

Not copied: `examples/`, `templates/`, `docs/`, the site, and the
superseded prompt chain. A "self-contained install" that mirrored the
whole repository would ship the architecture this harness replaced.

The install refuses to run against an unbuilt checkout — exit 69, the
same code the CLIs use — because copying a tree with no `dist/` and no
jar would produce an install that fails on first use instead of at
install time.

## Why each skill is a stub

Each installed `SKILL.md` carries the frontmatter — copied verbatim,
because the `description` is what makes Codex offer the skill at all —
and then points at the canonical file inside the installed runtime
instead of repeating it.

The alternative was copying the skill bodies plus the four shared
references into each flat directory. That is four copies of one
contract, and they start drifting the day they are written. This
migration exists to remove exactly that failure mode, so the adapter
does not reintroduce it one directory down. The cost is one extra file
read; the benefit is that the Codex copy cannot say something the source
does not.

## Windows and PowerShell

Codex's global `AGENTS.md` asks for PowerShell-compatible commands on
Windows, and warns off bash-only constructs. The skills comply by
construction: every command they document is a plain `node …`
invocation, with no pipes, no line continuations, no `$(…)`, no heredocs
and no `/tmp`. They run unchanged in PowerShell, cmd and bash — do not
"translate" them.

Two things to know on Windows:

- Clone to a short path. Deep Java package names under
  `examples/skill-fixtures/` can exceed `MAX_PATH`; `git config --global
  core.longpaths true` fixes it permanently.
- `graphcompose-flow` and `visual-diff` exit with code 69 and an
  instruction until `npm run setup` has built them. That is the symptom,
  not a bug.

## Where the contracts live

Codex reads `AGENTS.md` from the repository root; that file points at
the same places the skills do, and duplicates none of them:

| What | Where |
|---|---|
| Workflow | [`skills/workflows/`](../../skills/workflows/README.md) |
| Scope → stages routing, limits, failure categories | [`config/pipeline.json`](../../config/pipeline.json) |
| GraphCompose API knowledge | [`skills/versions/`](../../skills/versions/) |
| On-disk artifact shapes | [`schemas/`](../../schemas/) |
