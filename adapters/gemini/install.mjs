#!/usr/bin/env node
/**
 * adapters/gemini/install.mjs — install the harness for Gemini CLI, as an
 * extension.
 *
 *   node adapters/gemini/install.mjs [options]
 *
 * Gemini CLI has no plugins. It has **extensions**: one directory under
 * `~/.gemini/extensions/<name>/` with a `gemini-extension.json` manifest, and
 * conventional subdirectories the CLI picks up on its own — `commands/` (TOML
 * slash commands), `hooks/hooks.json`, and `skills/<name>/SKILL.md`. So the
 * four Claude commands, the telemetry hooks and the workflow skills all have a
 * place to land; only the file formats differ.
 *
 * One thing about Gemini decides the layout, and it is not cosmetic. **A tool
 * may only read inside the workspace.** Activating a skill adds exactly one
 * directory to that workspace — the one its `SKILL.md` sits in — so a stub
 * pointing at a runtime elsewhere would name files the agent is then refused
 * permission to open. The harness is not a page of instructions: it is sixteen
 * pack files, five shared references and an API allow-list the agent reads
 * while it works.
 *
 * Hence: the runtime **is** the skill directory.
 *
 *   ~/.gemini/extensions/graphcompose-flow/
 *     gemini-extension.json       name, version, description
 *     GEMINI.md                   the always-loaded pointer, deliberately tiny
 *     commands/*.toml             /create /revise /review /approve
 *     hooks/hooks.json            telemetry checkpoints, Gemini's event names
 *     skills/graphcompose-flow/   the harness runtime, with a router SKILL.md
 *
 * Activating that one skill grants read access to the whole harness in a single
 * confirmation, and the router points at the same four canonical workflow
 * skills every other host reads. Four Gemini skills would have meant four
 * copies of the pack — the drift this adapter exists to prevent.
 *
 * Nothing here forks the workflow. If you find yourself editing behaviour in
 * this file, it belongs in skills/workflows/.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ALWAYS,
  copyRuntime,
  directorySizeKb,
  discoverSkills,
  harnessVersion,
  installRuntimeDeps,
  missingBuilds,
  repoRoot,
} from "../lib/runtime.mjs";

/** The extension's name, its directory name, and the name of its one skill. */
const EXTENSION = "graphcompose-flow";

/** Where the commands are read from, in Claude's Markdown form. */
const COMMANDS_DIR = path.join(repoRoot, "commands");

/**
 * Claude's hook events, in Gemini's vocabulary. Gemini fires `BeforeAgent`
 * where Claude fires `UserPromptSubmit` and `AfterAgent` where Claude fires
 * `Stop`; both spell `SessionStart` and `SessionEnd` the same. Claude's
 * `SubagentStop` has no Gemini counterpart — subagents are a preview feature
 * there — so nothing is registered for it rather than pointing an event name
 * at a hook that would never fire.
 */
const HOOK_EVENTS = ["SessionStart", "BeforeAgent", "AfterAgent", "SessionEnd"];

/** Gemini's hook timeouts are milliseconds; Claude's are seconds. */
const HOOK_TIMEOUT_MS = 10_000;

function usage(code = 0) {
  process.stdout.write(
    "usage: node adapters/gemini/install.mjs [options]\n\n" +
      "  --dest <dir>    extensions directory (default: ~/.gemini/extensions)\n" +
      "  --name <name>   extension directory and manifest name (default: graphcompose-flow)\n" +
      "  --link          point the skill at THIS checkout instead of copying the runtime\n" +
      "                  (for contributors: open the checkout as a workspace directory,\n" +
      "                  or Gemini will refuse to read it)\n" +
      "  --skip-deps     do not run npm ci inside the copy\n" +
      "  --skip-build-check  copy even when the build outputs are missing. The result\n" +
      "                  is NOT a working install; for CI and packaging only\n" +
      "  --dry-run       print what would happen, change nothing\n" +
      "  --uninstall     remove the extension directory\n",
  );
  process.exit(code);
}

function parseArgs(argv) {
  const out = {
    dest: path.join(os.homedir(), ".gemini", "extensions"),
    name: EXTENSION,
    link: false,
    skipDeps: false,
    skipBuildCheck: false,
    dryRun: false,
    uninstall: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--uninstall") out.uninstall = true;
    else if (a === "--link") out.link = true;
    else if (a === "--skip-deps") out.skipDeps = true;
    else if (a === "--skip-build-check") out.skipBuildCheck = true;
    else if (a === "--dest") out.dest = argv[++i];
    else if (a === "--name") out.name = argv[++i];
    else {
      process.stderr.write(`[gemini-install] unknown argument: ${a}\n`);
      usage(2);
    }
  }
  return out;
}

