# Contributing

## Project goal

GraphCompose AI Template Flow documents a strict AI-assisted workflow that
turns visual document references into maintainable GraphCompose Java
templates. Contributions should make that workflow clearer, safer, or more
honest about its limitations.

## Current state

Phases 1 through 7 of the project plan are shipped. See
[docs/roadmap.md](docs/roadmap.md) for the per-phase table and
[docs/implementation-status.md](docs/implementation-status.md) for the
honest claim-vs-reality matrix. The remaining external gate is that
GraphCompose 1.6 has not yet been published to a Maven repository
reachable from this build, so the `render` subcommand in
[tools/preview-renderer](tools/preview-renderer/) is a skeleton, every
skill in the manifest stays at `status: needs-validation`, and the
committed Java template files in `examples/invoice-reference/` and
`examples/skill-fixtures/` are documentation-grade illustrations of
the intent.

Open contribution areas:

- documentation fixes and workflow clarifications
- skill content corrections (the skill files must NOT name concrete
  GraphCompose API methods until a verified fixture run pins them;
  see [docs/skill-validation.md](docs/skill-validation.md))
- skill manifest entries when a new skill is added
- revision-model and rollback-model corrections
- agent role descriptions
- corrections to the example revisions under
  `examples/invoice-reference/`
- repository-contract checks in [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
- bug fixes in any of the three `tools/` modules
- new fixture scaffolds under `examples/skill-fixtures/`

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

## Pull request checklist

Before requesting review:

- [ ] Changes respect the ownership boundaries in
      [docs/agents.md](docs/agents.md) and the skill drift rule in
      [docs/skill-validation.md](docs/skill-validation.md).
- [ ] No invented GraphCompose API appears in any new or modified text.
      Cross-check every concrete method name against the real library
      before claiming it as supported.
- [ ] Cross-references use the canonical paths under `docs/`, `skills/`,
      `prompts/`, `examples/`, and `validation/`.
- [ ] If a revision-related change is made, the revision quality rules in
      the revision model docs still hold.
- [ ] If a skill-related change is made, the skill quality rules in the
      versioned-skills docs still hold.
- [ ] If new agent behavior is described, the shared agent rules in
      `AGENTS.md` are not contradicted.
- [ ] Honest limitations are preserved. The project does not claim perfect
      screenshot-to-code conversion.
- [ ] Tone stays clear, serious, practical, and open-source ready.
