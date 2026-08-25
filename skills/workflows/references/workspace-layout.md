# The canonical workspace

One layout, whichever host is running. Claude Code and Codex may be packaged
differently; where files go is not a packaging question.

## The install is not the workspace

The harness lives wherever it was installed — a plugin cache, a versioned
runtime copy under `~/.codex/`, or a clone. **Nothing generated is ever written
there.** The work goes in the user's Java project, in a `graphcompose-flow/`
directory beside their build file:

```text
<their-java-project>/
  pom.xml | build.gradle[.kts]      the pin that decides the skill pack
  graphcompose-flow/                the workspace
    flow.config.json                manifest: schema version, pinned line
    .gitignore                      the derived files only
    projects/
      <project-id>/
        template-project.json       what this project is and how it renders
        reference/
          source.<ext>              the reference as it arrived, unchanged
          reference.png             page 1, what every diff compares against
          reference-page-N.png      continuation pages, if the source had any
        revisions/
          revision-001/ …           one directory per revision, never overwritten
        render-runner/              the per-project Maven module that renders
        telemetry/                  archived run metrics
        current.pdf                 the newest render, under a stable name
    templates/
      <template-id>/                published bundles, written by the publisher
```

Three rules follow from that shape, and all three have been broken in practice:

- **Do not copy the harness into the output.** The skills, the tools and the
  packs are the installation. A bundle that carries them is not portable, it is
  a second copy that will drift.
- **Do not invent a directory.** If a path is not in the tree above, no tool
  reads it, and whatever is written there is invisible to every later step.
- **Do not write generated artifacts outside the project.** Scratch files in the
  user's repository root are how the first acceptance run left ImageMagick
  arithmetic behind.

## Only commands decide layout

Every path above is produced by a command, so the shape does not depend on which
host, model, or shell is in play:

```bash
# the workspace and a project inside it
node scripts/init-workspace.mjs --project-dir <java-project> --project <project-id>

# the reference, from png / jpg / webp / pdf — converted and named canonically
node scripts/import-reference.mjs --project <project-id> --file <path>

# a revision
node tools/revision-manager/bin/graphcompose-flow.mjs new-revision "<the user's words>" --project <project-dir>
```

Each prints where it put things, and `--json` gives the same as data. Read the
answer rather than assuming it: `init-workspace` is idempotent and will report an
existing workspace rather than a new one, and `import-reference` replaces a
previous reference instead of adding to it.

## The reference belongs to the project, not to a revision

`reference/reference.png` is written once and read by every revision. A revision
never keeps its own copy: two copies of a reference are two answers to "what are
we matching", and the diff would then be measuring whichever one happened to be
nearest.

What a revision does keep is derived from the comparison, not from the
reference — `reference-scaled.png`, the version resampled to that render's
dimensions, which is specific to that render and meaningless elsewhere.

## Where the pin comes from

The GraphCompose version in the **user's** build file decides the skill pack.
Never the harness's own version, never the newest pack available:

```bash
node scripts/resolve-version.mjs --project-dir <java-project> --json
```

Exit 3 — a line with no pack — is a stop, not a reason to author against a
neighbouring version.
