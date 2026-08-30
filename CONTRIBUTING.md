# Contributing

## Project goal

GraphCompose AI Template Flow documents a strict AI-assisted workflow that
turns visual document references into maintainable GraphCompose Java
templates. Contributions should make that workflow clearer, safer, or more
honest about its limitations.

## Current state

The harness is an installable plugin for Claude Code, with Codex and
Gemini CLI adapters: four workflow skills under `skills/workflows/`, the
GraphCompose knowledge in versioned packs under `skills/versions/` (the
active line is 2.2; 1.9, 1.7 and 1.6 are frozen), and the deterministic
tools under `scripts/` and `tools/`. See [docs/roadmap.md](docs/roadmap.md)
for the phase table and [docs/architecture.md](docs/architecture.md) for
the layer split. The five committed skill fixtures compile, run and
render against `io.github.demchaav:graph-compose:2.2.0` from Maven
Central (pins ≤ 1.6.5 still resolve via JitPack as
`com.github.DemchaAV:GraphCompose:vX.Y.Z`). The conceptual skills stay at
`status: needs-validation` on coverage — five fixtures are a subset of
what fourteen skills describe.

Open contribution areas:

- documentation fixes and workflow clarifications
- skill content corrections (concrete GraphCompose API methods must
  be backed by the real library or by a passing fixture smoke test;
  see [docs/skill-validation.md](docs/skill-validation.md))
- skill manifest entries when a new skill is added
- revision-model and rollback-model corrections
- agent role descriptions
- corrections to the example revisions under
  `examples/invoice-reference/`
- repository-contract checks in [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
- bug fixes in any of the three `tools/` modules
- new fixture scaffolds under `examples/skill-fixtures/`
- real visual baselines for the skill fixtures + visual-diff
  regression (the renderer now writes `output.pdf` / `output.png`;
  the baseline orchestration is the open gate)

## Filing issues

Use the GitHub issue tracker. Issue templates under `.github/ISSUE_TEMPLATE/`
are planned but not yet present. Until then, please include:

- what you observed
- what you expected
- which file the issue is about
- a minimal example when relevant

## Documentation rules

- Do not invent GraphCompose APIs. Every claim about library behavior must be
  traceable to a verified skill version. If a skill has not yet been written
  for a behavior, describe the behavior as "to be verified" rather than as
  a fact.
- Quote skill files by their full path under `skills/versions/<version>/`.
- When a change touches both the workflow and the agent prompts, update both
  in the same change set.
- Prefer plain GitHub-flavored markdown. No emojis. Lines under ~100 chars
  where possible.

## Skill drift policy

```text
If GraphCompose behavior differs from the skill documentation, the library is treated as the source of truth.

The skill must be updated.

The agent must not silently work around incorrect skills.
```

This rule is the foundation of the project. Pull requests that work around
a buggy skill instead of fixing the skill will be rejected.

## Commit convention

- Short imperative subject (under ~72 chars). Examples:
  `docs: clarify visual accuracy contract`,
  `skills: fix metadata block for tables.md`.
- Body explains why the change is needed, not just what changed.
- Reference the related issue when one exists.
- One logical change per commit.

## Branching and release workflow

`main` is always the clean, usable, releasable state of the kit. Never develop
the flow itself directly on `main` — a half-finished tooling change must not sit
on the branch a user renders from.

- **Branch per change.** Cut a topic branch off `main` for every flow update:
  `feat/<slug>`, `fix/<slug>`, `docs/<slug>`, or `chore/<slug>`. Do the work,
  render, and review there; `main` stays usable the whole time.
- **Document work vs flow work.** Day-to-day template work (new revisions in a
  user's workspace, or under `examples/<project>/revisions/` when developing
  the harness) is the product output and lands through the normal revision
  flow. Changes to the *tooling* — `scripts/`, the `tools/` modules,
  `skills/`, `config/`, `schemas/`, the docs — are "flow updates" and belong on
  a topic branch.
- **Merge when it is done.** When the change is finished and reviewed, merge the
  branch into `main` (fast-forward or PR) so `main` only ever moves forward in
  releasable steps.
- **Release from a known-good `main`:**
  1. Move the `## Unreleased` notes in `CHANGELOG.md` under a new
     `## vX.Y.Z — <date>` heading (SemVer; the kit stays in `0.x`).
  2. **Open that section with a `**Why update.**` paragraph** — two or three
     sentences, in the second person, about what changes for someone already on
     the previous version, and what they have to do to get it. It is the first
     thing in the published release notes, and for most readers the only thing.
     A section that opens with `### Fixed` tells a reader deciding whether to
     update precisely nothing.
  3. Flip the version in `package.json`, `.claude-plugin/plugin.json` and the
     `/plugin marketplace add` line in `docs/plugin-installation.md`, and commit
     as `release: vX.Y.Z — <phrase>`.
  4. Tag it *annotated*, because the tag's subject becomes the release title:
     `git tag -a vX.Y.Z -m "vX.Y.Z — <the same phrase>" && git push origin vX.Y.Z`.
  5. The `release` workflow publishes the GitHub Release from the tag, taking
     the notes from the CHANGELOG section and the title from the tag's subject.
     Nothing is typed at publish time, so nothing can drift from the tag — both
     hand-made releases in this repository did, and v0.13.0 through v0.20.0 got
     no release at all. Re-run it for an older tag with
     `gh workflow run release.yml -f tag=vX.Y.Z`.
  6. The tag is the citable version in the compatibility matrix.

The commit rules above still apply on branches: explicit staging, one logical
change per commit, imperative subjects.

## Pull request checklist

Before requesting review:

- [ ] Changes respect the ownership boundaries in
      [docs/agents.md](skills/workflows/README.md) and the skill drift rule in
      [docs/skill-validation.md](docs/skill-validation.md).
- [ ] No invented GraphCompose API appears in any new or modified text.
      Cross-check every concrete method name against the real library
      before claiming it as supported.
- [ ] Cross-references use the canonical paths under `docs/`, `skills/`,
      `scripts/`, `examples/`, and `validation/`.
- [ ] If a revision-related change is made, the revision quality rules in
      the revision model docs still hold.
- [ ] If a skill-related change is made, the skill quality rules in the
      versioned-skills docs still hold.
- [ ] If new agent behavior is described, the shared agent rules in
      `AGENTS.md` are not contradicted.
- [ ] Honest limitations are preserved. The project does not claim perfect
      screenshot-to-code conversion.
- [ ] Tone stays clear, serious, practical, and open-source ready.
