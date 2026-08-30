# Getting started from zero

For someone who has never used a coding agent, never built a GraphCompose
document, or both. Nothing here assumes you know what a plugin, a
workspace or a revision is; each is explained at the point you meet it.
Budget about half an hour for the setup, once, and ten minutes for the
first template.

## What you are setting up

Three things, in this order:

1. **A coding agent** — a program that reads your instructions in plain
   language, writes and runs code on your machine, and shows you the
   result. This harness works with three: **Claude Code** (Anthropic),
   **Codex** (OpenAI) and **Gemini CLI** (Google).
2. **The tools the harness needs** — Java, Maven, Node and ImageMagick.
   They are ordinary developer tools; you install them once.
3. **The harness itself** — this repository, installed into the agent as
   a plugin (Claude Code) or an extension (Codex, Gemini CLI). It teaches
   the agent how to turn a document reference into a GraphCompose
   template and how to check its own work.

### Which agent

| Agent | What we have seen |
|---|---|
| **Claude Code** | The host the loop was built and tuned on. Sixteen real templates carried to approval; the results in the README are from it. Recommended. |
| **Codex** | Runs the same workflow to the same standard — templates carried to an approved bundle. Equally recommended. |
| **Gemini CLI** | The packaging works and the workflow runs, but the model behind it produces noticeably weaker templates: more passes, more corrections from you, and results that need more hand-finishing. Usable; not what to start with. |

The harness is the same on all three. The difference is the model each
one puts behind it.

## Step 1 — install the tools

You need all four. Check each with the command shown; if it prints a
version, you have it.

