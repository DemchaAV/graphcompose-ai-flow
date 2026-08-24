# Finding the workspace and the version

Two roots, and confusing them is the most common way to put a
revision in the wrong place.

| Root | Holds | How to get it |
|---|---|---|
| **install root** | the harness: `skills/`, `config/`, `schemas/`, `tools/`, `scripts/` | the directory the scripts live in |
| **workspace root** | the work: projects, revisions, references, published bundles | resolved, see below |

Inside the graphcompose-ai-flow repository itself they are the same
directory. In a user's Java project they are not.

## Resolution order

`scripts/lib/workspace.mjs` resolves, first match wins:

1. an explicit `--root`
2. the `GRAPHCOMPOSE_FLOW_ROOT` environment variable
3. a `graphcompose-flow/flow.config.json` found by walking up from the
   current directory
4. the install root's own `examples/` + `templates/` (development mode)

Every script prints which workspace it used and how, except in
development mode. If a command reports a workspace you did not expect,
that banner is the answer — do not work around it by passing absolute
paths.

## Layout in a user's project

```text
my-java-app/
├── pom.xml                        the GraphCompose pin lives here
├── src/main/java/…
└── graphcompose-flow/
    ├── flow.config.json           manifest — its presence marks the workspace
    ├── projects/<project-id>/     template-project.json, reference/, revisions/
    └── templates/<template-id>/   published bundles
```

Creating one is idempotent, and an existing manifest is never
overwritten:

```js
import { initWorkspace } from "<install-root>/scripts/lib/workspace.mjs";
initWorkspace("<user-project-dir>", { graphComposeVersion, skillPack });
```

## Which GraphCompose version, and therefore which skills

Never ask the user and never assume. Read it from their build file:

```bash
node scripts/resolve-version.mjs --project-dir <java-project> --json
```

```json
{
  "status": "supported",
  "version": "1.9.0",
  "line": "1.9",
  "skillPack": "skills/versions/graphcompose-1.9",
  "availablePacks": ["1.9", "1.7", "1.6"]
}
```

Exit codes, so you can branch without reading prose:

| Code | Status | What it means |
|---|---|---|
| 0 | `supported` | use `skillPack` |
| 3 | `unsupported` | the pinned line has no pack — **stop** |
| 4 | `unknown` | no build file, or no GraphCompose dependency in it |

On exit 3, tell the user which version they pin and which packs exist.
Do not fall back to the nearest pack: authoring against another line's
allow-list produces calls that do not exist in their version, and the
compile error will point at the wrong cause.

On exit 4, the project may simply not use GraphCompose yet — say so and
ask, rather than guessing a version.

## Loading the pack

Open the pack's `00-loading-map.md` first and load only what it lists
for the task in front of you. A pack has sixteen files; a typical task
needs four to six.

The shape of the answer:

- **always** — `00-api-surface.md` (grepped for the builders you will
  call, not read front to back) and `graphcompose-basics.md`
- **by task** — reading a reference, writing code, judging a render,
  and opening a revision each pull a different small set
- **by what the reference actually contains** — load `tables.md` because
  the document has a table, not because invoices usually do
- **by scope** — a `data-only` revision loads no topic file at all; a
  `visual-change` loads the files for the region that changed

The omissions are the point. Every file loaded "to be safe" is context
the loop cannot spend on the mismatch it is about to fix. If the map
looks wrong for the document in front of you, follow the document and
say so — the map is a starting point, not a gate.
