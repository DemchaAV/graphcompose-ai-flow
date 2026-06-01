# Orchestration Decision — revision-009

| | |
|---|---|
| Parent revision | `revision-008` (APPROVED 2026-05-19) |
| Scope | `data-only` |
| Detected gesture | "swap the contact email" → diff lands only inside `cv-data.json` |
| Agents to run | Test + Render → Visual Review |
| Agents skipped | Skill Validator (cache HIT expected — same skill pack, same target), Visual Analyzer, Architecture Mapper, Asset Resolver (asset-request.json unchanged), Template Coder (Java unchanged) |
| Visual Review gate | Region-aware pixel-AE: regions reading `contact.email` may differ; everything else must be `AE == 0` vs parent |
| Target GraphCompose | `io.github.demchaav:graph-compose:1.6.6` (from `template-project.json`) |

This revision is also the first **live exercise** of the Perf #1-#4
infrastructure: short-scope branching, skill-validation cache, asset
download cache, mask-regions helper. The numbers go into
`status.md` to replace the speculative wall-clock claims in the
Perf commits.
