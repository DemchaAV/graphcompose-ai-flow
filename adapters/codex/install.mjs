#!/usr/bin/env node
/**
 * adapters/codex/install.mjs — install the harness for Codex, self-contained.
 *
 *   node adapters/codex/install.mjs [options]
 *
 * Codex looks for skills at ~/.codex/skills/<name>/SKILL.md — flat, one
 * directory per skill, no plugin manifest. This installs two things:
 *
 *   ~/.codex/graphcompose-flow/<version>/   the harness runtime, copied
 *   ~/.codex/skills/graphcompose-<name>/    stubs pointing into that copy
 *
 * The copy is the point. Pointing the stubs at a source checkout meant the
 * skills broke whenever the repository moved, was renamed, was deleted after
 * install, or lived on a drive that was not mounted — and a synced ~/.codex
 * carried paths that were meaningless on the second machine. An installed
 * version does not move.
 *
 * Versioned rather than a single directory, so installing a new release cannot
 * half-overwrite the one a session is currently using; old versions are removed
 * with --prune when you want the disk back.
 *
 * Contributors who want the skills to track their working tree can pass
 * --link, which keeps the old behaviour of pointing at this checkout.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKFLOWS_DIR = path.join(repoRoot, "skills", "workflows");

/**
 * What the workflow skills actually reach for at run time. Everything else in
 * the repository — examples, published templates, the site, the superseded
 * prompt chain — is not part of the runtime and is deliberately absent.
 */
const RUNTIME = [
  { from: "config" },
  { from: "schemas" },
  { from: "scripts" },
  { from: "skills" },
  { from: "AGENTS.md" },
  { from: "package.json" },
  { from: "tools/asset-resolver", skip: ["node_modules"] },
  // The TypeScript CLIs ship as their build output plus the manifests needed to
  // install runtime dependencies; their source and dev toolchain stay behind.
  { from: "tools/revision-manager/bin" },
  { from: "tools/revision-manager/dist" },
  { from: "tools/revision-manager/package.json" },
  { from: "tools/revision-manager/package-lock.json", optional: true },
  { from: "tools/visual-diff/bin" },
  { from: "tools/visual-diff/dist" },
  { from: "tools/visual-diff/package.json" },
  { from: "tools/visual-diff/package-lock.json", optional: true },
  { from: "tools/preview-renderer/pom.xml" },
  { from: "tools/preview-renderer/target/preview-renderer.jar" },
];

/** Packages whose runtime dependencies are installed inside the copy. */
const NPM_PACKAGES = ["tools/revision-manager", "tools/visual-diff"];

/** Built outputs the source tree must already have. */
const REQUIRED_BUILDS = [
  "tools/revision-manager/dist/cli.js",
  "tools/visual-diff/dist/cli.js",
  "tools/preview-renderer/target/preview-renderer.jar",
];

/** Invariants worth restating in a stub, because they are cheap and load-bearing. */
const ALWAYS = [
  "Never invent GraphCompose API — the pinned pack's `00-api-surface.md` is a closed set.",
  "Every change opens a new revision; never overwrite an APPROVED one.",
  "Resolve the GraphCompose version from the user's build file, never by asking.",
  "Work goes in the user's workspace (`graphcompose-flow/`), not in the harness install.",
];

function usage(code = 0) {
  process.stdout.write(
    "usage: node adapters/codex/install.mjs [options]\n\n" +
      "  --home <dir>    where the runtime is installed (default: ~/.codex/graphcompose-flow)\n" +
      "  --dest <dir>    skills directory (default: ~/.codex/skills)\n" +
      "  --prefix <p>    installed skill name prefix (default: graphcompose-)\n" +
      "  --link          point the skills at THIS checkout instead of copying\n" +
      "                  (for contributors: the skills then track your working tree)\n" +
      "  --skip-deps     do not run npm ci inside the copy\n" +
      "  --prune         remove installed versions other than this one\n" +
      "  --dry-run       print what would happen, change nothing\n" +
      "  --uninstall     remove the stubs, and the runtime under --home\n",
  );
  process.exit(code);
}

