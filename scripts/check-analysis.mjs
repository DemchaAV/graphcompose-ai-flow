#!/usr/bin/env node
/**
 * scripts/check-analysis.mjs — are the discovery artifacts done?
 *
 *   node scripts/check-analysis.mjs --project <id> [--revision <id>] [--for plan|authoring]
 *                                   [--only <artifact>] [--root <workspace>] [--json]
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
 * ## Three ways to ask
 *
 * `--for plan` (the default) is the three discovery artifacts: may the
 * architecture plan start.
 *
 * `--for authoring` adds what authoring itself reads — the plan, and the assets
 * manifest — plus the one disagreement no schema can see: something the request
 * asked for and the manifest does not carry. Both files can be perfectly shaped
 * and still leave a token unresolved, and the template then has no record to
 * read for it, so the icon is missing from a render nobody flagged.
 *
 * `--only <artifact>` asks about one file on its own. It exists for one
 * sentence in the workflow — "start the resolver the moment the request
 * validates" — which had no command behind it: the plan barrier answers for all
 * three artifacts together, so an agent following the sentence either waited
 * for the geometry and the content beside the request, re-serialising the very
 * thing that measured 26 minutes of the median time-to-first-render, or started
 * the resolver on a request nothing had checked.
 *
 * The manifest belongs to the authoring barrier and not the plan barrier on
 * purpose. Asset resolution reads only `asset-request.json`; it feeds neither
 * the plan nor the geometry, so it runs beside them.
 *
 * ## What "resolved" means for a font
 *
 * The resolver writes a record under every role it was asked for; a face it
 * cannot place is not absent, it is `status: "manual_drop_required"`. Two
 * different things wear that status. With `registration: "file-resource"` it is
 * a Google face the author drops as TTFs and registers in Java — the record
 * says how, authoring proceeds, and the barrier reports it. With
 * `registration: null` the request named a family its source does not carry,
 * the request is what needs fixing, and the barrier holds. The first version of
 * this check read key presence only, which the resolver never leaves empty, so
 * it could not fire — and the real unresolved state then failed the manifest
 * schema with advice ("re-run what failed") that re-produced the same manifest.
 *
 * ## Inline data
 *
 * `render.dataFileName: null` in `template-project.json` is a defined state: the
 * Java carries the data and there is nothing on disk to check. It is reported as
 * complete, not as "not written yet" — which is what it read as before, and a
 * project in that state could never clear the barrier.
 *
 * This is deliberately not a render gate and not a review gate; `render-and-diff`
 * runs the authoring barrier itself before a first render, so skipping it here
 * only moves the same answer to after the Java is written.
 *
 * Exit: 0 clear · 1 something it needs is not · 2 usage.
 */

import fs from "node:fs";
import path from "node:path";

import { installRoot, requireProjectDir, resolveWorkspace } from "./lib/workspace.mjs";
import { findDataFile } from "./lib/data-spec.mjs";
import { loadFailure, ready, schemaValidator } from "./lib/schema-validator.mjs";

const repoRoot = installRoot();

const DATA = "<doc-kind>-data.json";
const ARTIFACTS = ["visual-analysis.json", DATA, "asset-request.json", "architecture-plan.json", "assets-manifest.json"];
const PLAN_BARRIER = ["visual-analysis.json", DATA, "asset-request.json"];
const AUTHORING_BARRIER = [...PLAN_BARRIER, "architecture-plan.json", "assets-manifest.json"];

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/check-analysis.mjs --project <id> [--revision <id>] [--for plan|authoring]\n" +
      "                                      [--only <artifact>] [--root <workspace>] [--json]\n\n" +
      "  --project <id>        the project\n" +
      "  --revision <id>       the revision (default: the project's current draft)\n" +
      "  --for plan|authoring  which barrier to check (default: plan)\n" +
      `  --only <artifact>     one artifact on its own: ${ARTIFACTS.join(" | ")}\n` +
      "  --root <workspace>    workspace override\n" +
      "  --json                machine-readable\n\n" +
      "exit: 0 clear | 1 an artifact is missing or invalid | 2 usage\n",
  );
  process.exit(code);
}

