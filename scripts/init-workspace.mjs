#!/usr/bin/env node
/**
 * scripts/init-workspace.mjs — create the workspace inside a Java project.
 *
 *   node scripts/init-workspace.mjs [--project-dir <dir>] [--project <id>] [--json]
 *
 * `initWorkspace()` existed in scripts/lib/workspace.mjs from the start, but
 * nothing on the command line called it: the workflow reference told the agent
 * to import the module and call it inline. That left the one step that decides
 * *where every later command writes* as an LLM step with no deterministic
 * backstop, and the failure was silent rather than loud — with no manifest,
 * resolution falls through to install mode, whose projects directory is the
 * harness's own examples/. A user following the documented flow would have had
 * their work written into the installed runtime.
 *
 * So this is the missing half of the onboarding pair:
 *
 *   node scripts/resolve-version.mjs --project-dir <dir>   which pack applies
 *   node scripts/init-workspace.mjs  --project-dir <dir>   where the work goes
 *
 * The workspace is always created — that is this command's job, and doing it is
 * correct whatever the version turns out to be. The version only decides
 * whether the manifest can be seeded with pins; when it cannot, the reason is
 * printed and the exit code stays 0. `resolve-version` remains the command
 * whose exit code speaks about versions, so the two do not disagree.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { initWorkspace, installRoot, projectDir, WORKSPACE_DIR_NAME } from "./lib/workspace.mjs";
import { resolveVersion } from "./lib/version-resolver.mjs";

const REVISION_MANAGER = path.join(
  installRoot(),
  "tools",
  "revision-manager",
  "bin",
  "graphcompose-flow.mjs",
);

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/init-workspace.mjs [--project-dir <dir>] [--project <id>]\n" +
      "                                       [--template <name>] [--json]\n\n" +
      "  --project-dir <dir>   Java project to create the workspace in (default: current directory)\n" +
      "  --project <id>        also create a template project inside the workspace\n" +
      "  --template <name>     seed that project from a bundled template instead of an\n" +
      "                        empty scaffold; only seeds written for your pinned\n" +
      "                        GraphCompose line are accepted\n" +
      "  --json                print the result as JSON\n\n" +
      `Creates <project-dir>/${WORKSPACE_DIR_NAME}/ with a flow.config.json manifest.\n` +
      "Idempotent: an existing manifest is left exactly as it is.\n",
  );
  process.exit(code);
}

function parseArgs(argv) {
  const out = { projectDir: process.cwd(), project: null, template: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--json") out.json = true;
    else if (a === "--project-dir" || a === "-C") out.projectDir = argv[++i];
    else if (a === "--project" || a === "-p") out.project = argv[++i];
    else if (a === "--template" || a === "-t") out.template = argv[++i];
    else {
      process.stderr.write(`[init-workspace] unknown argument: ${a}\n`);
      usage(2);
    }
  }
  if (out.template && !out.project) {
    process.stderr.write("[init-workspace] --template needs --project <id> to seed into\n");
    usage(2);
  }
  if (out.projectDir === undefined || out.project === undefined || out.template === undefined) {
    process.stderr.write("[init-workspace] a flag is missing its value\n");
    usage(2);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const hostDir = path.resolve(args.projectDir);

if (!fs.existsSync(hostDir)) {
  process.stderr.write(`[init-workspace] no such directory: ${hostDir}\n`);
  process.exit(2);
}

const version = resolveVersion({ projectDir: hostDir, install: installRoot() });
const seed =
  version.status === "supported"
    ? { graphComposeVersion: version.version, skillPack: version.skillPack }
    : {};

const workspace = initWorkspace(hostDir, seed);

// projectDir() validates the id against the same allow-list every other command
// uses, so a bad name is rejected here rather than by whatever it collides with
// three steps later.
let created = null;
if (args.project) {
  let target;
  try {
    target = projectDir({ projectsDir: path.join(workspace.root, "projects") }, args.project);
  } catch (err) {
    // A rejected id is a usage mistake, not a crash; the allow-list message
    // already says what a valid name looks like.
    process.stderr.write(`${err.message}\n`);
    process.exit(2);
  }
  if (fs.existsSync(path.join(target, "template-project.json"))) {
    process.stderr.write(`[init-workspace] project "${args.project}" already exists at ${target}\n`);
    process.exit(3);
  }
  const initArgs = ["init", args.project];
  if (seed.graphComposeVersion) initArgs.push("--target-version", seed.graphComposeVersion);
  if (seed.skillPack) initArgs.push("--skill-pack", seed.skillPack);
  // Passing the version along is what lets the seed refuse a line it was not
  // written for, instead of handing back a project that cannot compile.
  if (args.template) initArgs.push("--template", args.template);

  // Run the revision manager rather than writing template-project.json here:
  // the project skeleton has exactly one owner, and this command is not it.
  const run = spawnSync(process.execPath, [REVISION_MANAGER, ...initArgs], {
    cwd: path.join(workspace.root, "projects"),
    encoding: "utf8",
  });
  if (run.status !== 0) {
    process.stderr.write(run.stderr || run.stdout || "[init-workspace] project creation failed\n");
    process.exit(run.status ?? 1);
  }
  created = target;
}

if (args.json) {
  process.stdout.write(
    `${JSON.stringify(
      {
        workspace: workspace.root,
        manifest: workspace.manifestPath,
        created: workspace.created,
        graphComposeVersion: seed.graphComposeVersion ?? null,
        skillPack: seed.skillPack ?? null,
        versionStatus: version.status,
        project: created,
      },
      null,
      2,
    )}\n`,
  );
  process.exit(0);
}

// Deliberately not the "[workspace] <root> (<mode>)" banner the other commands
// print: that parenthetical names how the workspace was *resolved*
// (explicit/env/discovered/install), and "created" is not a resolution mode.
process.stdout.write(
  `[init-workspace] ${workspace.created ? "created" : "already exists"}: ${workspace.root}\n`,
);

if (version.status === "supported") {
  process.stdout.write(`  GraphCompose ${version.version} -> ${version.skillPack}\n`);
} else {
  // Not a failure: the workspace is what was asked for, and the skills resolve
  // the version again when they run. Say why the pins are missing so it does
  // not look like the manifest was written wrong.
  process.stdout.write(
    `  no version pinned in the manifest — ${version.status}: ${version.message}\n` +
      "  run: node scripts/resolve-version.mjs --project-dir " +
      `${hostDir}\n`,
  );
}

if (created) {
  process.stdout.write(`  project: ${created}\n`);
} else {
  process.stdout.write(
    `\nNext: create a project inside it.\n` +
      `  node scripts/init-workspace.mjs --project-dir ${hostDir} --project <id>\n`,
  );
}
