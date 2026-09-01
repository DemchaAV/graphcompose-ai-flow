#!/usr/bin/env node
/**
 * scripts/check-analysis.mjs — are the three discovery artifacts done?
 *
 *   node scripts/check-analysis.mjs --project <id> [--revision <id>] [--json]
 *
 * Create phase 2 fans out: geometry writes `visual-analysis.json`, content
 * writes `<doc-kind>-data.json`, assets write `asset-request.json`. They do not
 * read each other, so on a host with subagents they run at once. This is the
 * command that says the fan-out has rejoined.
 *
 * ## Why "exists" was never good enough
 *
 * A file exists the moment a writer opens it. Joining on existence means the
 * next stage can read a half-written artifact, believe it, and plan around a
 * document it has only partly seen — and nothing downstream would report that,
 * because a plan built on incomplete discovery still renders. It renders the
 * wrong thing.
 *
 * So the barrier is *validates*: `visual-analysis.json` and `asset-request.json`
 * against their schemas, the data file against parsing and its own spec. An
 * artifact that fails is re-run, not patched around.
 *
 * This is deliberately not a render gate and not a review gate. It answers one
 * question — may the architecture plan start — and it answers it about the
 * three files the plan reads.
 *
 * Exit: 0 all three are complete · 1 at least one is not · 2 usage.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import { installRoot, requireProjectDir, resolveWorkspace } from "./lib/workspace.mjs";
import { findDataFile } from "./lib/data-spec.mjs";

const repoRoot = installRoot();

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/check-analysis.mjs --project <id> [--revision <id>] [--json]\n\n" +
      "  --project <id>     the project\n" +
      "  --revision <id>    the revision (default: the project's current draft)\n" +
      "  --root <workspace> workspace override\n" +
      "  --json             machine-readable\n\n" +
      "exit: 0 discovery is complete | 1 an artifact is missing or invalid | 2 usage\n",
  );
  process.exit(code);
}

const args = { project: null, revision: null, root: null, json: false };
for (let i = 2; i < process.argv.length; i += 1) {
  const a = process.argv[i];
  if (a === "--help" || a === "-h") usage(0);
  else if (a === "--json") args.json = true;
  else if (a === "--project" || a === "-p") args.project = process.argv[++i];
  else if (a === "--revision" || a === "-r") args.revision = process.argv[++i];
  else if (a === "--root") args.root = process.argv[++i];
  else {
    process.stderr.write(`[analysis] unknown argument: ${a}\n`);
    usage(2);
  }
}
if (!args.project) usage(2);

const workspace = resolveWorkspace({ explicitRoot: args.root ?? null });
let projectDir;
try {
  projectDir = requireProjectDir(workspace, args.project);
} catch (err) {
  process.stderr.write(`${err.message}\n`);
  process.exit(2);
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const project = readJson(path.join(projectDir, "template-project.json"));
const revisionId = args.revision ?? project.currentDraftRevisionId;
if (!revisionId) {
  process.stderr.write(`[analysis] ${args.project} has no draft revision, and none was named\n`);
  process.exit(2);
}
const revisionDir = path.join(projectDir, "revisions", revisionId);
if (!fs.existsSync(revisionDir)) {
  process.stderr.write(`[analysis] no such revision: ${revisionDir}\n`);
  process.exit(2);
}

/**
 * Ajv, from the schema-validation tooling, or null.
 *
 * Absent is reported rather than swallowed. A validator that silently degrades
 * to "the file is there" would answer this command's one question wrongly, in
 * the direction that lets a later stage proceed — which is the failure the
 * whole check exists to prevent.
 */
function loadAjv() {
  try {
    const require = createRequire(import.meta.url);
    const Ajv = require(path.join(repoRoot, ".github", "scripts", "node_modules", "ajv", "dist", "2020.js")).default;
    return new Ajv({ strict: false, allErrors: true });
  } catch {
    return null;
  }
}

const ajv = loadAjv();

function bySchema(file, schemaName) {
  if (!fs.existsSync(file)) return { ok: false, detail: "not written yet" };
  let doc;
  try {
    doc = readJson(file);
  } catch (err) {
    return { ok: false, detail: `not valid JSON — ${err.message}` };
  }
  const schemaFile = path.join(repoRoot, "schemas", schemaName);
  if (!ajv || !fs.existsSync(schemaFile)) {
    return {
      ok: false,
      detail: ajv
        ? `no schema at schemas/${schemaName}`
        : "the schema validator is not installed — run npm ci in .github/scripts",
    };
  }
  const validate = ajv.compile(readJson(schemaFile));
  if (validate(doc)) return { ok: true, detail: "validates" };
  return { ok: false, detail: `fails ${schemaName}: ${ajv.errorsText(validate.errors).slice(0, 200)}` };
}

function dataArtifact() {
  const file = findDataFile(projectDir, revisionDir);
  if (!file || !fs.existsSync(file)) return { name: "<doc-kind>-data.json", ok: false, detail: "not written yet" };
  let doc;
  try {
    doc = readJson(file);
  } catch (err) {
    return { name: path.basename(file), ok: false, detail: `not valid JSON — ${err.message}` };
  }
  // No schema: the shape is the document's, and it differs per kind. What can
  // be said without one is that it parsed and carries something — an empty
  // object is a file the content subagent opened and did not fill.
  const keys = Object.keys(doc ?? {});
  if (keys.length === 0) return { name: path.basename(file), ok: false, detail: "parsed, but empty" };
  return { name: path.basename(file), ok: true, detail: `${keys.length} top-level field(s)` };
}

const artifacts = [
  { name: "visual-analysis.json", ...bySchema(path.join(revisionDir, "visual-analysis.json"), "visual-analysis.schema.json") },
  dataArtifact(),
  { name: "asset-request.json", ...bySchema(path.join(revisionDir, "asset-request.json"), "asset-request.schema.json") },
];

const complete = artifacts.every((a) => a.ok);
const result = { project: args.project, revision: revisionId, complete, artifacts };

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  const lines = [`analysis  ${args.project} / ${revisionId}`];
  for (const a of artifacts) lines.push(`  ${a.ok ? "ok  " : "WAIT"}  ${a.name.padEnd(24)} ${a.detail}`);
  lines.push(
    complete
      ? "\n  discovery is complete — the architecture plan may start"
      : "\n  discovery is not complete; re-run what failed rather than planning around it",
  );
  process.stdout.write(`${lines.join("\n")}\n`);
}
process.exitCode = complete ? 0 : 1;
