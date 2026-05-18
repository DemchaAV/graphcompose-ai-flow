# Skill Validation Report

Output of the Skill Validator Agent for `revision-001`. The
agent's responsibilities and the "source of truth" rule are
documented in
[`../../../../docs/agents.md`](../../../../docs/agents.md#skill-validator-agent)
and the project plan (§5.3 and §7).

## Pack under review

`skills/versions/graphcompose-1.6` (the pack selected by
[`./version-resolution.md`](./version-resolution.md)).

## Skills validated

The full 14-skill manifest was inspected. Each entry in the
manifest carries the same status the file's metadata block does
(`needs-validation`), because the Phase 4 validation fixtures
described in
[`../../../../docs/skill-validation.md`](../../../../docs/skill-validation.md)
have not yet shipped.

| Skill id | Manifest status | File status |
|---|---|---|
| `graphcompose-basics` | `needs-validation` | `needs-validation` |
| `visual-to-graphcompose-mapping` | `needs-validation` | `needs-validation` |
| `layout-primitives` | `needs-validation` | `needs-validation` |
| `tables` | `needs-validation` | `needs-validation` |
| `themes-and-colors` | `needs-validation` | `needs-validation` |
| `typography` | `needs-validation` | `needs-validation` |
| `spacing-and-alignment` | `needs-validation` | `needs-validation` |
| `backgrounds-and-panels` | `needs-validation` | `needs-validation` |
| `layer-stacks-and-overlays` | `needs-validation` | `needs-validation` |
| `shapes-and-containers` | `needs-validation` | `needs-validation` |
| `pagination` | `needs-validation` | `needs-validation` |
| `visual-regression` | `needs-validation` | `needs-validation` |
| `revision-discipline` | `needs-validation` | `needs-validation` |
| `troubleshooting` | `needs-validation` | `needs-validation` |

This report mirrors the manifest as authored. No skill has been
promoted to `active` in this run; the validator did not invent any
new validations.

## Drift detected

None reported. No skill recommends a method that the validator has
seen the real library remove, and no skill rewrites a published
example to bypass library behavior. Because no validation fixtures
exist yet to render against, drift can only be re-assessed once
the Phase 4 fixtures land.

## Conclusion

The run proceeds. Downstream agents must use only the primitives
documented in the loaded skills and must respect the no-invented-API
rule in
[`../../../../docs/versioned-skills.md`](../../../../docs/versioned-skills.md).
Any visual mismatch that surfaces during the visual review must be
classified per the visual accuracy contract in
[`../../../../docs/visual-accuracy-contract.md`](../../../../docs/visual-accuracy-contract.md);
if the mismatch is caused by skill documentation that disagrees
with library behavior, the Skill Validator Agent will be re-run and
will produce a `skill-fix-report.md` per the drift rule (§7.4 of
the plan).

Until then, this run treats the skills as authoritative for
*structure* and *naming discipline* (which primitives apply to
which regions, which token naming convention to use) but treats
exact method signatures as approximate. The Template Coder Agent
mitigates this by emitting `TODO(visual-review)` comments anywhere
it makes a behavioral assumption that the Phase 4 fixtures will
later confirm.
