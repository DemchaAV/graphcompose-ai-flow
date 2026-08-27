#!/usr/bin/env node
/**
 * scripts/resolve-version.mjs — which GraphCompose version does this Java
 * project pin, and which skill pack does that mean?
 *
 *   node scripts/resolve-version.mjs [--project-dir <dir>] [--version <x.y.z>] [--json]
 *
 * Reads pom.xml / build.gradle(.kts) at or above --project-dir (default: cwd),
 * finds the GraphCompose coordinate, and maps its major.minor line to a pack
 * under skills/versions/. Prints JSON with --json, otherwise a short summary.
 *
 * Exit codes: 0 supported, 3 unsupported (no pack for that line), 4 unknown
 * (no build file, or no GraphCompose dependency in it). Distinct codes so a
 * workflow skill can tell "you need a pack for 2.2" from "this is not a
 * GraphCompose project" without parsing prose.
 */

import { installRoot, resolveWorkspace } from "./lib/workspace.mjs";
import { resolveVersion } from "./lib/version-resolver.mjs";
import { acceptBuild, resolvedVersionPath } from "./lib/resolved-version.mjs";

const EXIT = { supported: 0, unsupported: 3, unknown: 4 };

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/resolve-version.mjs [--project-dir <dir>] [--version <x.y.z>] [--json]\n\n" +
      "  --project-dir <dir>   Java project to inspect (default: current directory)\n" +
      "  --version <x.y.z>     skip build-file detection and map this version directly\n" +
      "  --json                print the full result as JSON\n" +
      "  --accept-build        record that this build is deliberate, for a pin that names no\n" +
      "                        single one (a SNAPSHOT). Needs --decision; binds to that jar\n" +
      "  --decision <text>     which build this is and why it is the one to measure against\n" +
      "  --root <workspace>    workspace override for --accept-build\n",
  );
  process.exit(code);
}

function parseArgs(argv) {
  const out = {
    projectDir: process.cwd(),
    version: null,
    json: false,
    acceptBuild: false,
    decision: null,
    root: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--json") out.json = true;
    else if (a === "--project-dir" || a === "-C") out.projectDir = argv[++i];
    else if (a === "--version" || a === "-v") out.version = argv[++i];
    else if (a === "--accept-build") out.acceptBuild = true;
    else if (a === "--decision") out.decision = argv[++i];
    else if (a === "--root") out.root = argv[++i];
    else {
      process.stderr.write(`[resolve-version] unknown argument: ${a}\n`);
      usage(2);
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const result = resolveVersion({
  projectDir: args.projectDir,
  install: installRoot(),
  version: args.version,
});

if (args.acceptBuild) {
  // The decision belongs to the workspace, not to this invocation: every later
  // step reads the record, and a SNAPSHOT accepted once must stop being a
  // question until its bits change.
  if (result.status !== "supported") {
    process.stderr.write(`${result.status}: ${result.message}\n`);
    process.exit(EXIT[result.status] ?? 1);
  }
  const workspace = resolveWorkspace({ explicitRoot: args.root ?? null, cwd: args.projectDir });
  try {
    const record = acceptBuild(workspace, { decision: args.decision, resolved: result });
    process.stdout.write(
      `[resolve-version] accepted ${record.accepted.version}` +
        `${record.accepted.sha1 ? ` (sha1 ${record.accepted.sha1.slice(0, 12)})` : ""}\n` +
        `  recorded in ${resolvedVersionPath(workspace)}\n` +
        "  it becomes a question again the moment that jar changes\n",
    );
    process.exit(EXIT.supported);
  } catch (error) {
    process.stderr.write(`[resolve-version] ${error.message}\n`);
    process.exit(2);
  }
}

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else if (result.status === "supported") {
  process.stdout.write(
    `GraphCompose ${result.version} (${result.line}.x) -> ${result.skillPack}\n` +
      (result.buildFile ? `  from ${result.buildFile}\n` : "") +
      // A pack without a generated allow-list still resolves; saying so here is
      // the only warning before `api-query` dead-ends mid-authoring.
      (result.hasAllowList === false ? `  warning: ${result.message}\n` : ""),
  );
} else {
  process.stderr.write(`${result.status}: ${result.message}\n`);
}

process.exit(EXIT[result.status] ?? 1);
