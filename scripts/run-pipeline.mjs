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

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const config = loadPipelineConfig({ repoRoot });

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/run-pipeline.mjs <project-id> [--revision <id>] [--scope <scope>] [--render]\n\n" +
      "  --revision <id>   default: project currentDraftRevisionId, else revision-001\n" +
      `  --scope <scope>   ${scopeNames(config).join(" | ")}\n` +
      "                    default: revision.json scope, else inferred\n" +
      "  --render          run the mechanical render step (scripts/render.mjs)\n",
  );
  process.exit(code);
}

function parseArgs(argv) {
  const out = { project: null, revision: null, scope: null, render: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--render") out.render = true;
    else if (a === "--revision" || a === "-r") out.revision = argv[++i];
    else if (a === "--scope" || a === "-s") out.scope = argv[++i];
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

const projectDir = path.join(repoRoot, "examples", args.project);
const projectFile = path.join(projectDir, "template-project.json");
if (!fs.existsSync(projectFile)) {
  console.error(`[run-pipeline] project not found: examples/${args.project}/template-project.json`);
  process.exit(2);
}
const project = readJsonOr(projectFile, {});

const revisionId =
  args.revision || project.currentDraftRevisionId || "revision-001";
const revisionDir = path.join(projectDir, "revisions", revisionId);
const revision = readJsonOr(path.join(revisionDir, "revision.json"), null);
if (!revision && !args.render) {
  console.error(
    `[run-pipeline] note: ${path.join("examples", args.project, "revisions", revisionId, "revision.json")} not found yet; ` +
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

console.log(
  `\n${bold("Pipeline")}  project=${args.project}  revision=${revisionId}  scope=${bold(scope)}\n`,
);

let missing = 0;
stages.forEach((stage, i) => {
  const exists = fs.existsSync(path.join(repoRoot, stage.prompt));
  if (!exists) missing += 1;
  const n = String(i + 1).padStart(2, " ");
  const mark = exists ? " " : "!";
  console.log(`  ${mark}${n}. ${stage.prompt}`);
  console.log(`        ${dim(stage.description)}`);
});

console.log(`\n  ${bold("mechanical render")} (the Test+Render step):`);
console.log(`        node scripts/render.mjs ${args.project} ${revisionId}`);
console.log(`\n  ${bold("when parity is clean, approve")} (-> Revision Manager, then Template Publisher rebuilds templates/):`);
console.log(
  `        node tools/revision-manager/bin/graphcompose-flow.mjs approve ${revisionId} --project examples/${args.project}`,
);
if (missing > 0) {
  console.log(dim(`\n  (${missing} prompt file(s) marked "!" were not found under prompts/)`));
}

// --- optionally run the mechanical render -----------------------------------
if (args.render) {
  console.log(`\n${bold("> running render step")}: node scripts/render.mjs ${args.project} ${revisionId}\n`);
  const res = spawnSync(process.execPath, [path.join(repoRoot, "scripts", "render.mjs"), args.project, revisionId], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  process.exit(res.status ?? 1);
}