/**
 * Forward slashes, always. A generated file may be read by cmd, PowerShell or
 * bash, and a Windows backslash is an escape character in two of them.
 */
const posix = (p) => p.split(path.sep).join("/");

/** Split a Markdown file into its frontmatter block and body. */
function frontmatter(file) {
  const source = fs.readFileSync(file, "utf8");
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) throw new Error(`${file} has no frontmatter`);
  return { raw: match[1], body: source.slice(match[0].length).trim() };
}

const field = (block, name) => {
  const hit = new RegExp(`^${name}:\\s*(.+)$`, "m").exec(block);
  return hit ? hit[1].trim() : null;
};

/**
 * Point a harness-relative path at the install.
 *
 * The commands and skills say `node scripts/render.mjs`, which resolves
 * wherever the harness root happens to be the working directory. In Gemini the
 * working directory is the user's Java project — and it has to stay there,
 * because that is how every command finds the workspace. So the path is made
 * absolute instead of the shell being moved.
 */
function absolutise(text, runtimeRef) {
  return (
    text
      // Runnable commands first, and quoted: a home directory with a space in
      // it is the difference between a command and two arguments.
      .replace(
        /\bnode\s+((?:scripts|tools)\/[\w./-]+)/g,
        (_match, script) => `node "${runtimeRef}/${script}"`,
      )
      // Then the paths named as prose — a skill file to read, a config to
      // consult. Already-absolute paths are preceded by a slash, which the
      // lookbehind excludes, so nothing is rewritten twice.
      .replace(
        /(?<![\w/.-])(scripts|tools|skills|config|schemas|observations)\/[\w./-]+/g,
        (match) => `${runtimeRef}/${match}`,
      )
  );
}

function manifest(name, version) {
  return {
    name,
    version,
    description:
      "Turn a document reference — a screenshot, PDF or design image — into a maintainable " +
      "GraphCompose Java template, then render, compare and iterate until it is ready for " +
      "approval. Adds four workflow commands (create, revise, review, approve), the workflow " +
      "skill they follow, and the deterministic tools those call.",
    contextFileName: "GEMINI.md",
  };
}

/**
 * The always-loaded context file.
 *
 * Extension context is merged into every session's memory, GraphCompose task or
 * not, so this says the least that is useful: what is installed, where it is,
 * and the one Gemini-specific move — activate the skill, because that is what
 * makes the harness readable.
 */
function contextFile(name, runtimeRef) {
  return `# GraphCompose AI Flow

A harness for producing GraphCompose Java document templates from a
reference, installed at:

\`${runtimeRef}\`

When the user wants a document produced or changed with GraphCompose,
activate the **${name}** skill first. That is what grants read access to
the harness — its workflow skills, its version packs and its API
allow-list — and the skill dispatches from there.

Two things hold before any of it:

- Work goes in the user's Java project, under \`graphcompose-flow/\`.
  Nothing is ever written into the install above.
- Run the harness's commands with that absolute path, from the user's
  project. The working directory is how every command finds the
  workspace; moving it silently changes which workspace is resolved.
`;
}

/**
 * The router skill: one description covering the four workflows, and a body
 * that points at them rather than restating them.
 *
 * The description is the trigger surface — it is all Gemini sees before
 * deciding to activate — so it names each workflow and the words users
 * actually use. The body stays short because it is injected verbatim on
 * activation, and everything it points at is now readable.
 */
