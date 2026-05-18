# Contributing

## Project goal

GraphCompose AI Template Flow documents a strict AI-assisted workflow that
turns visual document references into maintainable GraphCompose Java
templates. Contributions should make that workflow clearer, safer, or more
honest about its limitations.

## Current phase

The project is in Phase 1: documentation MVP only.

There is no `tools/` directory yet. There are no implemented CLI commands.
There is no skill pack content under `skills/versions/`. Please do not open
pull requests that add tool code, example projects, or skill files against a
phase that is not yet open. The phase plan is in
[docs/roadmap.md](docs/roadmap.md).

Acceptable Phase 1 contributions:

- documentation fixes
- workflow clarifications
- corrections to agent role descriptions
- corrections to the revision model
- corrections to the visual accuracy contract
- corrections to the skill manifest schema

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

- [ ] The change targets Phase 1 scope (docs only) or an explicitly open
      later phase.
- [ ] No invented GraphCompose API appears in any new or modified text.
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
