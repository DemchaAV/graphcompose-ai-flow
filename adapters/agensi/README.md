# Skill-marketplace bundle (Agensi)

One zip, `SKILL.md` at the root, that a skill marketplace installs into
Claude Code or Codex as a single skill. Same runtime as the Codex and
Gemini adapters ([`adapters/lib/runtime.mjs`](../lib/runtime.mjs) decides
what it is); only the packaging differs.

## Build

```bash
npm run setup            # once: the Node CLIs ship as build output
npm run bundle:agensi
```

Writes `dist/agensi/graphcompose-ai-flow/` (the staged tree) and
`dist/agensi/graphcompose-ai-flow-<version>.zip`. The build fails over
Agensi's 50 MB limit, and refuses to write a zip that would fail
Agensi's review: any binary (`.jar`, `.class`, `.exe` …) or a URL in
`SKILL.md` or a shipped `pom.xml`. That is why the preview renderer ships
as Java source and is built by the bootstrap, and why the POMs lose
their namespace declarations.

## What the buyer's agent does on first use

The root [`SKILL.md`](bundle/SKILL.md) sends the agent to
[`install/bootstrap.mjs`](bundle/install/bootstrap.mjs) before any work:

| Step | Command |
|---|---|
| report, change nothing | `node install/bootstrap.mjs --check` |
| install Java 21 / Maven / ImageMagick, **after the user says yes** | `node install/bootstrap.mjs --install-missing` |
| finish: npm deps, build the preview renderer, GraphCompose into `~/.m2`, register the workflow skills | `node install/bootstrap.mjs` |
| remove the registered skills | `node install/bootstrap.mjs --uninstall` |

No Node at all? `install/bootstrap.ps1` / `install/bootstrap.sh` check for
Node 20+ first, then hand over with the same flags.

The host is detected from where the marketplace unpacked the bundle
(`…/.claude/…` → Claude Code, `…/.codex/…` → Codex), falling back to the
environment; `--host claude|codex` overrides it. The four workflow skills
are registered as stubs in that host's skills directory, pointing back
into the bundle, exactly like the Codex adapter's stubs.

System packages per platform:

| | Java 21 | Maven | ImageMagick |
|---|---|---|---|
| Windows | winget `Microsoft.OpenJDK.21` | Scoop when it is installed; otherwise Apache's binary archive, unpacked only if its SHA-512 matches Apache's published checksum, into `~/AppData/Local/Programs` and the user PATH (winget has no Maven package) | winget `ImageMagick.ImageMagick` |
| macOS | `brew install --cask temurin@21` | `brew install maven` | `brew install imagemagick` |
| Linux | `apt-get install openjdk-21-jdk` | `apt-get install maven` | `apt-get install imagemagick` |

On Linux apt runs as `sudo -n`, so an agent without passwordless sudo gets
the command printed for the user rather than a hung prompt.
