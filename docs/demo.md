# Demo — the deterministic half, end to end

Real output, captured from a run in a throwaway Java project on
2026-08-24. Paths are shortened; nothing else is edited.

What this shows is the half a script owns: finding the version, creating
the workspace, opening a revision, printing the chain, and asking the
loop gate whether another pass is allowed. The half a model owns —
reading the reference, mapping it to primitives, writing the template,
judging the render — is not scriptable and is not faked here. A recorded
session showing that half is still to come.

## The project

An ordinary Java project. The only thing that matters is the pin:

```xml
<dependency>
  <groupId>io.github.demchaav</groupId>
  <artifactId>graph-compose</artifactId>
  <version>2.2.0</version>
</dependency>
```

## 1. Which GraphCompose, and therefore which skills?

Run from deep inside the sources, to show it does not need to be run
from the project root:

```console
$ cd my-java-app/src/main/java
$ node scripts/resolve-version.mjs
GraphCompose 2.2.0 (2.2.x) -> skills/versions/graphcompose-2.2
  from ~/demo/my-java-app/pom.xml
```

Exit 0. Had the project pinned a line with no pack, this would exit 3
and stop, rather than author against an API that version does not have.

## 2. Create the workspace, inside the user's project

```console
$ node -e "…initWorkspace('my-java-app')…"
workspace: ~/demo/my-java-app/graphcompose-flow
```

The harness stays where it was installed; the work goes here.

## 3. Open a project and its first revision

```console
$ cd my-java-app/graphcompose-flow/projects
$ node tools/revision-manager/bin/graphcompose-flow.mjs init acme-invoice
initialised project at ~/demo/my-java-app/graphcompose-flow/projects/acme-invoice

$ node tools/revision-manager/bin/graphcompose-flow.mjs new-revision "recreate the invoice screenshot" --project acme-invoice
created revision-001 (parent: (none)) -- DRAFT
```

## 4. What will run — found with no flags

Back in the Java sources, four directories deep, with no `--root`:

```console
$ cd my-java-app/src/main/java
$ node scripts/run-pipeline.mjs acme-invoice
[workspace] ~/demo/my-java-app/graphcompose-flow (discovered)

Pipeline  project=acme-invoice  revision=revision-001  scope=new

  follow: skills/workflows/create-template/SKILL.md
  the stages below are what that skill runs; the prompt files are historical

    1. prompts/orchestrator-agent.md
        scope the change; open/route the revision
    2. prompts/version-skill-resolver-agent.md
        resolve GraphCompose version + skill pack
    …
    9. prompts/visual-review-agent.md
        parity classification vs reference/parent

  mechanical render (the Test+Render step):
        node scripts/render.mjs acme-invoice revision-001 --root ~/demo/my-java-app/graphcompose-flow
```

The workspace banner names where it resolved and how — `discovered`
means it walked up from the current directory and found
`graphcompose-flow/flow.config.json`.

## 5. May the loop take another pass?

```console
$ node scripts/iterate-status.mjs acme-invoice
[workspace] ~/demo/my-java-app/graphcompose-flow (discovered)

REVISE  acme-invoice / revision-001

  iterations              1/8   (7 left)
  consecutive build fails 0/3
  same mismatch attempts  0/3
  - revision-001 has no visual-review.json — a render without a review is not an iteration, it is an unfinished one

  next: fix "the largest mismatch" only, then render and review again.
```

Exit 2 — keep going. The note is the useful part: the revision exists
but nothing has judged it, and the gate says so rather than assuming the
pass went fine. Once reviews accumulate, the same command answers 0
(ready, hand over to the user) or 3 (blocked, with a failure category).

## What a full run adds

Between steps 4 and 5, the agent does the work this transcript cannot:
reads the reference into named regions, maps each region to a named
render method, resolves the icons and fonts, writes the template against
the pinned allow-list, renders, and writes `visual-review.json`. Then
the loop repeats — one mismatch per pass — until step 5 answers ready or
blocked.

See [`examples/cv-reference/`](../examples/cv-reference/): reading
revisions 001 → 009 in order is the closest thing to watching it happen.

## Reproducing this

```bash
npm run setup                                   # once
node scripts/resolve-version.mjs --project-dir <your-java-project> --json
```

Everything above is plain `node`, so it runs the same in PowerShell, cmd
and bash.