function routerSkill(name, skills, runtimeRef, linked) {
  const workflows = skills
    .map((skill) => `- **${skill.dir}** — \`${runtimeRef}/skills/workflows/${skill.dir}/SKILL.md\``)
    .join("\n");

  return `---
name: ${name}
description: Produce or change a document with GraphCompose — turn a reference (screenshot, PDF, design image of a CV, invoice, proposal, cover letter, report) into a maintainable Java template, revise an existing one, review what still differs, or approve a draft into a published bundle. The four workflows are ${skills.map((s) => s.dir).join(", ")}. Use whenever the user asks to recreate, rebuild, generate, change, compare or approve a GraphCompose document or template: "create this CV with GraphCompose", "recreate this screenshot", "make the sidebar wider", "what is still different", "approve it".
---

# GraphCompose AI Flow

The harness is this directory:

\`${runtimeRef}\`

**Read \`${runtimeRef}/AGENTS.md\` before acting.** It dispatches: which
workflow owns the task, where every contract is declared, and the
commands that answer the deterministic questions. This file does not
restate it.

## The four workflows

${workflows}

Read the one that matches, including the shared references it links to.
Reuse comes first, though: \`node "${runtimeRef}/scripts/templates.mjs" --json\`
can end the task before it starts, because copying a published bundle is
a file copy and rebuilding one is the whole loop.

## Running the commands

Every command in those files is written harness-relative — \`node
scripts/render.mjs\` — and here it needs the absolute form:

\`node "${runtimeRef}/scripts/render.mjs" …\`

**Stay in the user's project while you do it.** Commands find the
workspace by walking up from the working directory, so a shell moved
into the harness resolves the harness's own \`examples/\` instead, and the
work is written into the install. Every command prints which workspace
it resolved — believe that line.

## Holds regardless

${ALWAYS.map((line) => `- ${line}`).join("\n")}
${
  linked
    ? "\n> Installed with `--link`: the path above is a source checkout, so this\n> skill tracks your working tree. Gemini can only read it if the checkout\n> is a workspace directory — open it, or add it with `/directory add`.\n"
    : ""
}
## Shell note

Every command is a plain \`node …\` invocation with no pipes, no line
continuations and no \`$(…)\`, so it runs unchanged in PowerShell, cmd and
bash. Do not "translate" them.
`;
}

/**
 * One Claude command Markdown file, as a Gemini TOML command.
 *
 * The prompt is a literal (`'''`) string: the harness paths inside it are
 * absolute, and on Windows a basic TOML string would read `C:\\Users` as an
 * escape sequence. Literal strings have no escapes at all, which is exactly
 * what a path wants.
 */
function commandToml(file, name, runtimeRef) {
  const { raw, body } = frontmatter(file);
  const description = field(raw, "description");
  if (!description) throw new Error(`commands/${path.basename(file)} has no description`);

  const prompt = [
    `Activate the \`${name}\` skill before anything else — the harness is at`,
    `\`${runtimeRef}\`, and Gemini can only read inside an activated skill's`,
    "directory. Keep the shell in the user's project; call the harness's",
    "commands by their absolute path.",
    "",
    absolutise(body, runtimeRef).replace(/\$ARGUMENTS/g, "{{args}}"),
  ].join("\n");

  if (prompt.includes("'''")) {
    throw new Error(`commands/${path.basename(file)} contains ''' and cannot be a TOML literal string`);
  }

  return `# Generated by adapters/gemini/install.mjs — edit commands/${path.basename(file)} instead.\ndescription = ${JSON.stringify(description)}\nprompt = '''\n${prompt}\n'''\n`;
}

/**
 * Telemetry checkpoints, in Gemini's shape.
 *
 * Same contract as the Claude hooks: record when things happened and where the
 * transcript is, decide nothing, never block the work being measured. The
 * differences are Gemini's — its event names, milliseconds instead of seconds,
 * and `${extensionPath}` instead of `${CLAUDE_PLUGIN_ROOT}`.
 */
function hooksFile(hookCommand) {
  const entry = {
    hooks: [
      {
        name: "graphcompose-flow telemetry",
        type: "command",
        command: hookCommand,
        timeout: HOOK_TIMEOUT_MS,
      },
    ],
  };
  return {
    description:
      "Telemetry checkpoints for GraphCompose AI Flow. These only record timestamps and the " +
      "transcript location; they call no model, decide nothing, and always exit 0 so a " +
      "measurement can never block the work it measures.",
    hooks: Object.fromEntries(HOOK_EVENTS.map((event) => [event, [entry]])),
  };
}

const args = parseArgs(process.argv.slice(2));
const version = harnessVersion();
const skills = discoverSkills();
if (skills.length === 0) {
  process.stderr.write(`[gemini-install] no workflow skills found under skills/workflows\n`);
  process.exit(1);
}

const extensionDir = path.join(args.dest, args.name);

// --- uninstall ---------------------------------------------------------------
if (args.uninstall) {
  if (fs.existsSync(extensionDir)) {
    console.log(`${args.dryRun ? "would remove" : "removed"} ${extensionDir}`);
    if (!args.dryRun) fs.rmSync(extensionDir, { recursive: true, force: true });
  } else {
    console.log(`nothing to remove at ${extensionDir}`);
  }
  console.log("\nRestart Gemini CLI for the change to take effect.");
  process.exit(0);
}