| Tool | Why | Get it | Check |
|---|---|---|---|
| **Node.js 20 or newer** | the harness's scripts run on it | [nodejs.org](https://nodejs.org) — the LTS installer | `node -v` |
| **Java 21 or newer** (JDK) | GraphCompose is a Java library; templates compile and render on the JVM | [Adoptium Temurin](https://adoptium.net) — JDK 21 | `java -version` and `javac -version` |
| **Maven** | resolves GraphCompose and its dependencies from Maven Central | [maven.apache.org](https://maven.apache.org/download.cgi) — unzip, add `bin/` to PATH | `mvn -v` |
| **ImageMagick** | imports jpg/webp/pdf references, matches typefaces | [imagemagick.org](https://imagemagick.org/script/download.php) — **on Windows, tick "Add application directory to your system path"** | `magick -version` |

On Windows, open a new terminal after installing anything that changes
PATH; the old one does not see it. If `magick -version` says the command
is not found but ImageMagick is installed, `node scripts/preflight.mjs`
will later tell you exactly which directory to add.

## Step 2 — install the agent

Pick one from the table above and follow its own install instructions:

- Claude Code: [claude.com/claude-code](https://claude.com/claude-code)
- Codex: [openai.com/codex](https://openai.com/codex)
- Gemini CLI: [github.com/google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli)

Each is a program you run in a terminal (or in an editor) inside a
project folder; you type what you want in plain language, and it works
in that folder.

## Step 3 — a Java project that pins GraphCompose

The harness works *inside a Java project* — that is where the template
is compiled, rendered and finally lives. If you have one already, it
needs the GraphCompose dependency in its `pom.xml`:

```xml
<dependency>
  <groupId>io.github.demchaav</groupId>
  <artifactId>graph-compose</artifactId>
  <version>2.2.2</version>
</dependency>
```

If you have none, the harness can stand one up from a published template
once it is installed (`node scripts/use-template.mjs <template-id>
--new-project <dir>`), or make an empty Maven project (`mvn
archetype:generate` with the quickstart archetype, then add the
dependency above). The version you pin decides which GraphCompose
knowledge the agent uses — it reads it from your build file.

## Step 4 — install the harness

**Claude Code** — inside Claude Code, two commands:

```text
/plugin marketplace add DemchaAV/graphcompose-ai-flow
/plugin install graphcompose-flow@graphcompose
```

Then, once, in a terminal, build its tools. Claude Code put the plugin
under `~/.claude/plugins/cache/graphcompose/graphcompose-flow/<version>/`
(`%USERPROFILE%\.claude\plugins\cache\…` on Windows — look for the
version folder):

```bash
cd ~/.claude/plugins/cache/graphcompose/graphcompose-flow/<version>
npm run setup
```

**Codex** or **Gemini CLI** — clone the repository, build, install:

```bash
git clone https://github.com/DemchaAV/graphcompose-ai-flow
cd graphcompose-ai-flow
npm run setup
node adapters/codex/install.mjs      # or: node adapters/gemini/install.mjs
```

After that the clone is not needed; the runtime was copied. Details for
each host: [`plugin-installation.md`](plugin-installation.md),
[`../adapters/codex/README.md`](../adapters/codex/README.md),
[`../adapters/gemini/README.md`](../adapters/gemini/README.md).

## Step 5 — the first template

Open your Java project in the agent. Then, in the agent, these two lines
(they are commands the agent runs; you can paste them as they are):

```text
node scripts/preflight.mjs --project-dir .
node scripts/init-workspace.mjs --project-dir . --project my-first-invoice
```

The first tells you whether everything above is in place and, if the
plugin's tools are not built yet, builds them. The second creates a
folder `graphcompose-flow/` in your project — the **workspace**, where
every render, every revision and every published template will live.
Without it the work lands inside the plugin install, which the next
update replaces.

Now give the agent the document. Drop the image or PDF into the chat and
say, in your own words:

```text
Create a GraphCompose invoice template from this
```

What happens next, and what you will see:

1. The agent measures the reference and may **ask one question** — most
   often the page size, when the image is not a standard sheet. Answer
   it; it is recorded once.
2. It writes the template, compiles it, renders it, compares the render
   with your reference and fixes the largest difference — one thing per
   pass. Each pass is a **revision**, kept on disk under
   `graphcompose-flow/projects/my-first-invoice/revisions/`.
3. Open `graphcompose-flow/projects/my-first-invoice/current.pdf` in a
   viewer that reloads when the file changes (on Windows: SumatraPDF; on
   macOS Preview; on Linux Evince) and leave it open — you will watch
   the layout arrive pass by pass.
4. It stops when its own checks say the render is ready, or when it has
   used its budget, and tells you what is still different. A first
   template usually takes five to ten passes and ten to twenty minutes.

Look at the PDF. If something is wrong, say so in plain words — *"the
page number sits too low"*, *"the sidebar should be navy"* — and it opens
a new revision for exactly that. When it is right, say **approve**. The
template is published as a bundle under
`graphcompose-flow/templates/<name>/`: Java sources, a data file, the
assets, a README — with no dependency on this harness.

## Things worth knowing on day one

- **Content is data, not code.** Names, prices, dates live in a JSON
  file beside the template. To make the next invoice, change the JSON.
- **One terminal per project.** You can run several agents at once on
  different projects; two on the same project are refused, on purpose.
- **Corrections are cheap; start fresh for them.** Close the session
  after approving and make later changes in a new one — everything a
  correction needs is on disk, and a fresh session costs a tenth of a
  long one.
- **The agent never approves for you.** It stops and waits. "Approve",
  "looks good", "сохрани" — any of those is the signal.

## When something goes wrong

| You see | It means | Do |
|---|---|---|
| `exit 69` and "not built yet" | the plugin's tools were not built | `npm run setup` in the plugin directory (step 4) |
| preflight says ImageMagick is absent, and it is installed | not on PATH | preflight names the directory; add it to PATH or set `MAGICK_BINARY` to `magick.exe` there |
| "exit 3 — no skill pack for this line" | your project pins a GraphCompose version the harness has no knowledge for | pin a 2.2.x version, or ask for a pack |
| the render fails and the message names `current.pdf` | your PDF viewer holds the file open | use a viewer that reloads and lets go (SumatraPDF, Preview, Evince) |
| "another render holds this project" | a second agent is rendering the same project | wait, or work on another project |
| the agent asks about the page size | the reference is not a standard sheet | answer once; it is recorded for every later revision |

Everything else: [`plugin-installation.md`](plugin-installation.md)
(troubleshooting), [`limitations.md`](limitations.md) (what it cannot
do), and the README's "What is proven, and what is not".