const argv = process.argv.slice(2);
const args = { project: null, revision: null, root: null, json: false, for: "plan", only: null };
/** The word after a flag, or a usage error when the flag was the last one. */
function valueOf(flag, i) {
  const value = argv[i + 1];
  if (value === undefined || value.startsWith("--")) {
    process.stderr.write(`[analysis] ${flag} needs a value\n`);
    usage(2);
  }
  return value;
}
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === "--help" || a === "-h") usage(0);
  else if (a === "--json") args.json = true;
  else if (a === "--project" || a === "-p") args.project = valueOf(a, i++);
  else if (a === "--revision" || a === "-r") args.revision = valueOf(a, i++);
  else if (a === "--root") args.root = valueOf(a, i++);
  else if (a === "--for") args.for = valueOf(a, i++);
  else if (a === "--only") args.only = valueOf(a, i++);
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
if (args.only !== null) {
  // Any `*-data.json` names the data artifact: the real file is `cv-data.json`,
  // and a caller should not have to know the placeholder to ask about it.
  if (/-data\.json$/.test(args.only)) args.only = DATA;
  if (!ARTIFACTS.includes(args.only)) {
    process.stderr.write(`[analysis] --only takes one of ${ARTIFACTS.join(", ")}, not "${args.only}"\n`);
    usage(2);
  }
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

let project;
try {
  project = readJson(path.join(projectDir, "template-project.json"));
} catch (err) {
  // The environment path, like a missing draft or revision: a broken project
  // file is not an artifact that is not done, and reporting it as exit 1 with a
  // stack trace told the skill page's reader to "re-run what it names" — it
  // named nothing.
  process.stderr.write(`[analysis] ${args.project}/template-project.json is not readable — ${err.message}\n`);
  process.exit(2);
}
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

// Reported, never swallowed. A validator that degraded to "the file is there"
// would answer this command's one question wrongly, in the direction that lets
// a later stage proceed. The reason is kept because "not installed" and
// "installed but broken" are fixed by different commands.
const validatorProblem = (await ready()) ? null : loadFailure();

/** Parsed documents of the artifacts that validated, for the cross-check. */
const docs = {};

function readArtifact(file) {
  if (!fs.existsSync(file)) return { ok: false, detail: "not written yet" };
  try {
    return { ok: true, doc: readJson(file) };
  } catch (err) {
    return { ok: false, detail: `not valid JSON — ${err.message}` };
  }
}

function bySchema(name, schemaName) {
  const read = readArtifact(path.join(revisionDir, name));
  if (!read.ok) return { name, ok: false, detail: read.detail };
  const schemaFile = path.join(repoRoot, "schemas", schemaName);
  if (!fs.existsSync(schemaFile)) return { name, ok: false, detail: `no schema at schemas/${schemaName}` };
  const validate = schemaValidator(schemaFile);
  if (!validate) return { name, ok: false, detail: validatorProblem };
  const result = validate(read.doc);
  if (!result.valid) return { name, ok: false, detail: `fails ${schemaName}: ${result.errors.slice(0, 200)}` };
  docs[name] = read.doc;
  return { name, ok: true, detail: "validates" };
}

function dataArtifact() {
  if (project.render?.dataFileName === null) {
    return { name: DATA, ok: true, detail: "inline — the Java carries the data (render.dataFileName is null)" };
  }
  const file = findDataFile(projectDir, revisionDir);
  if (!file) return { name: DATA, ok: false, detail: "not written yet" };
  const name = path.basename(file);
  const read = readArtifact(file);
  if (!read.ok) return { name, ok: false, detail: read.detail };
  // No schema: the shape is the document's, and it differs per kind. What can
  // be said without one is that it is a document — a string's indices counted
  // as "fields" once, and a placeholder cleared the gate — and that it carries
  // something: an empty object is a file the content subagent opened and did
  // not fill.
  const doc = read.doc;
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    const what = doc === null ? "null" : Array.isArray(doc) ? "an array" : `a ${typeof doc}`;
    return { name, ok: false, detail: `not a document — the file holds ${what}, and a spec reads fields` };
  }
  const keys = Object.keys(doc);
  if (keys.length === 0) return { name, ok: false, detail: "parsed, but empty" };
  return { name, ok: true, detail: `${keys.length} top-level field(s)` };
}

