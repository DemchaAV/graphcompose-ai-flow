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
node adapters/codex/install.mjs
```

That writes four skills into `~/.codex/skills/`:
`graphcompose-create-template`, `graphcompose-revise-template`,
`graphcompose-review-template`, `graphcompose-approve-template`.

| Flag | Effect |
|---|---|
| `--dry-run` | print what would be written, write nothing |
| `--dest <dir>` | install somewhere other than `~/.codex/skills` |
| `--prefix <p>` | change the `graphcompose-` name prefix |
| `--uninstall` | remove the stubs again |

Re-run it after pulling: the stubs embed the absolute path of this
checkout, so moving or re-cloning the repository invalidates them.

Then run the one-time toolchain setup, if you have not already:

```bash
npm run setup
```

## What gets installed, and why it is a stub

Each installed `SKILL.md` carries the frontmatter — copied verbatim,
because the `description` is what makes Codex offer the skill at all —
and then points at the canonical file in this checkout instead of
repeating it.

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
