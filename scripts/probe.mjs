#!/usr/bin/env node
/**
 * scripts/probe.mjs — ask the library how it behaves, instead of writing Java
 * to find out.
 *
 *   node scripts/probe.mjs --list [--version 2.2]
 *   node scripts/probe.mjs <probe-name> [--version 2.2] [--json]
 *
 * The first acceptance run wrote four probes by hand — 305 lines of Java — to
 * establish three GraphCompose behaviours, then left them inside one CV
 * project. The knowledge was real and the next run would have paid for it
 * again.
 *
 * A probe answers one question about one library line by laying out or
 * rendering the smallest arrangement that settles it, and prints a single JSON
 * object: the measurements, and a `finding` derived from them. Derived, never
 * asserted — a probe that hardcodes its own conclusion cannot report that the
 * library changed under it, which is the whole reason to keep it around.
 *
 * Compilation is cached by Maven, so the first call to a line is slow and the
 * rest are not.
 *
 * Exit codes: 0 answered, 1 the probe failed to build or run, 2 usage.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { installRoot } from "./lib/workspace.mjs";

const repoRoot = installRoot();
const DIAGNOSTICS = path.join(repoRoot, "tools", "diagnostics");
const MAIN_CLASS = "com.demcha.graphcompose.diagnostics.Probes";

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/probe.mjs <probe-name> [--version <line>] [--json]\n" +
      "       node scripts/probe.mjs --list [--version <line>]\n\n" +
      "  <probe-name>       a probe from --list, e.g. anchor-alignment\n" +
      "  --version <line>   GraphCompose line, e.g. 2.2 (default: the newest with probes)\n" +
      "  --json             print the probe's JSON verbatim rather than a summary\n",
  );
  process.exit(code);
}

function parseArgs(argv) {
  const out = { probe: null, version: null, json: false, list: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--list") out.list = true;
    else if (a === "--json") out.json = true;
    else if (a === "--version" || a === "-v") out.version = argv[++i];
    else if (a.startsWith("--")) {
      process.stderr.write(`[probe] unknown argument: ${a}\n`);
      usage(2);
    } else out.probe = a;
  }
  if (!out.probe && !out.list) {
    process.stderr.write("[probe] a probe name or --list is required\n");
    usage(2);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

/** Lines that have a diagnostics project, newest first. */
function availableLines() {
  if (!fs.existsSync(DIAGNOSTICS)) return [];
  return fs
    .readdirSync(DIAGNOSTICS, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^graphcompose-\d+\.\d+$/.test(e.name))
    .map((e) => e.name.replace("graphcompose-", ""))
    .sort((a, b) => compareLines(b, a));
}

function compareLines(a, b) {
  const [aMajor, aMinor] = a.split(".").map(Number);
  const [bMajor, bMinor] = b.split(".").map(Number);
  return aMajor - bMajor || aMinor - bMinor;
}

const lines = availableLines();
if (lines.length === 0) {
  process.stderr.write(`[probe] no diagnostics projects under ${DIAGNOSTICS}\n`);
  process.exit(1);
}

const version = args.version ?? lines[0];
const projectDir = path.join(DIAGNOSTICS, `graphcompose-${version}`);
if (!fs.existsSync(projectDir)) {
  process.stderr.write(
    `[probe] no probes for GraphCompose ${version}. Lines with probes: ${lines.join(", ")}.\n` +
      "A probe is real code against one API, so it is not reused across lines — " +
      "add tools/diagnostics/graphcompose-<line>/ to cover a new one.\n",
  );
  process.exit(1);
}

const result = run(args.list ? ["--list"] : [args.probe]);

if (args.json || args.list) {
  process.stdout.write(`${result.raw}\n`);
  process.exit(result.status);
}

// The default view is the answer, not the transcript. --json is there when a
// caller wants the numbers.
const parsed = result.parsed;
if (!parsed) {
  process.stdout.write(`${result.raw}\n`);
  process.exit(result.status);
}
process.stdout.write(`${parsed.probe} · GraphCompose ${parsed.graphComposeVersion}\n\n`);
process.stdout.write(`  ${parsed.question}\n\n`);
if (parsed.finding) process.stdout.write(`  ${parsed.finding}\n\n`);
process.stdout.write("  Numbers: rerun with --json\n");
process.exit(result.status);

// ----------------------------------------------------------------- running ---

function run(probeArgs) {
  const maven = process.platform === "win32" ? "mvn.cmd" : "mvn";
  const shell = process.platform === "win32";

  // Compile first and separately, so a build failure is reported as one rather
  // than surfacing as unparseable probe output.
  const compile = spawnSync(maven, ["-q", "-B", "compile"], {
    cwd: projectDir,
    encoding: "utf8",
    shell,
  });
  if (compile.status !== 0) {
    process.stderr.write(
      `[probe] the diagnostics project for ${version} does not compile against its pinned GraphCompose.\n` +
        `${compile.stdout ?? ""}${compile.stderr ?? ""}`,
    );
    process.exit(1);
  }

  const classpathFile = path.join(projectDir, "target", "probe-classpath.txt");
  const classpath = spawnSync(
    maven,
    ["-q", "-B", "dependency:build-classpath", `-Dmdep.outputFile=${classpathFile}`],
    { cwd: projectDir, encoding: "utf8", shell },
  );
  if (classpath.status !== 0 || !fs.existsSync(classpathFile)) {
    process.stderr.write("[probe] could not resolve the diagnostics classpath\n");
    process.exit(1);
  }

  const full = `${path.join(projectDir, "target", "classes")}${path.delimiter}${fs
    .readFileSync(classpathFile, "utf8")
    .trim()}`;

  // The jar carries no Implementation-Version, so the pinned version is passed
  // in. A probe's answer is only true of the build that produced it, so the
  // output has to name one.
  const pom = fs.readFileSync(path.join(projectDir, "pom.xml"), "utf8");
  const pinned = pom.match(/<graphcompose\.version>([^<]+)<\/graphcompose\.version>/)?.[1]?.trim();

  const java = spawnSync(
    "java",
    [...(pinned ? [`-Dgraphcompose.version=${pinned}`] : []), "-cp", full, MAIN_CLASS, ...probeArgs],
    { cwd: projectDir, encoding: "utf8" },
  );
  const raw = (java.stdout ?? "").trim();
  if (!raw) {
    process.stderr.write(`[probe] the probe printed nothing\n${java.stderr ?? ""}`);
    process.exit(1);
  }

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Left null: the raw output is printed and the caller can see why.
  }
  return { raw, parsed, status: java.status ?? 1 };
}
