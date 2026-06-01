# skill-validation-cache

Content-addressed cache for the Skill Validator Agent's verdict.
The first time the validator runs against a given `(target version,
covered skills, skill pack content)` triple, the result is stored;
every subsequent revision that resolves the same triple gets the
verdict back instantly without re-running fixtures.

## When this saves work

The current `prompts/skill-validator-agent.md` contract requires the
validator to run on every revision. In practice the inputs change
rarely:

- Target GraphCompose coordinate is project-pinned in
  `template-project.json.targetGraphComposeVersion` and only flips
  on a deliberate upgrade revision.
- The covered skill list is decided per revision by the architecture
  plan, but small revisions reuse the same skill set as the parent.
- The skill pack content (`skills/versions/<name>/*.md`) changes
  when the pack itself ships a new version, not on every project
  revision.

Across a typical revision chain (8 revisions on `cv-reference`,
3 on `invoice-reference`), the validator's inputs are byte-identical
on 80-95% of revisions. Those are pure cache hits.

## Cache key

```text
sha256(
  "coord:<targetCoordinate>\n---\n" +
  "skills:<sorted skill IDs joined by ','>\n---\n" +
  "pack:<filename:contentHash for every *.md in skill pack, sorted>"
)
```

Three properties of the key:

1. **Skill order does not matter.** The list is sorted before
   hashing — `[tables, layout-primitives]` and
   `[layout-primitives, tables]` hash to the same key.
2. **A single byte change in any skill `.md` invalidates the
   verdict.** This is the conservative direction: a docs-only edit
   forces a re-validation, which is correct because the validator
   may need to re-fixture the changed skill.
3. **Files outside the skill pack do not shift the key.** Tooling
   changes, README edits, agent prompt rewrites — all ignored.

## CLI

```bash
# 1. Compute the key (no I/O)
skill-validation-cache key \
  --target io.github.demchaav:graph-compose:1.6.7 \
  --skills layout-primitives,tables,themes-and-colors \
  --skill-pack skills/versions/graphcompose-1.6

# 2. Look it up (exit 0 = hit + JSON entry on stdout; exit 1 = miss)
skill-validation-cache lookup \
  --target io.github.demchaav:graph-compose:1.6.7 \
  --skills layout-primitives,tables,themes-and-colors \
  --skill-pack skills/versions/graphcompose-1.6

# 3. Store after a real validation run (reportBody from stdin or file)
cat skill-validation-report.md | skill-validation-cache store \
  --target io.github.demchaav:graph-compose:1.6.7 \
  --skills layout-primitives,tables,themes-and-colors \
  --skill-pack skills/versions/graphcompose-1.6 \
  --verdict pass

# 4. List cache contents
skill-validation-cache list

# 5. Delete one entry by key
skill-validation-cache delete --key 93a6eb13e888...
```

Default cache directory:
`tools/skill-validation-cache/.cache/` (gitignored). Override with
`--cache <dir>` on any command.

## Skill Validator integration

The recommended sequence inside the Skill Validator Agent run:

1. **Compute the key.** `skill-validation-cache key …` against the
   resolved coordinate + the covered skills list from the
   architecture plan.
2. **Look it up.** If exit 0, copy `entry.reportBody` verbatim into
   the revision's `skill-validation-report.md` (the trailing
   `verdict:` line is preserved). DO NOT re-fixture. Hand off to the
   next agent based on the verdict.
3. **On miss, run the full validation.** Then `skill-validation-cache
   store …` with the produced report body and the resolved verdict.

The orchestrator's halt contract is unchanged: a `verdict: halt`
report blocks every downstream agent whether it came from cache or
from a fresh run.

## Cache invalidation

The cache is purely additive. Entries are never silently overwritten
on store — same key + same payload = same entry. A real
invalidation surface is:

- **Skill pack version bump.** Any byte change inside
  `skills/versions/<name>/*.md` produces a new key.
- **Target coordinate flip.** A revision that upgrades GraphCompose
  picks a new coordinate string → new key.
- **Architecture plan changes the covered skill set.** A revision
  that introduces a new layout primitive adds its skill ID to the
  set → new key.

If a manual purge is ever needed (e.g. a skill .md file's content
was correct but its fixture was secretly broken), use
`skill-validation-cache delete --key <hex>` or just remove the
`.cache/` directory.

## CI

The `skill-validation-cache` job in
[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) runs
`npm test` on every push — the smoke test exercises key computation,
miss → store → hit round-trip, sensitivity to target version, and
insensitivity to skill order.
