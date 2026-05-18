# Version Resolution

Output of the Version + Skill Resolver Agent for `revision-001`.
This document is required by every revision per
[`../../../../docs/agents.md`](../../../../docs/agents.md#version--skill-resolver-agent)
and the project plan (§5.2).

## Detected target GraphCompose version

`1.6.0`.

The value was read from
[`../../template-project.json`](../../template-project.json) field
`targetGraphComposeVersion`. There is no `pom.xml` or
`build.gradle` in the project at this stage of the workflow
(Phase 3 is a documentation-grade manual example), so the project
metadata file is the only source consulted. The user request did
not specify an alternative version, so no override applies.

## Selected skill pack

`skills/versions/graphcompose-1.6`.

This pack is the only one currently listed under
`supportedGraphComposeVersions` in
[`../../../../skills/skill-manifest.json`](../../../../skills/skill-manifest.json)
(`["1.6.x"]`) and it matches the detected version `1.6.0`. The
default skill pack declared in the manifest
(`defaultGraphComposeVersion: "1.6.x"`) is the same pack, so no
fallback was needed.

## Skill files loaded

The Architecture Mapper Agent and the Template Coder Agent will
operate with the following skill ids (all from
`skills/versions/graphcompose-1.6/`):

1. `graphcompose-basics`
2. `visual-to-graphcompose-mapping`
3. `layout-primitives`
4. `tables`
5. `themes-and-colors`
6. `typography`
7. `spacing-and-alignment`
8. `backgrounds-and-panels`
9. `layer-stacks-and-overlays`
10. `shapes-and-containers`
11. `pagination`
12. `visual-regression`
13. `revision-discipline`
14. `troubleshooting`

The loading order recommended by `graphcompose-basics` (basics
first, then `visual-to-graphcompose-mapping`, then primitive
skills, then cross-cutting skills) is the order the downstream
agents will consume them.

## Uncertainty notes

None for version detection. The target version is explicit in the
project metadata and matches the only supported skill pack.

## Conservative-primitives fallback

Not engaged in this run. The fallback in `§5.2` of the plan only
applies when the version cannot be detected; that branch is
unreachable here because `targetGraphComposeVersion` is set.

If a future revision is opened against a version the manifest does
not list, the resolver would have to fall back to conservative
primitives only (rows, sections, tables, themes) and would refuse
to use layer stacks, shape containers, or canvas layers without
explicit user confirmation. That behavior is documented in
[`../../../../docs/versioned-skills.md`](../../../../docs/versioned-skills.md).