function parseArgs(argv) {
  const out = {
    home: path.join(os.homedir(), ".codex", "graphcompose-flow"),
    dest: path.join(os.homedir(), ".codex", "skills"),
    prefix: "graphcompose-",
    link: false,
    skipDeps: false,
    prune: false,
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
    else if (a === "--prune") out.prune = true;
    else if (a === "--home") out.home = argv[++i];
    else if (a === "--dest") out.dest = argv[++i];
    else if (a === "--prefix") out.prefix = argv[++i];
    else {
      process.stderr.write(`[codex-install] unknown argument: ${a}\n`);
      usage(2);
    }
  }
  return out;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** Frontmatter of a source SKILL.md — the description is the trigger surface. */
function readSkill(dir) {
  const file = path.join(WORKFLOWS_DIR, dir, "SKILL.md");
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(fs.readFileSync(file, "utf8"));
  if (!match) throw new Error(`${file} has no frontmatter`);
  const field = (name) => {
    const hit = new RegExp(`^${name}:\\s*(.+)$`, "m").exec(match[1]);
    return hit ? hit[1].trim() : null;
  };
  const description = field("description");
  if (!description) throw new Error(`${file} has no description`);
  return { dir, name: field("name") ?? dir, description };
}

function discoverSkills() {
  return fs
    .readdirSync(WORKFLOWS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => fs.existsSync(path.join(WORKFLOWS_DIR, entry.name, "SKILL.md")))
    .map((entry) => readSkill(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function stubFor(skill, installedName, runtimeRoot, linked) {
  const skillPath = path.join(runtimeRoot, "skills", "workflows", skill.dir, "SKILL.md");
  return `---
name: ${installedName}
description: ${skill.description}
---

# ${installedName} (GraphCompose AI Flow)

**Read the canonical skill before doing anything else:**

\`${skillPath}\`

That file is the contract — steps, commands, gates and the references it
links to. This stub exists only so Codex can offer the skill; it is
generated by \`adapters/codex/install.mjs\` and deliberately carries no
copy of the instructions, so it cannot drift from the source.

Run the commands it gives you from the harness root:

\`${runtimeRoot}\`
${
  linked
    ? "\n> Installed with `--link`: that path is a source checkout, so the skill\n> tracks your working tree — and breaks if the checkout moves.\n"
    : ""
}
## Holds regardless

${ALWAYS.map((line) => `- ${line}`).join("\n")}

## Shell note

Every command in the canonical skill is a plain \`node …\` invocation, so
it runs unchanged in PowerShell, cmd and bash. Do not "translate" them.
`;
}

/** Copy a file or directory, skipping named children. */
function copyInto(source, target, skip = []) {
  const stat = fs.statSync(source);
  if (stat.isFile()) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    return 1;
  }
  let copied = 0;
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (skip.includes(entry.name)) continue;
    copied += copyInto(path.join(source, entry.name), path.join(target, entry.name), skip);
  }
  return copied;
}

function directorySizeKb(dir) {
  let bytes = 0;
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else bytes += fs.statSync(full).size;
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return Math.round(bytes / 1024);
}

const args = parseArgs(process.argv.slice(2));
const version = readJson(path.join(repoRoot, "package.json")).version;
const skills = discoverSkills();
if (skills.length === 0) {
  process.stderr.write(`[codex-install] no skills found under ${WORKFLOWS_DIR}\n`);
  process.exit(1);
}

// --- uninstall ---------------------------------------------------------------
if (args.uninstall) {
  let removed = 0;
  for (const skill of skills) {
    const dir = path.join(args.dest, `${args.prefix}${skill.dir}`);
    if (!fs.existsSync(dir)) continue;
    console.log(`${args.dryRun ? "would remove" : "removed"} ${dir}`);
    if (!args.dryRun) fs.rmSync(dir, { recursive: true, force: true });
    removed += 1;
  }
  if (fs.existsSync(args.home)) {
    console.log(`${args.dryRun ? "would remove" : "removed"} ${args.home}`);
    if (!args.dryRun) fs.rmSync(args.home, { recursive: true, force: true });
  }
  console.log(`\n${removed} stub(s) ${args.dryRun ? "would be " : ""}removed.`);
  process.exit(0);
}

// --- resolve the runtime root ------------------------------------------------
const runtimeRoot = args.link ? repoRoot : path.join(args.home, version);

if (!args.link) {
  const unbuilt = REQUIRED_BUILDS.filter((rel) => !fs.existsSync(path.join(repoRoot, rel)));
  if (unbuilt.length > 0) {
    process.stderr.write(
      "[codex-install] the harness is not built, so there is nothing to install:\n" +
        unbuilt.map((rel) => `  missing ${rel}\n`).join("") +
        "\nRun the one-time setup from the repository root first:\n\n    npm run setup\n",
    );
    process.exit(69); // EX_UNAVAILABLE — same code the CLIs use when unbuilt
  }
}

console.log(`[codex-install] version : ${version}`);
console.log(`[codex-install] runtime : ${runtimeRoot}${args.link ? "  (linked checkout)" : ""}`);
console.log(`[codex-install] skills  : ${args.dest}${args.dryRun ? "   (dry run)" : ""}\n`);

// --- copy the runtime --------------------------------------------------------
if (!args.link) {
  if (args.dryRun) {
    console.log(`would copy ${RUNTIME.length} path(s) into ${runtimeRoot}`);
  } else {
    // A half-copied version is worse than none: replace it wholesale.
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
    let files = 0;
    for (const item of RUNTIME) {
      const source = path.join(repoRoot, item.from);
      if (!fs.existsSync(source)) {
        if (item.optional) continue;
        process.stderr.write(`[codex-install] missing ${item.from}\n`);
        process.exit(1);
      }
      files += copyInto(source, path.join(runtimeRoot, item.from), item.skip ?? []);
    }
    console.log(`copied ${files} file(s), ${directorySizeKb(runtimeRoot)} KB`);

    if (!args.skipDeps) {
      for (const pkg of NPM_PACKAGES) {
        const cwd = path.join(runtimeRoot, pkg);
        const lock = fs.existsSync(path.join(cwd, "package-lock.json"));
        process.stdout.write(`installing runtime dependencies in ${pkg} … `);
        try {
          // Windows: Node refuses to spawn .cmd without a shell (CVE-2024-27980)
          // and warns when args go through shell:true unescaped, so go through
          // cmd.exe explicitly — the same idiom scripts/validate-skills.mjs uses
          // for mvn.
          const npmArgs = [lock ? "ci" : "install", "--omit=dev", "--no-audit", "--no-fund"];
          const [command, commandArgs] =
            process.platform === "win32"
              ? ["cmd.exe", ["/d", "/s", "/c", "npm", ...npmArgs]]
              : ["npm", npmArgs];
          execFileSync(command, commandArgs, { cwd, stdio: "pipe" });
          console.log("ok");
        } catch (err) {
          console.log("failed");
          process.stderr.write(
            `[codex-install] npm failed in ${pkg}. The install is otherwise complete; ` +
              `run npm ci --omit=dev there yourself, or re-run with --skip-deps.\n` +
              `${(err.stderr ?? "").toString().split("\n").slice(0, 3).join("\n")}\n`,
          );
        }
      }
    }
  }
}

// --- write the stubs ---------------------------------------------------------
for (const skill of skills) {
  const installedName = `${args.prefix}${skill.dir}`;
  const file = path.join(args.dest, installedName, "SKILL.md");
  console.log(`${args.dryRun ? "would write" : "wrote"} ${file}`);
  if (args.dryRun) continue;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, stubFor(skill, installedName, runtimeRoot, args.link), "utf8");
}

// --- prune older versions ----------------------------------------------------
if (args.prune && fs.existsSync(args.home)) {
  for (const entry of fs.readdirSync(args.home, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === version) continue;
    console.log(`${args.dryRun ? "would prune" : "pruned"} ${path.join(args.home, entry.name)}`);
    if (!args.dryRun) fs.rmSync(path.join(args.home, entry.name), { recursive: true, force: true });
  }
}

console.log(
  `\n${skills.length} skill(s) ${args.dryRun ? "would be " : ""}installed for Codex.` +
    (args.link
      ? "\nLinked to this checkout — re-run without --link for an install that survives moving it."
      : "\nThe source checkout is no longer needed; this install is self-contained."),
);
