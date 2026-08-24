#!/usr/bin/env node
/**
 * scripts/run-pipeline.mjs — show (and optionally run) the agent pipeline for
 * one reference/revision.
 *
 *   node scripts/run-pipeline.mjs <project-id> [--revision <id>] [--scope <scope>] [--render]
 *
 * The authoring steps are LLM-driven: the agent opens each prompt and writes the
 * revision artifacts. This script does NOT fake them. It resolves the correct
 * ordered agent chain for the revision's scope and prints the exact prompt files
 * to open, in order, plus the mechanical render command. With --render it runs
 * the deterministic render step (scripts/render.mjs).
 *
 * Routing source of truth: config/pipeline.json, read through
 * scripts/lib/pipeline-config.mjs. This script holds no chain of its own — when
 * a scope gains or loses a stage, the config is the only file to edit.
 * "new" is inferred for a first revision (revision-001 / parentRevisionId null)
 * and runs the full chain.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadPipelineConfig,
  resolveScope,
  scopeNames,
  stagesForScope,
} from "./lib/pipeline-config.mjs";
import {
  describeWorkspaceLine,
  installRoot,
  projectDir as workspaceProjectDir,
  resolveWorkspace,
} from "./lib/workspace.mjs";

const repoRoot = installRoot();

const config = loadPipelineConfig({ repoRoot });

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/run-pipeline.mjs <project-id> [--revision <id>] [--scope <scope>] [--render] [--root <workspace>]\n\n" +
      "  --revision <id>   default: project currentDraftRevisionId, else revision-001\n" +
      `  --scope <scope>   ${scopeNames(config).join(" | ")}\n` +
      "                    default: revision.json scope, else inferred\n" +
      "  --render          run the mechanical render step (scripts/render.mjs)\n" +
      "  --root <dir>      workspace holding the projects; default: GRAPHCOMPOSE_FLOW_ROOT,\n" +
      "                    a graphcompose-flow/ found above the cwd, else this repo's examples/\n",
  );
  process.exit(code);
}

function parseArgs(argv) {
  const out = { project: null, revision: null, scope: null, render: false, root: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--render") out.render = true;
    else if (a === "--revision" || a === "-r") out.revision = argv[++i];
    else if (a === "--scope" || a === "-s") out.scope = argv[++i];
    else if (a === "--root") out.root = argv[++i];
    else if (!a.startsWith("-") && !out.project) out.project = a;
  }
  return out;
}

function readJsonOr(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

const args = parseArgs(process.argv.slice(2));
if (!args.project) usage(2);

const workspace = resolveWorkspace({ explicitRoot: args.root });
const workspaceBanner = describeWorkspaceLine(workspace);
if (workspaceBanner) console.log(workspaceBanner);

const projectDir = workspaceProjectDir(workspace, args.project);
const projectFile = path.join(projectDir, "template-project.json");
if (!fs.existsSync(projectFile)) {
  console.error(
    `[run-pipeline] project not found: ${path.relative(workspace.root, projectFile) || projectFile}` +
      ` (workspace ${workspace.root}, resolved by: ${workspace.mode})`,
  );
  process.exit(2);
}
const project = readJsonOr(projectFile, {});

const revisionId =
  args.revision || project.currentDraftRevisionId || "revision-001";
const revisionDir = path.join(projectDir, "revisions", revisionId);
const revision = readJsonOr(path.join(revisionDir, "revision.json"), null);
// In install mode the project lives at examples/<id> and the printed commands
// stay exactly what they always were; in a user workspace they carry --root so
// they can be copied out of the terminal and run anywhere.
// Forward slashes: these strings are printed as commands to paste into a
// shell, where a Windows path.join separator would be an escape character.
const posix = (p) => p.split(path.sep).join("/");
const projectDisplay =
  workspace.mode === "install" ? `examples/${args.project}` : posix(projectDir);
const rootFlag = workspace.mode === "install" ? "" : ` --root ${workspace.root}`;

if (!revision && !args.render) {
  console.error(
    `[run-pipeline] note: ${posix(path.join(projectDir, "revisions", revisionId, "revision.json"))} not found yet; ` +
      `treating it as a new revision to author.`,
  );
}

// Resolve scope: explicit flag > revision.json scope > inference.
const scope = resolveScope({ explicitScope: args.scope, revision, revisionId });

const stages = stagesForScope(config, scope);
if (!stages) {
  console.error(
    `[run-pipeline] unknown scope "${scope}". Known: ${scopeNames(config).join(", ")}`,
  );
  process.exit(2);
}

// --- print the pipeline -----------------------------------------------------
const bold = (s) => (process.stdout.isTTY ? `\x1b[1m${s}\x1b[0m` : s);
const dim = (s) => (process.stdout.isTTY ? `\x1b[2m${s}\x1b[0m` : s);

const owningWorkflows = Object.entries(config.workflows ?? {})
  .filter(([id]) => !id.startsWith("$"))
  .filter(([, workflow]) => workflow.scopes?.includes(scope));

// The workflow that owns this scope is the instruction; the stages below are
// what it runs. Naming stages by what they DO rather than by which file
// currently implements them is what lets prompts/ be deleted without the chain
// changing meaning.
console.log(
  `\n${bold("Workflow")}: ${owningWorkflows.map(([id]) => id).join(" or ") || "(none — this scope opens no revision)"}`,
);
console.log(`${bold("Scope")}:    ${scope}   ${dim(`project=${args.project} revision=${revisionId}`)}`);
for (const [, workflow] of owningWorkflows) console.log(dim(`  follow: ${workflow.skill}`));
console.log("");

const labelWidth = Math.max(...stages.map((stage) => stage.label.length));
stages.forEach((stage, i) => {
  const n = String(i + 1).padStart(2, "0");
  console.log(
    `  ${n}  ${stage.label.padEnd(labelWidth)}  ${stage.kind.toUpperCase().padEnd(4)}` +
      `  ${dim(stage.description)}`,
  );
});

console.log(`\n  ${bold("mechanical render")} (the Test+Render step):`);
console.log(`        node scripts/render.mjs ${args.project} ${revisionId}${rootFlag}`);
console.log(`\n  ${bold("when parity is clean, approve")} (-> Revision Manager, then Template Publisher rebuilds templates/):`);
console.log(
  `        node tools/revision-manager/bin/graphcompose-flow.mjs approve ${revisionId} --project ${projectDisplay}`,
);

// --- optionally run the mechanical render -----------------------------------
if (args.render) {
  console.log(`\n${bold("> running render step")}: node scripts/render.mjs ${args.project} ${revisionId}\n`);
  const renderArgs = [path.join(repoRoot, "scripts", "render.mjs"), args.project, revisionId];
  if (workspace.mode !== "install") renderArgs.push("--root", workspace.root);
  const res = spawnSync(process.execPath, renderArgs, {
    cwd: repoRoot,
    stdio: "inherit",
  });
  process.exit(res.status ?? 1);
}