// --- resolve where the runtime will live -------------------------------------
const skillDir = path.join(extensionDir, "skills", args.name);
const runtimeRoot = args.link ? repoRoot : skillDir;
const runtimeRef = posix(runtimeRoot);

if (!args.link && !args.skipBuildCheck) {
  const unbuilt = missingBuilds();
  if (unbuilt.length > 0) {
    process.stderr.write(
      "[gemini-install] the harness is not built, so there is nothing to install:\n" +
        unbuilt.map((rel) => `  missing ${rel}\n`).join("") +
        "\nRun the one-time setup from the repository root first:\n\n    npm run setup\n",
    );
    process.exit(69); // EX_UNAVAILABLE — same code the CLIs use when unbuilt
  }
}

console.log(`[gemini-install] version   : ${version}`);
console.log(`[gemini-install] extension : ${extensionDir}${args.dryRun ? "   (dry run)" : ""}`);
console.log(`[gemini-install] runtime   : ${runtimeRoot}${args.link ? "  (linked checkout)" : ""}\n`);

const write = (file, contents) => {
  console.log(`${args.dryRun ? "would write" : "wrote"} ${file}`);
  if (args.dryRun) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents, "utf8");
};

// --- the runtime, which is also the skill directory --------------------------
if (!args.link) {
  if (args.dryRun) {
    console.log(`would copy the runtime into ${skillDir}`);
  } else {
    let files;
    try {
      // With --skip-build-check the build outputs are legitimately absent.
      files = copyRuntime(skillDir, { tolerateMissing: args.skipBuildCheck });
    } catch (err) {
      process.stderr.write(`[gemini-install] ${err.message}\n`);
      process.exit(1);
    }
    console.log(`copied ${files} file(s), ${directorySizeKb(skillDir)} KB`);

    if (!args.skipDeps) {
      for (const failure of installRuntimeDeps(skillDir, (line) => process.stdout.write(line))) {
        process.stderr.write(
          `[gemini-install] npm failed in ${failure.pkg}. The install is otherwise complete; ` +
            `run npm ci --omit=dev there yourself, or re-run with --skip-deps.\n` +
            `${failure.error}\n`,
        );
      }
    }
  }
}

// --- the extension itself ----------------------------------------------------
write(path.join(extensionDir, "gemini-extension.json"), `${JSON.stringify(manifest(args.name, version), null, 2)}\n`);
write(path.join(extensionDir, "GEMINI.md"), contextFile(args.name, runtimeRef));
write(path.join(skillDir, "SKILL.md"), routerSkill(args.name, skills, runtimeRef, args.link));

// Regenerated wholesale rather than merged into: a command renamed or removed
// upstream would otherwise survive here as a slash command that still works and
// no longer exists anywhere else.
if (!args.dryRun) fs.rmSync(path.join(extensionDir, "commands"), { recursive: true, force: true });

for (const file of fs.readdirSync(COMMANDS_DIR).filter((f) => f.endsWith(".md")).sort()) {
  const command = path.basename(file, ".md");
  write(
    path.join(extensionDir, "commands", `${command}.toml`),
    commandToml(path.join(COMMANDS_DIR, file), args.name, runtimeRef),
  );
}

// `${extensionPath}` keeps a copied install portable; a linked one has to name
// the checkout, because that is where the script actually is.
const hookScript = args.link
  ? `${runtimeRef}/scripts/telemetry/gemini-hook.mjs`
  : `\${extensionPath}/skills/${args.name}/scripts/telemetry/gemini-hook.mjs`;
write(
  path.join(extensionDir, "hooks", "hooks.json"),
  `${JSON.stringify(hooksFile(`node "${hookScript}"`), null, 2)}\n`,
);

console.log(
  `\nInstalled ${args.dryRun ? "(dry run) " : ""}as the Gemini extension "${args.name}": ` +
    `one skill and ${fs.readdirSync(COMMANDS_DIR).filter((f) => f.endsWith(".md")).length} commands.\n` +
    "Restart Gemini CLI, then check it with:\n\n" +
    `    gemini extensions list\n` +
    `    gemini extensions validate "${posix(extensionDir)}"\n` +
    (args.link
      ? "\nLinked to this checkout — the skill tracks your working tree, and Gemini can\n" +
        "only read it while the checkout is a workspace directory.\n"
      : "\nThe source checkout is no longer needed; this install is self-contained.\n"),
);
