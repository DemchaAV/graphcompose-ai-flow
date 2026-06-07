# Proposal Reference

A scaffold project for the first proposal run through the GraphCompose
AI Template Flow. Lives alongside the CV, invoice, and cover-letter
reference examples to round out the four upstream document-kind
surfaces.

## State

**Awaiting reference image.** The project skeleton exists, but
`reference/reference.png` is intentionally absent. See
[`reference/PLACEHOLDER.md`](reference/PLACEHOLDER.md) for the
kick-off gesture that opens `revision-001`.

## Surface

`com.demcha.compose.document.templates.proposal.*` on GraphCompose
1.7.0 — single-preset V2 architecture upstream (`ModernProposal` +
`ProposalSpec`). New presets live in the same package and share
`ProposalSpec` as the typed input.

## Folder layout (current vs after first revision)

```text
examples/proposal-reference/
├── README.md                       ← this file
├── template-project.json           ← project metadata (awaiting reference)
├── reference/
│   ├── PLACEHOLDER.md              ← kick-off instructions (deleted once revision-001 lands)
│   └── reference.png               ← USER DROPS THIS to start the flow
└── revisions/                      ← created by orchestrator on first gesture
    └── revision-001/               ← see other examples for the artifact set
```

## Related published bundles

- [`templates/mint-editorial-cv/`](../../templates/mint-editorial-cv/) —
  CV bundle (V1+V2 mix).
- [`templates/invoice-classic/`](../../templates/invoice-classic/) —
  invoice bundle (V1 classic surface).
- A `proposal-modern` bundle would land here once the first
  proposal revision is approved through `tools/revision-manager`.
