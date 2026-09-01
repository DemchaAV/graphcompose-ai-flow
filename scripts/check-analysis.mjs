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
 * ## Two barriers, because two things wait
 *
 * `--for plan` (the default) is the three discovery artifacts: may the
 * architecture plan start.
 *
 * `--for authoring` adds what authoring itself reads — the plan, and the assets
 * manifest — plus the one disagreement no schema can see: an icon the request
 * asked for and the manifest does not carry. Both files can be perfectly shaped
 * and still leave a token unresolved, and the template then has no record to
 * read for it, so the icon is missing from a render nobody flagged.
 *
 * The manifest belongs to the second barrier and not the first on purpose.
 * Asset resolution reads only `asset-request.json`; it feeds neither the plan
 * nor the geometry, so it runs beside them. Requiring it one barrier earlier
 * would serialise the very thing that measured 26 minutes of the median
 * time-to-first-render.
 *
 * This is deliberately not a render gate and not a review gate.
 *
 * Exit: 0 the barrier is clear · 1 something it needs is not · 2 usage.
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
      "  --for plan|authoring  which barrier to check (default: plan)\n" +
      "  --root <workspace> workspace override\n" +
      "  --json             machine-readable\n\n" +
      "exit: 0 the barrier is clear | 1 an artifact is missing or invalid | 2 usage\n",
  );
  process.exit(code);
}

const args = { project: null, revision: null, root: null, json: false, for: "plan" };
for (let i = 2; i < process.argv.length; i += 1) {
  const a = process.argv[i];
  if (a === "--help" || a === "-h") usage(0);
  else if (a === "--json") args.json = true;
  else if (a === "--project" || a === "-p") args.project = process.argv[++i];
  else if (a === "--revision" || a === "-r") args.revision = process.argv[++i];
  else if (a === "--root") args.root = process.argv[++i];
  else if (a === "--for") args.for = process.argv[++i];
  else {
    process.stderr.write(`[analysis] unknown argument: ${a}\n`);
    usage(2);
  }
}
if (!args.project) usage(2);
if (args.for !== "plan" && args.for !== "authoring") {
  process.stderr.write(`[analysis] --for takes plan or authoring, not "${args.for}"\n`);
  usage(2);
}

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

/**
 * Every icon the request asked for is in the manifest.
 *
 * The one thing schema validation cannot see. Both files can be perfectly
 * shaped and still disagree: a token the resolver could not find is simply
 * absent from the manifest, the template then has no record to read for it,
 * and the icon is missing from a render nobody flagged. Checked by token,
 * because that is the name the template uses.
 */
function requestedIconsResolved() {
  const requestFile = path.join(revisionDir, "asset-request.json");
  const manifestFile = path.join(revisionDir, "assets-manifest.json");
  if (!fs.existsSync(requestFile) || !fs.existsSync(manifestFile)) return null;
  let request;
  let manifest;
  try {
    request = readJson(requestFile);
    manifest = readJson(manifestFile);
  } catch {
    return null; // the schema checks already report an unreadable file
  }
  const asked = (request.icons ?? []).map((i) => i.token).filter(Boolean);
  const got = new Set(Object.keys(manifest.icons ?? {}));
  const unresolved = asked.filter((token) => !got.has(token));
  return {
    name: "requested icons resolved",
    ok: unresolved.length === 0,
    detail:
      unresolved.length === 0
        ? `${asked.length} of ${asked.length} token(s)`
        : `${unresolved.length} token(s) the resolver did not return: ${unresolved.join(", ")}`,
  };
}

const artifacts = [
  { name: "visual-analysis.json", ...bySchema(path.join(revisionDir, "visual-analysis.json"), "visual-analysis.schema.json") },
  dataArtifact(),
  { name: "asset-request.json", ...bySchema(path.join(revisionDir, "asset-request.json"), "asset-request.schema.json") },
];

// The authoring barrier is the plan barrier plus what authoring itself reads.
// Asset resolution runs concurrently with the plan — it feeds neither — so the
// manifest is required here and deliberately not one line earlier.
if (args.for === "authoring") {
  artifacts.push(
    { name: "architecture-plan.json", ...bySchema(path.join(revisionDir, "architecture-plan.json"), "architecture-plan.schema.json") },
    { name: "assets-manifest.json", ...bySchema(path.join(revisionDir, "assets-manifest.json"), "assets-manifest.schema.json") },
  );
  const resolved = requestedIconsResolved();
  if (resolved) artifacts.push(resolved);
}

const complete = artifacts.every((a) => a.ok);
const result = { project: args.project, revision: revisionId, barrier: args.for, complete, artifacts };

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  const lines = [`analysis  ${args.project} / ${revisionId}  (barrier: ${args.for})`];
  for (const a of artifacts) lines.push(`  ${a.ok ? "ok  " : "WAIT"}  ${a.name.padEnd(30)} ${a.detail}`);
  lines.push(
    complete
      ? args.for === "authoring"
        ? "\n  everything authoring reads is complete — the template may be written"
        : "\n  discovery is complete — the architecture plan may start"
      : "\n  not clear; re-run what failed rather than working around it",
  );
  process.stdout.write(`${lines.join("\n")}\n`);
}
process.exitCode = complete ? 0 : 1;
