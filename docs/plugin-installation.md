# Installing GraphCompose AI Flow

Install the harness into your coding agent, open your own Java project,
drop in a document reference, and ask for it back as a GraphCompose
template.

> **Status.** The plugin packaging is new. The install commands below
> are filled in from the current Claude Code plugin documentation; if
> your Claude Code version disagrees, trust `/help` in your session and
> please open an issue.

## What you need first

| Requirement | Why | Check |
|---|---|---|
| **Node 20+** | every tool in the harness | `node --version` |
| **Java 21+** | compiling and rendering the template | `java -version` |
| **Maven** | building the render runner | `mvn -v` |
| **ImageMagick** | the pixel-parity gates (`magick compare`) | `magick -version` |
| **A Java project pinning GraphCompose** | the version decides which skill pack is used | see below |

GraphCompose itself comes from your project's build file, not from this
harness:

```xml
<dependency>
  <groupId>io.github.demchaav</groupId>
  <artifactId>graph-compose</artifactId>
  <version>1.9.0</version>
</dependency>
```

Check that the harness agrees with your pin:

```bash
node scripts/resolve-version.mjs --project-dir /path/to/your/java-project --json
```

Exit code `0` means there is a skill pack for that line. Exit `3` means
there is not — the harness will stop rather than author against a
different version's API, which would emit calls that do not compile.

## Install into Claude Code

The repository is both the marketplace and the plugin, so adding it once
makes the plugin available:

```text
/plugin marketplace add DemchaAV/graphcompose-ai-flow
/plugin install graphcompose-flow@graphcompose
```

Check that it loaded:

```text
/plugin list
/plugin details graphcompose-flow@graphcompose
```

You should see four skills — `create-template`, `revise-template`,
`review-template`, `approve-template` — and four commands.

### Installing a specific version

Releases are tagged twice: `v<version>` (plain git) and
`graphcompose-flow--v<version>` (the plugin system's own format, created
with `claude plugin tag`). `/plugin install` follows the marketplace's
default branch; to hold an exact release, add the repository at its tag:

```text
/plugin marketplace add DemchaAV/graphcompose-ai-flow@graphcompose-flow--v0.7.0
/plugin install graphcompose-flow@graphcompose
```

A marketplace added at a tag stays there: `claude plugin update` will
report it already current rather than moving you to a newer commit, which
is the point — the version you validated is the version you keep.

### Trying it before publishing

From a local clone, either point Claude Code at the directory:

```bash
claude --plugin-dir /path/to/graphcompose-ai-flow
```

or add the clone as a local marketplace:

```text
/plugin marketplace add /path/to/graphcompose-ai-flow
```

After editing plugin files in place, reload without restarting:

```text
/reload-plugins
```

### Validating the packaging

Before publishing a change to the manifests, run the official checker —
it validates `plugin.json`, `marketplace.json` and every skill and
command frontmatter:

```bash
claude plugin validate /path/to/graphcompose-ai-flow            # marketplace manifest
claude plugin validate /path/to/graphcompose-ai-flow/.claude-plugin/plugin.json
claude plugin validate /path/to/graphcompose-ai-flow/commands
```

The path decides what is checked: a directory holding a
`marketplace.json` validates the marketplace, the manifest file
validates the plugin, and a component directory validates the files in
it. All three pass today.

**One known warning.** Validating the plugin manifest reports that
`CLAUDE.md` at the repository root is not loaded as plugin context, and
`--strict` turns that into a failure. The file is deliberate: it is the
project-instructions file for people working *in* this repository, where
Claude Code does load it. It is inert only when the repository is
consumed as a plugin, and the plugin's own context ships as skills. So
run `--strict` knowing that this one warning is expected, or drop the
flag.

The repository's own test suite covers the same ground structurally
(`npm test` → `scripts/test/plugin-package.test.mjs`), but only
`claude plugin validate` speaks for the Claude Code version you are on.

## One-time setup after installing

**This step is not optional.** Two of the tools are TypeScript compiled
into `dist/`, which is not committed, so a freshly installed copy has no
build output and their dependencies are not installed:

```bash
npm run setup
```

It checks the toolchain, then installs and builds the Node tools. Until
it has run, `graphcompose-flow` and `visual-diff` exit with code 69 and
tell you to run it — that message is the symptom, this is the fix.

To check the toolchain without installing anything:

```bash
npm run setup:check
```

## Where your work goes

