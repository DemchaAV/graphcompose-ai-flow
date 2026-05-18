# @graphcompose-ai-flow/revision-manager

`graphcompose-flow` is the file-based revision manager for **GraphCompose AI Template Flow** template projects. It owns the `template-project.json` and per-revision metadata layout used by `examples/<project>/` and provides the verbs needed to author, approve, undo, revert, and inspect those revisions on disk. It deliberately does **not** render PDFs, call any LLM, or talk to git — those concerns belong to other phases of the flow.

## Install

```bash
cd tools/revision-manager
npm install
npm run build
```

The compiled CLI lives at `dist/cli.js`; the bin shim at `bin/graphcompose-flow.mjs` is what you invoke (or what `npm link` exposes as `graphcompose-flow`).

During development you can run the entry from source:

```bash
npm run dev -- status --project ../../examples/invoice-reference
```

## Usage

Every command except `init` accepts `--project <path>` to point at a project folder (defaults to the current working directory).

| Command | Args / Options | What it does |
| --- | --- | --- |
| `init <projectName>` | `<projectName>` | Creates `<projectName>/template-project.json`, `reference/`, and `revisions/`. Refuses to overwrite an existing project. |
| `status` | `--project <path>` | Prints project metadata plus the newest revision's id and status. |
| `new-revision "<message>"` | `--base <revisionId>` | Creates the next `revision-NNN/` as DRAFT. Parent defaults to the current draft, then the current approved, else `null`. |
| `approve [revisionId]` | defaults to current draft | Marks the revision APPROVED. Any other APPROVED revision is moved to SUPERSEDED so a project has at most one APPROVED at a time. |
| `reject [revisionId]` | defaults to current draft | Marks the revision REJECTED and clears `currentDraftRevisionId` if it matched. |
| `fail [revisionId]` | `--reason <text>` | Marks the revision FAILED (compile/render/validation breakage). Artifacts are preserved on disk. Refuses to fail an APPROVED revision -- use `undo` or `revert-approved` for that. The optional reason is appended to the revision's `userRequest`. |
| `undo` | none | Creates a new DRAFT whose body is a literal copy of the current draft's parent. The current draft is marked SUPERSEDED. Refuses when the draft has no parent. |
| `revert-approved` | none | Creates a new DRAFT copying every artifact from the current APPROVED revision. |
| `restore-component <name>` | `--from <revisionId>` | File-level selective rollback. Creates a new DRAFT built from the current draft, then overwrites the component's known files (`generated-template.java`, `architecture-plan.md`, `layout-snapshot.json`, `visual-review.md`) from `--from`. See the note below. |
| `history` | none | Prints every revision in a tabular layout: id, status, parent, request, created-at. |
| `diff <revA> <revB>` | none | Unified diff of `generated-template.java` between two revisions. Falls back to an artifact-summary table when either template is missing. |

## File-level component restore

`restore-component` is intentionally coarse: it copies four named files wholesale from the source revision and tags the new draft's `changedComponents` with the region name. It does **not** parse Java or splice individual functions — the trade-off keeps the tool small and predictable while still implementing the workflow described in the plan (§11.3). Finer-grained restoration is left for a future enhancement once the orchestrator can mark function-level boundaries inside `generated-template.java`. The command refuses if the region name does not already appear in the current draft's `changedComponents`, so it cannot pull in unrelated content.

## Statuses

`RevisionStatus` is one of `DRAFT`, `APPROVED`, `REJECTED`, `SUPERSEDED`, `FAILED`, `REVERTED` -- the six values from plan section 10.3. `DRAFT`, `APPROVED`, `REJECTED`, `SUPERSEDED`, and `FAILED` are set by the CLI verbs above. `REVERTED` is exposed in the type union for orchestrators that want to stamp a tombstone marker when rolling back; today's CLI verbs never write `REVERTED` directly because `revert-approved` already creates a new DRAFT, which is the rollback path the plan §11.2 describes.

## Renderer integration

This tool does **not** render `output.pdf` or `output.png`. Every new or copied revision marks those files as `pendingArtifacts`. The companion `tools/preview-renderer` Maven module owns the render path: its `preview` subcommand turns an `output.pdf` into an `output.png`, and its `render` subcommand becomes functional once GraphCompose 1.6 is on a reachable Maven repository. Pair the two tools in the same revision folder to close the artifact loop.

## Smoke test (30 seconds)

```bash
# In any scratch directory:
node /path/to/tools/revision-manager/bin/graphcompose-flow.mjs init demo-project
cd demo-project
node ../bin/graphcompose-flow.mjs status
node ../bin/graphcompose-flow.mjs new-revision "first draft"
node ../bin/graphcompose-flow.mjs status
node ../bin/graphcompose-flow.mjs approve
node ../bin/graphcompose-flow.mjs history
```

Expected:

1. `init` reports `initialised project at <abs path>/demo-project`.
2. The first `status` shows `currentApproved: (none)`, `currentDraft: (none)`, `revisionCount: 0`.
3. `new-revision` reports `created revision-001 (parent: (none)) -- DRAFT`.
4. The second `status` lists `currentDraft: revision-001` and `latestRevision: revision-001 (DRAFT)`.
5. `approve` reports `approved revision-001`.
6. `history` lists revision-001 with status `APPROVED`.

## Tests

```bash
npm test
```

Vitest is the only test framework in use. Each test allocates its own folder under `os.tmpdir()` and cleans up afterwards — no state leaks between tests.
