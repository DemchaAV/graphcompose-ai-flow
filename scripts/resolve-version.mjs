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

import { installRoot } from "./lib/workspace.mjs";
import { resolveVersion } from "./lib/version-resolver.mjs";

const EXIT = { supported: 0, unsupported: 3, unknown: 4 };

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/resolve-version.mjs [--project-dir <dir>] [--version <x.y.z>] [--json]\n\n" +
      "  --project-dir <dir>   Java project to inspect (default: current directory)\n" +
      "  --version <x.y.z>     skip build-file detection and map this version directly\n" +
      "  --json                print the full result as JSON\n",
  );
  process.exit(code);
}

function parseArgs(argv) {
  const out = { projectDir: process.cwd(), version: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--json") out.json = true;
    else if (a === "--project-dir" || a === "-C") out.projectDir = argv[++i];
    else if (a === "--version" || a === "-v") out.version = argv[++i];
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

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else if (result.status === "supported") {
  process.stdout.write(
    `GraphCompose ${result.version} (${result.line}.x) -> ${result.skillPack}\n` +
      (result.buildFile ? `  from ${result.buildFile}\n` : ""),
  );
} else {
  process.stderr.write(`${result.status}: ${result.message}\n`);
}

process.exit(EXIT[result.status] ?? 1);