The harness lives wherever it was installed; **your work lives in your
project**. Create the workspace inside it once, before anything else:

```bash
node scripts/init-workspace.mjs --project-dir /path/to/your/java-project
```

That reads your GraphCompose pin, writes the manifest seeded with it, and
gives you the layout below. Running it twice is safe — an existing
manifest is never overwritten. Add `--project <id>` to create the first
template project in the same step.

This step matters more than it looks. Without the manifest, commands
fall back to the harness install's own `examples/`, so your work would be
written *into the installed runtime* — consistently, and without an
error.

```text
my-java-app/
├── pom.xml
├── src/main/java/…
└── graphcompose-flow/
    ├── flow.config.json           marks the workspace
    ├── projects/<project-id>/     references, revisions, renders
    │   ├── template-project.json  what this project is
    │   ├── current.pdf            the latest render — keep this one open
    │   └── current-debug.pdf      the same page with layout guides
    └── templates/<template-id>/   published bundles
```

Commands find it by walking up from wherever you are, so running them
from `src/main/java` works with no flags. Override with `--root` or
`GRAPHCOMPOSE_FLOW_ROOT` when you need to.

Every command prints which workspace it resolved and how. If that line
names somewhere unexpected, believe it — do not work around it with
absolute paths.

## Keep the document open while it works

Every render rewrites `current.pdf` in the project folder, so one open
window follows the whole run. You watch the layout arrive rather than
hunting for the newest file under `revisions/`, and after a correction
you see what changed without asking for anything.

It has to be a viewer that reloads a file when it changes **and does not
hold it open**. That second half is the one that bites: a viewer keeping
a lock on the PDF makes the next render fail, which reads as a harness
bug and is not one.

On Windows use [SumatraPDF](https://www.sumatrapdfreader.org/) — free,
open source, reloads on change, and lets go of the file. On macOS and
Linux, Preview and Evince both reload in place.

```bash
node scripts/preview-live.mjs --project <id>           # the clean render
node scripts/preview-live.mjs --project <id> --debug   # the one with guides
```

The helper finds SumatraPDF on `PATH`, at `%LOCALAPPDATA%\SumatraPDF`, or
via `SUMATRAPDF_PATH`; with none of those it falls back to the OS default
viewer, which may not live-reload.

A second, shared `live/` copy exists as well, but only when the install
*is* the workspace — that is the harness-development case, not this one.
In a plugin install there is no shared copy, which is why the command
takes `--project`: without it, it looks in a folder nothing writes to.
`GRAPHCOMPOSE_LIVE_DIR` puts the shared copy somewhere on purpose (useful
to keep it off OneDrive); `RENDER_NO_LIVE=1` turns the mirror off.

## First use

Open your Java project in the agent, give it the reference image, and
say what you want. The skills fire from what you say, so no command is
needed:

```text
Create a GraphCompose template from this screenshot.
```

The commands exist for when you would rather be explicit:

| Command | Does |
|---|---|
| `/graphcompose-flow:create` | reference in, template out, loops to ready |
| `/graphcompose-flow:revise` | change it under the narrowest scope that fits |
| `/graphcompose-flow:review` | what is still different, without changing anything |
| `/graphcompose-flow:approve` | approve the draft and publish the bundle |

What follows is a loop, not a single shot: analyse the reference, write
the template, compile, render, compare against the reference, fix the
largest mismatch, render again — until it reports **ready for approval**
or **blocked** with a reason. Then:

```text
approve
```

which flips the revision to APPROVED, supersedes the previous one, and
publishes the bundle under `graphcompose-flow/templates/`.

## Troubleshooting

**`exit 69` and "not built yet"** — run `npm run setup`.

**"Filename too long" while cloning on Windows** — the repository
contains deep Java package paths. Either clone to a short path
(`C:\dev\gcflow` rather than a nested temp directory), or enable long
paths once:

```bash
git config --global core.longpaths true
```

**"unsupported: GraphCompose X.Y has no skill pack"** — your project
pins a version this harness has no pack for. The packs on disk are
listed in the error; either pin a supported line or add a pack.

**A command resolved the wrong workspace** — check the `[workspace]`
banner it printed. In development mode (running inside a clone of this
repository) the workspace is the repository's own `examples/`, which is
correct there and wrong everywhere else.

**ImageMagick missing** — the parity gates cannot run, so refactor-only
and data-only revisions cannot be proved. Install it before trusting a
"no visual change" claim.
