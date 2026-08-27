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
 * The build is cached here rather than left to Maven. Warm, `mvn compile` still
 * costs about 3 s and resolving the classpath about 3.6 s, against 0.7 s for
 * the probe itself — and `observations verify` pays both once per observation.
 * Both are skipped when the evidence says they have nothing to do: no source
 * newer than the newest class, and a classpath resolved from the pom's current
 * contents whose every entry still exists. Contents, not timestamps — a commit
 * or a branch switch rewrites pom.xml, so a timestamp key invalidated after
 * every ordinary git operation while nothing had actually moved.
 * `--refresh` forces both.
 *
 * Exit codes: 0 answered, 1 the probe failed to build or run, 2 usage.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { installRoot, resolveWorkspace } from "./lib/workspace.mjs";
import { classpathIsUsable, needsCompile, stampClasspath } from "./lib/probe-cache.mjs";
import { readResolvedVersion } from "./lib/resolved-version.mjs";
import { selectBuild } from "./lib/probe-build.mjs";

const repoRoot = installRoot();
const DIAGNOSTICS = path.join(repoRoot, "tools", "diagnostics");
const MAIN_CLASS = "com.demcha.graphcompose.diagnostics.Probes";

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/probe.mjs <probe-name> [--version <line>] [--json]\n" +
      "       node scripts/probe.mjs --list [--version <line>]\n\n" +
      "  <probe-name>       a probe from --list, e.g. anchor-alignment\n" +
      "  --version <line>   GraphCompose line, e.g. 2.2 (default: the newest with probes)\n" +
      "  --build <x.y.z>    the exact build to measure (default: the workspace's resolved one,\n" +
      "                     then the diagnostics pom's pin). A SNAPSHOT is measured as itself\n" +
      "  --pinned           measure the pom's pinned release, whatever this workspace resolves\n" +
      "  --root <workspace> workspace override, for the default build\n" +
      "  --json             print the probe's JSON verbatim rather than a summary\n" +
      "  --refresh          rebuild and re-resolve, ignoring the cached build\n",
  );
  process.exit(code);
}

function parseArgs(argv) {
  const out = {
    probe: null,
    version: null,
    build: null,
    pinned: false,
    json: false,
    list: false,
    refresh: false,
    root: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--list") out.list = true;
    else if (a === "--refresh") out.refresh = true;
    else if (a === "--json") out.json = true;
    else if (a === "--version" || a === "-v") out.version = argv[++i];
    else if (a === "--build") out.build = argv[++i];
    else if (a === "--pinned") out.pinned = true;
    else if (a === "--root") out.root = argv[++i];
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

/**
 * Which BUILD the probe should measure, as opposed to which line it is written
 * against.
 *
 * <p>These were the same thing until a run needed them not to be. The
 * diagnostics pom pins a release, and every probe ran against that release
 * whatever the project under test was compiled from — so a run pinned to
 * `2.2.1-SNAPSHOT` asked "does the engine still do this?" and was answered
 * about `2.2.1`. It rewrote a page architecture on the strength of it, and the
 * observation it filed named a version nobody had measured.</p>
 *
 * <p>So the default is the build the workspace resolved, and the pom's pin is
 * the fallback for a run with no workspace. `--build` forces one, `--pinned`
 * asks for the pom's own — which is the right answer when the question is
 * "what does the released line do?" rather than "what does mine do?".</p>
 */
function resolveBuild() {
  if (args.pinned) return null;
  if (args.build) return { version: args.build, source: "--build" };

  const workspace = resolveWorkspace({ explicitRoot: args.root ?? null });
  const record = readResolvedVersion(workspace);
  if (!record?.version) return null;
  return { version: record.version, source: path.basename(workspace.root) };
}

const selected = selectBuild({
  requested: resolveBuild(),
  requestedLine: args.version ?? null,
  availableLines: lines,
});
const version = selected.line;
const build = selected.build;
if (selected.warning) process.stderr.write(`[probe] ${selected.warning}\n`);

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
  const classesDir = path.join(projectDir, "target", "classes");
  const pomFile = path.join(projectDir, "pom.xml");
  const pinned = fs
    .readFileSync(pomFile, "utf8")
    .match(/<graphcompose\.version>([^<]+)<\/graphcompose\.version>/)?.[1]
    ?.trim();

  // What this run will actually measure, and the override Maven needs to make
  // that true. Without the -D the pom's pin wins and the answer describes a
  // build the caller never asked about.
  const measuring = build?.version ?? pinned ?? null;
  const override =
    measuring && measuring !== pinned ? [`-Dgraphcompose.version=${measuring}`] : [];

  // One classpath per build: they resolve to different jars, and reusing the
  // cached one across a version change is the same substitution by another
  // route. The marker covers the compiled classes, which share a target/.
  const classpathFile = path.join(
    projectDir,
    "target",
    `probe-classpath${measuring ? `-${measuring.replace(/[^A-Za-z0-9.-]/g, "_")}` : ""}.txt`,
  );
  const markerFile = path.join(projectDir, "target", "probe-build-version.txt");
  const previous = fs.existsSync(markerFile)
    ? fs.readFileSync(markerFile, "utf8").trim()
    : null;
  const buildChanged = Boolean(measuring) && previous !== measuring;

  // Two Maven invocations dominate a probe: on a warm machine, compile takes
  // about 3 s and resolving the classpath about 3.6 s, against 0.7 s for the
  // probe itself. Neither has anything to do most of the time, and
  // `observations verify` pays both once per observation.
  //
  // A stale cache running old code would be worse than a slow probe, so both
  // are invalidated on evidence rather than on a timestamp file.
  if (args.refresh || buildChanged || needsCompile(path.join(projectDir, "src"), classesDir)) {
    // Compile separately, so a build failure is reported as one rather than
    // surfacing later as unparseable probe output.
    const compile = spawnSync(maven, ["-q", "-B", ...override, "compile"], {
      cwd: projectDir,
      encoding: "utf8",
      shell,
    });
    if (compile.status !== 0) {
      process.stderr.write(
        `[probe] the diagnostics project for ${version} does not compile against ` +
          `GraphCompose ${measuring ?? "its pinned version"}.\n` +
          `${compile.stdout ?? ""}${compile.stderr ?? ""}`,
      );
      process.exit(1);
    }
    if (measuring) fs.writeFileSync(markerFile, `${measuring}\n`, "utf8");
  }

  if (args.refresh || buildChanged || !classpathIsUsable(classpathFile, pomFile)) {
    const classpath = spawnSync(
      maven,
      ["-q", "-B", ...override, "dependency:build-classpath", `-Dmdep.outputFile=${classpathFile}`],
      { cwd: projectDir, encoding: "utf8", shell },
    );
    if (classpath.status !== 0 || !fs.existsSync(classpathFile)) {
      process.stderr.write("[probe] could not resolve the diagnostics classpath\n");
      process.exit(1);
    }
    stampClasspath(classpathFile, pomFile);
  }

  const full = `${classesDir}${path.delimiter}${fs.readFileSync(classpathFile, "utf8").trim()}`;

  // The jar carries no Implementation-Version, so the version is passed in. A
  // probe's answer is only true of the build that produced it, so the output
  // has to name the build actually on the classpath — not the pom's pin, which
  // is what it named while the two could differ without anyone noticing.
  const java = spawnSync(
    "java",
    [...(measuring ? [`-Dgraphcompose.version=${measuring}`] : []), "-cp", full, MAIN_CLASS, ...probeArgs],
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