/**
 * Everything the request asked for has a usable record in the manifest.
 *
 * Runs only on a request and a manifest that both validated, so the shapes are
 * the schemas' — the first version ran on anything that parsed and threw a bare
 * TypeError on a request whose `icons` was an object, before the line that
 * would have explained it was written.
 */
function requestedAssetsResolved(request, manifest) {
  const held = [];
  const manual = [];
  for (const icon of request.icons ?? []) {
    if (!icon?.token) continue;
    if (!manifest.icons?.[icon.token]) held.push(`icon ${icon.token}: no record`);
  }
  for (const font of request.fonts ?? []) {
    const role = font?.role;
    if (!role) continue;
    const record = manifest.fonts?.[role];
    if (!record) {
      held.push(`font ${role}: no record`);
    } else if (record.status === "ok") {
      // resolved
    } else if (record.status === "manual_drop_required" && record.registration === "file-resource") {
      manual.push(`${role} (${record.family}): ${record.notes ?? "drop the TTFs into assets/fonts/ and register via FontFamilyDefinition.files(...)"}`);
    } else {
      held.push(`font ${role}: ${record.status}${record.notes ? ` — ${record.notes}` : ""}`);
    }
  }
  const asked =
    (request.icons ?? []).filter((i) => i?.token).length + (request.fonts ?? []).filter((f) => f?.role).length;
  return {
    name: "requested assets resolved",
    ok: held.length === 0,
    detail:
      held.length > 0
        ? `${held.length} of ${asked} not resolved: ${held.join("; ")}`
        : `${asked} of ${asked} icon token(s) and font role(s)` +
          (manual.length > 0 ? ` — manual drop for ${manual.length}: ${manual.join("; ")}` : ""),
  };
}

const CHECKS = {
  "visual-analysis.json": () => bySchema("visual-analysis.json", "visual-analysis.schema.json"),
  [DATA]: dataArtifact,
  "asset-request.json": () => bySchema("asset-request.json", "asset-request.schema.json"),
  "architecture-plan.json": () => bySchema("architecture-plan.json", "architecture-plan.schema.json"),
  "assets-manifest.json": () => bySchema("assets-manifest.json", "assets-manifest.schema.json"),
};

let artifacts;
if (args.only) {
  artifacts = [CHECKS[args.only]()];
} else {
  artifacts = (args.for === "authoring" ? AUTHORING_BARRIER : PLAN_BARRIER).map((name) => CHECKS[name]());
  // The authoring barrier is the plan barrier plus what authoring itself reads.
  // Asset resolution runs concurrently with the plan — it feeds neither — so the
  // manifest is required here and deliberately not one line earlier.
  if (args.for === "authoring" && docs["asset-request.json"] && docs["assets-manifest.json"]) {
    artifacts.push(requestedAssetsResolved(docs["asset-request.json"], docs["assets-manifest.json"]));
  }
}

const complete = artifacts.every((a) => a.ok);
const result = {
  project: args.project,
  revision: revisionId,
  barrier: args.only ? null : args.for,
  ...(args.only ? { only: args.only } : {}),
  complete,
  artifacts,
};

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  const heading = args.only ? `only ${args.only}` : `barrier: ${args.for}`;
  const lines = [`analysis  ${args.project} / ${revisionId}  (${heading})`];
  for (const a of artifacts) lines.push(`  ${a.ok ? "ok  " : "WAIT"}  ${a.name.padEnd(30)} ${a.detail}`);
  if (!complete) {
    lines.push("\n  not clear; re-run what failed rather than working around it");
  } else if (args.only) {
    lines.push(`\n  ${args.only} is complete`);
  } else if (args.for === "authoring") {
    lines.push("\n  everything authoring reads is complete — the template may be written");
  } else {
    lines.push("\n  discovery is complete — the architecture plan may start");
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}
process.exitCode = complete ? 0 : 1;
