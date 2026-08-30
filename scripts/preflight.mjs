#!/usr/bin/env node
/**
 * scripts/preflight.mjs — everything deterministic about "where am I and what
 * am I about to run", in one call.
 *
 *   node scripts/preflight.mjs [--project-dir <dir>] [--project <id>] [--json]
 *
 * The acceptance run opened with a long, chatty sequence: locate the skill,
 * resolve the version, read the loading map, find the workspace, check the CLI
 * surface, validate the skills, grep the API surface. Every one of those has a
 * single right answer that a script can produce, and none of them needed a
 * model.
 *
 * This answers them together. It decides nothing: which files to open, which
 * scope applies, what to build — those stay judgement. What it removes is the
 * ten to twenty shell calls spent establishing facts.
 *
 * Exit codes: 0 ready, 3 the pinned GraphCompose line has no pack (stop), 4
 * not a GraphCompose project, 5 the installed skills are newer than these tools,
 * 2 usage. The version codes match resolve-version.mjs so a caller can branch
 * the same way on either.
 *
 * ## Why 5 exists
 *
 * A run once spent seven hours before noticing that its skills had loaded from
 * an installed pack while its `scripts/` came from an older checkout. Everything
 * the newer skills told it to run — `layout.mjs`, `evidence.mjs`,
 * `typography.mjs` — was simply absent, so the loop measured pixels by hand for
 * the entire session and reached the right answer the expensive way. Nothing was
 * broken enough to fail; that is precisely what made it costly. `capabilities`
 * turns that into one line at the start.
 */

import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";

import { isBuildStale } from "./lib/build-freshness.mjs";
import { installHint } from "./lib/install-hints.mjs";

import {
  describeWorkspaceLine,
  installRoot,
  projectDir as workspaceProjectDir,
  resolveWorkspace,
} from "./lib/workspace.mjs";
import { resolveVersion } from "./lib/version-resolver.mjs";
import {
  buildIdentity,
  readResolvedVersion,
  resolvedVersionPath,
  writeResolvedVersion,
} from "./lib/resolved-version.mjs";
import {
  loadPipelineConfig,
  resolveScope,
  stagesForScope,
} from "./lib/pipeline-config.mjs";
import { planSetup } from "./lib/setup-plan.mjs";

const repoRoot = installRoot();
const EXIT = { ready: 0, usage: 2, unsupported: 3, unknown: 4, mismatch: 5, unidentifiedBuild: 6 };

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/preflight.mjs [--project-dir <dir>] [--project <id>] [--json]\n\n" +
      "  --project-dir <dir>   the Java project (default: current directory)\n" +
      "  --project <id>        a project in the workspace, when one exists\n" +
      "  --root <workspace>    workspace override\n" +
      "  --json                machine-readable (default)\n" +
      "  --text                a short human summary instead\n\n" +
      "exit: 0 ready | 2 usage | 3 no pack for the pinned line | 4 not a GraphCompose project\n" +
      "      5 installed skills are newer than these tools (diagnostics will be missing)\n" +
      "      6 the pin does not name one build (a SNAPSHOT) and nobody has said which it is\n",
  );
  process.exit(code);
}

const args = { projectDir: process.cwd(), project: null, root: null, text: false, noSetup: false };
for (let i = 0; i < process.argv.length - 2; i += 1) {
  const a = process.argv[i + 2];
  if (a === "--help" || a === "-h") usage(0);
  else if (a === "--json") args.text = false;
  else if (a === "--text") args.text = true;
  else if (a === "--no-setup") args.noSetup = true;
  else if (a === "--project-dir" || a === "-C") args.projectDir = process.argv[++i + 2];
  else if (a === "--project" || a === "-p") args.project = process.argv[++i + 2];
  else if (a === "--root") args.root = process.argv[++i + 2];
  else {
    process.stderr.write(`[preflight] unknown argument: ${a}\n`);
    usage(2);
  }
}

const workspace = resolveWorkspace({ explicitRoot: args.root ?? null, cwd: args.projectDir });
const version = resolveVersionWithFallback({ projectDir: args.projectDir, install: repoRoot, workspace });

/**
 * The build file decides the version. When there is none at or above
 * `--project-dir` — a workspace created beside a harness checkout, or a run
 * started from the workspace directory rather than the Java project — the
 * workspace's own `resolved-version.json` still records what an earlier run
 * resolved, from which build file. Reporting `unknown` there sends the reader
 * to look for a pom the workspace already knows about, and hands the skills
 * and knowledge blocks nothing to load.
 *
 * The record is a fallback, never an override: a build file that IS found wins,
 * and the report says which of the two it used.
 */
function resolveVersionWithFallback({ projectDir, install, workspace: ws }) {
  const fromBuildFile = resolveVersion({ projectDir, install });
  if (fromBuildFile.status !== "unknown" || fromBuildFile.buildFile) {
    return { ...fromBuildFile, source: "build-file" };
  }
  const record = readResolvedVersion(ws);
  if (!record?.version) return { ...fromBuildFile, source: "build-file" };

  const fromRecord = resolveVersion({ projectDir, install, version: record.version });
  return {
    ...fromRecord,
    buildFile: record.buildFile ?? null,
    coordinate: fromRecord.coordinate ?? record.coordinate ?? null,
    source: "workspace-record",
    message:
      `no build file at or above ${path.resolve(projectDir)}; the version comes from ` +
      `${resolvedVersionPath(ws)}, which an earlier run resolved from ${record.buildFile ?? "an unrecorded build file"}` +
      (fromRecord.message ? `. ${fromRecord.message}` : ""),
  };
}

/** The three that ship as source and have to be built before anything runs. */
const BUILT_TOOLS = Object.freeze(["revisionManager", "visualDiff", "previewRenderer"]);

/**
 * What rebuilds one Node CLI on its own, for a build that exists and is merely
 * behind its sources. `npm run setup` is still the answer for a tool that was
 * never built — that one may have no node_modules either — but it reinstalls
 * four packages and repackages the Java renderer, which is a heavy price for a
 * `tsc` run. preview-renderer has no entry: its jar is Maven's to rebuild, and
 * `lib/render-runtime.mjs` already does it against its sources at render time.
 */
const REBUILD_COMMAND = Object.freeze({
  revisionManager: "npm run build --prefix tools/revision-manager",
  visualDiff: "npm run build --prefix tools/visual-diff",
});

/** The three that have to already be on the machine; no setup step installs them. */
const EXTERNAL_TOOLS = Object.freeze(["imagemagick", "java", "maven"]);

/**
 * The measurement and evidence half of the loop. A tree can be a perfectly good
 * GraphCompose harness and still carry none of these: they arrived over several
 * releases, and an older install has the workflow skills without the tools the
 * newer skills tell it to run. That gap is invisible at the point it matters —
 * the agent reads "run `layout.mjs explain`", finds no such file, and falls back
 * to measuring pixels by hand for the rest of the run.
 */
const DIAGNOSTIC_SCRIPTS = Object.freeze([
  "layout.mjs",
  "evidence.mjs",
  "typography.mjs",
  "reference.mjs",
  "probe.mjs",
]);

/** The gates. Same reasoning as above, and the same failure when one is absent. */
const CHECK_SCRIPTS = Object.freeze([
  "check-border-topology.mjs",
  "check-document-integrity.mjs",
  "check-knowledge-drift.mjs",
  "check-links.mjs",
  "check-region-primitives.mjs",
  "check-structural-smells.mjs",
]);

/**
 * Where an installed skill pack lands. The skills a session loads come from here,
 * not from the tree whose `scripts/` it then invokes — which is exactly how the
 * two drift apart without anything noticing.
 */
const PLUGIN_CACHE = path.join(
  process.env.CLAUDE_CONFIG_DIR ?? path.join(homedir(), ".claude"),
  "plugins", "cache", "graphcompose", "graphcompose-flow",
);

const project = describeProject();
// Written before anything reads a version from anywhere else: this record is
// what the rest of the run is supposed to consult, and a run that never wrote
// one is a run where three files can still disagree.
const pins = describePins(version, project);
const resolvedRecord = writeResolvedVersion(workspace, { resolved: version, pins });
const build = describeBuild(version, resolvedRecord);
const routing = describeRouting(project);
// Read once: the report publishes it and `nextCommands` branches on it, and a
// second probe would let the two disagree about the same machine.
const tools = runSetupIfNeeded(describeTools());
// After tools: snapshot support depends on whether preview-renderer is built,
// and asking twice would let the two answers disagree about the same machine.
const capabilities = describeCapabilities(version, tools);

const report = {
  workspace: {
    root: workspace.root,
    mode: workspace.mode,
    // The one line that explains a surprising answer, kept in the payload so a
    // JSON consumer sees the same thing a human would.
    banner: describeWorkspaceLine(workspace),
    exists: fs.existsSync(workspace.root),
  },
  graphCompose: {
    status: version.status,
    version: version.version ?? null,
    line: version.line ?? null,
    skillPack: version.skillPack ?? null,
    buildFile: version.buildFile ?? null,
    // "build-file" or "workspace-record" — where the version above came from.
    source: version.source ?? "build-file",
    availablePacks: version.availablePacks ?? [],
    // Which build the pin resolves to, and whether the three places that record
    // a version still agree. Both are cheap facts nobody was asked for: a run
    // pinned 2.2.1-SNAPSHOT, measured the engine against whatever jar carried
    // that name, and wrote the result down as a property of the released line.
    artifact: version.artifact ?? null,
    pins: pins,
    build: build,
    resolvedVersionFile: resolvedRecord ? resolvedVersionPath(workspace) : null,
    message:
      version.status === "supported" && version.source !== "workspace-record" ? null : version.message,
  },
  project,
  ...routing,
  skills: describeSkills(version.line, project?.docKind ?? null),
  knowledge: describeKnowledge(version.line, workspace),
  tools,
  capabilities,
  nextCommands: nextCommands(project, routing, tools),
};

if (args.text) {
  printText(report);
} else {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

// A version problem outranks a parity problem: an unsupported line is a reason to
// stop regardless of which release the skills came from, and reporting the
// narrower fault would send the reader after the wrong thing.
const versionExit = EXIT[version.status] ?? EXIT.ready;
if (versionExit !== EXIT.ready) process.exit(versionExit);
// Outranks the tools-parity code: a missing diagnostic makes the run expensive,
// an unidentified build makes its findings unattributable, and the second is
// the one that survives the run in an observation.
//
// Only where the question can be answered. `--accept-build` records the
// decision in the workspace, so before one exists there is nowhere to put it —
// and this is the documented first command of a new run, which is exactly when
// no workspace exists yet. Stopping there would print a remedy that refuses to
// run. The finding is still reported; what waits is the stop.
if (!build.identified && !build.accepted && build.answerable) {
  process.exit(EXIT.unidentifiedBuild);
}
process.exit(capabilities.parity === "tools-behind" ? EXIT.mismatch : EXIT.ready);

// ------------------------------------------------------------------ version ---

/**
 * Every place that records which GraphCompose version this work is against,
 * and whether they still say the same thing.
 *
 * <p>Three of them exist and nothing compares them: the host build file, the
 * workspace manifest written when the workspace was created, and the project's
 * own `targetGraphComposeVersion`. One run carried `2.2.0` in the manifest and
 * `2.2.1-SNAPSHOT` in the project for ninety minutes; both were readable the
 * whole time, and the disagreement is only visible when they are put in a
 * row.</p>
 *
 * @param {ReturnType<typeof resolveVersion>} resolved
 * @param {{ dir?: string, targetGraphComposeVersion?: string|null }|null} projectMeta
 */
/**
 * Whether the pin names one build, and whether anyone has said that the
 * alternative is deliberate.
 *
 * <p>A SNAPSHOT is the case this exists for. It is a perfectly ordinary thing
 * to develop against — the library's own author does — and a perfectly
 * dishonest thing to measure the engine against without saying so, because the
 * result reads afterwards as a property of the release the name points at. So
 * this does not forbid it; it makes someone write down which build it is.</p>
 *
 * @param {ReturnType<typeof resolveVersion>} resolved
 * @param {object|null} record the resolved-version record just written
 */
function describeBuild(resolved, record) {
  const accepted = record?.accepted ?? null;
  const identity = buildIdentity(resolved, accepted);
  const settled = identity.identified || identity.accepted;
  // Whether the question this would stop for can be answered yet. The decision
  // lives in the workspace, so before one exists `--accept-build` has nowhere
  // to write and refuses — and preflight is the command a run makes *before*
  // init-workspace. A stop whose remedy cannot run is not a gate.
  const answerable = Boolean(record);

  return {
    identified: identity.identified,
    accepted: identity.accepted,
    answerable,
    decision: identity.accepted ? accepted.decision : null,
    reason: identity.reason,
    message: settled
      ? null
      : `${identity.reason}. Nothing measured against it — a probe verdict, an observation, a ` +
        "rendered comparison — can be attributed to a release, and the record outlives the run " +
        "that made it. " +
        (answerable
          ? "Say which build this is and why it is the one to measure against: " +
            'node scripts/resolve-version.mjs --accept-build --decision "..."'
          : "There is no workspace yet to record that in, so this does not stop the run — " +
            "create one with init-workspace, then answer it once: " +
            'node scripts/resolve-version.mjs --accept-build --decision "..."'),
  };
}

function describePins(resolved, projectMeta) {
  const pins = [];
  if (resolved.version) {
    pins.push({ source: "build-file", where: resolved.buildFile, version: resolved.version });
  }
  const manifestVersion = workspace.manifest?.graphComposeVersion ?? null;
  if (manifestVersion) {
    pins.push({ source: "workspace", where: workspace.manifestPath, version: manifestVersion });
  }
  if (projectMeta?.targetGraphComposeVersion) {
    pins.push({
      source: "project",
      where: projectMeta.dir ? path.join(projectMeta.dir, "template-project.json") : null,
      version: projectMeta.targetGraphComposeVersion,
    });
  }

  const distinct = [...new Set(pins.map((pin) => pin.version))];
  return {
    pins,
    agree: distinct.length <= 1,
    distinct,
    message:
      distinct.length <= 1
        ? null
        : `the version is recorded in ${pins.length} places and they disagree: ` +
          `${pins.map((pin) => `${pin.source} ${pin.version}`).join(", ")}. Settle it before ` +
          "anything else — a probe, an observation and a rendered template that were measured " +
          "against different builds cannot be compared with each other.",
  };
}

// ------------------------------------------------------------------ project ---

function describeProject() {
  if (!args.project) return null;
  let dir;
  try {
    dir = workspaceProjectDir(workspace, args.project);
  } catch {
    return { id: args.project, exists: false };
  }
  const metaPath = path.join(dir, "template-project.json");
  if (!fs.existsSync(metaPath)) return { id: args.project, dir, exists: false };

  let meta = {};
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch {
    /* a malformed project file is reported by the tools that own it */
  }

  const revisionsDir = path.join(dir, "revisions");
  const revisions = fs.existsSync(revisionsDir)
    ? fs.readdirSync(revisionsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && /^revision-\d+$/.test(e.name))
        .map((e) => e.name)
        .sort()
    : [];

  return {
    id: args.project,
    dir,
    exists: true,
    docKind: meta.docKind ?? null,
    targetGraphComposeVersion: meta.targetGraphComposeVersion ?? null,
    skillPack: meta.skillPack ?? null,
    approvedRevision: meta.currentApprovedRevisionId ?? null,
    draftRevision: meta.currentDraftRevisionId ?? null,
    revisions,
    latestRevision: revisions.length > 0 ? revisions[revisions.length - 1] : null,
  };
}

// ------------------------------------------------------------------ routing ---

function describeRouting(projectInfo) {
  let config;
  try {
    config = loadPipelineConfig({ repoRoot });
  } catch (cause) {
    return { routing: { error: cause.message } };
  }

  // No project, or a project with no revisions, is a first generation.
  const revisionId = projectInfo?.latestRevision ?? "revision-001";
  let revision = null;
  if (projectInfo?.dir) {
    const file = path.join(projectInfo.dir, "revisions", revisionId, "revision.json");
    if (fs.existsSync(file)) {
      try {
        revision = JSON.parse(fs.readFileSync(file, "utf8"));
      } catch {
        /* ignore */
      }
    }
  }

  const scope = resolveScope({ revision, revisionId });
  const stages = stagesForScope(config, scope) ?? [];
  const workflow = Object.entries(config.workflows ?? {})
    .filter(([id]) => !id.startsWith("$"))
    .find(([, w]) => (w.scopes ?? []).includes(scope));

  return {
    routing: {
      scope,
      gate: config.scopes[scope]?.gate ?? null,
      workflow: workflow ? workflow[0] : null,
      skill: workflow ? workflow[1].skill : null,
      revision: revisionId,
      revisionStatus: revision?.status ?? null,
      stages: stages.map((s) => ({ id: s.id, kind: s.kind, label: s.label, tool: s.tool ?? null })),
      limits: config.limits,
    },
  };
}

// ------------------------------------------------------------------- skills ---

/**
 * The loading map as data. It is a set of tables, so the rows come out
 * exactly; which rows apply is still a judgement and is left as one.
 */
function describeSkills(line, docKind) {
  if (!line) return null;
  const packDir = path.join(repoRoot, "skills", "versions", `graphcompose-${line}`);
  const mapPath = path.join(packDir, "00-loading-map.md");
  if (!fs.existsSync(mapPath)) return { pack: packDir, loadingMap: null };

  const text = fs.readFileSync(mapPath, "utf8");
  return {
    pack: path.relative(repoRoot, packDir).split(path.sep).join("/"),
    loadingMap: path.relative(repoRoot, mapPath).split(path.sep).join("/"),
    always: filesIn(sectionOf(text, "Always")),
    byTask: rowsOf(sectionOf(text, "By what you are doing")),
    byFeature: rowsOf(sectionOf(text, "By what the reference actually contains")),
    startingPoint: startingPointFor(text, docKind),
    note: "Which rows apply is a judgement. Load what the reference actually contains, not what the document kind usually does.",
  };
}

function sectionOf(text, heading) {
  const start = text.indexOf(`## ${heading}`);
  if (start === -1) return "";
  const rest = text.slice(start + heading.length);
  const end = rest.indexOf("\n## ");
  return end === -1 ? rest : rest.slice(0, end);
}

/** Markdown link targets, deduped, in document order. */
function filesIn(section) {
  const files = [];
  for (const [, target] of section.matchAll(/\]\(([^)]+\.md)\)/g)) {
    if (!files.includes(target)) files.push(target);
  }
  return files;
}

/** Two-column table rows as { when, files }. */
function rowsOf(section) {
  const rows = [];
  for (const line of section.split("\n")) {
    const match = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$/);
    if (!match) continue;
    if (/^-+$/.test(match[1].replace(/\s/g, ""))) continue;
    const files = filesIn(match[2]);
    if (files.length === 0) continue;
    rows.push({ when: match[1], files });
  }
  return rows;
}

/**
 * The pack's own worked starting point for a document kind. These are the
 * "four to six files" a task actually needs, already chosen by whoever wrote
 * the pack — which beats re-deriving them from the tables every run.
 */
function startingPointFor(text, docKind) {
  if (!docKind) return null;
  const section = sectionOf(text, "Worked starting points");
  const blocks = section.split(/\n\*\*/).slice(1);
  const wanted = docKind.toLowerCase();
  for (const block of blocks) {
    const title = block.slice(0, block.indexOf("**")).toLowerCase();
    if (!title.includes(wanted)) continue;
    // Only the list itself, which ends at the first blank line. The prose that
    // follows says things like "Not `tables` unless the CV has genuinely
    // tabular content" — reading backticks past the list inverts the advice
    // and adds the one file the pack just told you to leave out.
    const body = block.slice(block.indexOf("**") + 2).replace(/^\n/, "");
    const list = body.split(/\n\s*\n/)[0] ?? "";
    const files = [];
    for (const [, name] of list.matchAll(/`([\w./-]+)`/g)) {
      const file = name.endsWith(".md") ? name : `${name}.md`;
      if (!files.includes(file)) files.push(file);
    }
    return { docKind, title: block.slice(0, block.indexOf("**")), files };
  }
  return null;
}

// ---------------------------------------------------------------- knowledge ---

/**
 * What previous runs already established for this line, and what can be asked.
 *
 * Two stores, read in this order: the install tree's `observations/` (what the
 * release shipped) and the workspace's (what `observations record` writes — the
 * skill says to write there precisely because the install tree is replaced on
 * upgrade). This read only the first, so everything a run learned in this
 * workspace was invisible to the next run's preflight: fourteen records in one
 * real workspace, none surfaced, each re-discoverable at the price of a probe.
 * A record with the same id in both places is the workspace's — it is the
 * newer one.
 */
function describeKnowledge(line, ws) {
  const out = { observations: [], probes: [] };
  if (!line) return out;

  const stores = [
    { dir: path.join(repoRoot, "observations", `graphcompose-${line}`), source: "shipped" },
  ];
  if (ws?.root && ws.mode !== "install") {
    stores.push({ dir: path.join(ws.root, "observations", `graphcompose-${line}`), source: "learned here" });
  }
  const byId = new Map();
  for (const store of stores) {
    if (!fs.existsSync(store.dir)) continue;
    for (const file of fs.readdirSync(store.dir).filter((f) => f.endsWith(".json"))) {
      try {
        const body = JSON.parse(fs.readFileSync(path.join(store.dir, file), "utf8"));
        if (!body?.id) continue;
        byId.set(body.id, {
          id: body.id,
          confidence: body.confidence,
          behaviour: body.observedBehaviour?.split(". ")[0],
          source: store.source,
        });
      } catch {
        /* the observations CLI reports malformed records */
      }
    }
  }
  out.observations = [...byId.values()];

  const diagnostics = path.join(repoRoot, "tools", "diagnostics", `graphcompose-${line}`);
  if (fs.existsSync(diagnostics)) {
    const registry = path.join(
      diagnostics, "src", "main", "java", "com", "demcha", "graphcompose", "diagnostics", "Probes.java",
    );
    if (fs.existsSync(registry)) {
      const text = fs.readFileSync(registry, "utf8");
      const block = text.slice(text.indexOf("REGISTRY"), text.indexOf("private Probes"));
      for (const [, name] of block.matchAll(/"([a-z][a-z-]+)"/g)) {
        if (!out.probes.includes(name)) out.probes.push(name);
      }
    }
  }
  return out;
}

// -------------------------------------------------------------------- tools ---

/**
 * Whether the deterministic half can actually run. Checked here so a workflow
 * finds out now rather than at the first render, twenty minutes in.
 */
function describeTools() {
  // Built *and* current. `existsSync` alone called a dist/ compiled before its
  // src/ ready, and that build is not merely old: the CLI it loads rejects flags
  // it predates and silently skips work it does not know about. Since dist/ is
  // gitignored, reverting local changes never clears it — so it is worth an
  // mtime walk here, where the report can still turn it into one build.
  //
  // The verdict is kept, not just the boolean: "never built" and "built before
  // its sources" are fixed by different commands, and collapsing them charged a
  // one-file `tsc` edit a full `npm ci` of four packages plus a Maven package.
  //
  // preview-renderer's jar has no src/ sibling under target/, so it is unchanged
  // by this: staleness of a Maven artifact is Maven's own to decide, and
  // lib/render-runtime.mjs already decides it against the real sources.
  const verdicts = {};
  const built = (name, relative) => {
    const out = path.join(repoRoot, relative);
    if (!fs.existsSync(out)) {
      verdicts[name] = "missing";
      return false;
    }
    if (isBuildStale(out, path.join(path.dirname(out), "src"))) {
      verdicts[name] = "stale";
      return false;
    }
    verdicts[name] = "current";
    return true;
  };
  const tools = {
    revisionManager: built("revisionManager", "tools/revision-manager/dist"),
    visualDiff: built("visualDiff", "tools/visual-diff/dist"),
    previewRenderer: built("previewRenderer", "tools/preview-renderer/target/preview-renderer.jar"),
    // The same resolution import-reference and typography use: an explicit
    // MAGICK_BINARY first, then the IM7 `magick`, then IM6's `convert`. Probing
    // only `magick` reported the tool absent inside this repository's own
    // devcontainer, which installs IM6 and sets MAGICK_BINARY=convert.
    imagemagick:
      // An explicit MAGICK_BINARY is a path, and the hint this report prints
      // suggests one with spaces in it (Program Files); through a shell that
      // splits on spaces it would never verify. A path is checked as a file.
      (typeof process.env.MAGICK_BINARY === "string" &&
        process.env.MAGICK_BINARY.trim() !== "" &&
        (fs.existsSync(process.env.MAGICK_BINARY) || onPath(process.env.MAGICK_BINARY, ["-version"]))) ||
      ["magick", "convert"].some((name) => onPath(name, ["-version"])),
    java: onPath("java", ["-version"]),
    maven: onPath(process.platform === "win32" ? "mvn.cmd" : "mvn", ["-v"]),
  };

  // The two halves are not interchangeable, and the difference is the whole
  // point of splitting them: `npm run setup` builds what shipped as source and
  // cannot install a JDK. Recommending it for a missing `java` would be wrong
  // advice delivered confidently.
  const unbuilt = BUILT_TOOLS.filter((name) => !tools[name]);
  const absent = EXTERNAL_TOOLS.filter((name) => !tools[name]);

  // "Absent" and "installed but not on PATH" call for different actions, and on
  // Windows the second is the common case: the installer offers PATH as a
  // checkbox. Say where it was found so the fix is one line, not a download.
  const hints = {};
  if (!tools.imagemagick) {
    const installed = imageMagickInstallDirs();
    if (installed.length > 0) {
      hints.imagemagick =
        `ImageMagick is installed at ${installed[0]} but not on PATH. Add that directory to PATH, ` +
        `or set MAGICK_BINARY=${path.join(installed[0], process.platform === "win32" ? "magick.exe" : "magick")}`;
    }
  }

  // Which of the unbuilt are merely behind, and the one command each needs.
  // `rebuildCommands` is only offered when it covers the whole problem: half a
  // fix recommended as the fix is worse than the expensive one that works.
  const stale = unbuilt.filter((name) => verdicts[name] === "stale");
  const rebuildable = stale.length === unbuilt.length && stale.every((name) => REBUILD_COMMAND[name]);

  return {
    ...tools,
    ready: unbuilt.length === 0 && absent.length === 0,
    needsSetup: unbuilt.length > 0,
    unbuilt,
    stale,
    ...(rebuildable && stale.length > 0 ? { rebuildCommands: stale.map((name) => REBUILD_COMMAND[name]) } : {}),
    absent,
    ...(Object.keys(hints).length > 0 ? { hints } : {}),
    setupCommand: "npm run setup",
  };
}

/** Where an ImageMagick that is not on PATH usually is. Newest version first. */
function imageMagickInstallDirs() {
  const roots =
    process.platform === "win32"
      ? [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs")]
      : ["/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin"];
  const found = [];
  for (const root of roots.filter(Boolean)) {
    try {
      if (process.platform === "win32") {
        for (const entry of fs.readdirSync(root)) {
          if (/^ImageMagick/i.test(entry) && fs.existsSync(path.join(root, entry, "magick.exe"))) {
            found.push(path.join(root, entry));
          }
        }
      } else if (fs.existsSync(path.join(root, "magick"))) {
        found.push(root);
      }
    } catch {
      /* a root that cannot be read is not an install */
    }
  }
  return found.sort().reverse();
}

/**
 * Build what ships as source, when that is what is in the way.
 *
 * The report used to say `npm run setup` and stop there. It was right, and it
 * was still a step someone had to take between reading the report and doing the
 * work — which is the kind of step this whole command exists to remove. So it
 * runs it, once, and re-reads the tools afterwards so the rest of the report
 * describes the tree as it now is rather than as it was found.
 *
 * The build's own output goes to stderr, never stdout: this command's stdout is
 * JSON that a caller parses, and a Maven log in the middle of it is a parse
 * error rather than a build log.
 *
 * ## The cheap pass first
 *
 * A CLI that exists and is merely behind its sources needs `tsc`, not the whole
 * toolchain. Sending it to `setup` — which does `npm ci` for four packages and
 * `mvn package` for the renderer — charged every preflight tens of seconds for
 * one edited `.ts`, and preflight is the command the docs say to start with. So
 * the targeted rebuilds run first; whatever they do not fix falls through to
 * `planSetup` exactly as before, and a rebuild that fails changes nothing but
 * the log, because the tools are re-read afterwards either way.
 */
function runSetupIfNeeded(tools) {
  // The version verdict decides the run: an unsupported line exits 3 and a
  // directory that is not a GraphCompose project exits 4, both a few lines
  // below. Building first spent a full `npm ci` and a Maven package to answer a
  // question the caller never gets to ask — a typo in `--project-dir` cost
  // minutes and then said "not a GraphCompose project".
  const willStop =
    version.status === "unsupported"
      ? `GraphCompose ${version.version ?? "?"} has no skill pack`
      : version.status === "unknown"
        ? "this is not a GraphCompose project"
        : null;

  let current = tools;
  let rebuilt = [];
  if (!args.noSetup && !willStop && tools.stale.length > 0) {
    rebuilt = rebuildStaleTools(tools.stale);
    // Re-read rather than patch: the rebuild is what makes the rest of the
    // report describe the tree as it now is. What was rebuilt is reported under
    // `setup`, beside whether setup itself ran, not repeated at the top level.
    if (rebuilt.length > 0) current = describeTools();
  }

  const plan = planSetup(current, { optedOut: args.noSetup, runWillStop: willStop });
  if (!plan.run) {
    // `ran` stays false: it means scripts/setup.mjs ran, and nextCommands reads
    // it before `blockedBy` to choose its wording. A targeted rebuild is
    // reported in its own field so neither message has to lie about the other.
    return {
      ...current,
      setup: {
        ran: false,
        ok: null,
        reason: plan.reason,
        blockedBy: plan.blockedBy,
        ...(rebuilt.length > 0 ? { rebuilt } : {}),
      },
    };
  }

  const startedAt = process.hrtime.bigint();
  if (args.text) process.stderr.write(`[preflight] building ${current.unbuilt.join(", ")} — this happens once\n`);

  const built = spawnSync(process.execPath, [path.join(repoRoot, "scripts", "setup.mjs")], {
    cwd: repoRoot,
    // stdin closed, and both of the child's streams onto ours — which for stdout
    // means fd 2, so a build log never lands in the JSON.
    stdio: ["ignore", 2, 2],
  });
  const seconds = Math.round(Number(process.hrtime.bigint() - startedAt) / 1e8) / 10;

  const after = describeTools();
  const stillUnbuilt = after.unbuilt;
  return {
    ...after,
    setup: {
      ran: true,
      ok: built.status === 0 && stillUnbuilt.length === 0,
      reason: plan.reason,
      blockedBy: [],
      seconds,
      // What the build actually changed, rather than what it was asked to do.
      // A setup that exits 0 and leaves a tool unbuilt is the failure worth
      // naming, and its exit code alone would not name it.
      built: current.unbuilt.filter((name) => !stillUnbuilt.includes(name)),
      stillUnbuilt,
      ...(rebuilt.length > 0 ? { rebuilt } : {}),
    },
  };
}

/**
 * `tsc` for each Node CLI that exists but is behind its sources. Returns the
 * ones that now build clean, so the caller can re-read the tools and let the
 * expensive path handle whatever is left.
 *
 * A failure here is not reported as an error: the fallback is `setup`, which
 * does everything this does and more, and telling someone a build failed twice
 * is worse than telling them once with the log that matters.
 *
 * @param {string[]} stale  tool names, as in BUILT_TOOLS
 * @returns {string[]}      the ones whose rebuild exited 0
 */
function rebuildStaleTools(stale) {
  const rebuilt = [];
  for (const name of stale) {
    const command = REBUILD_COMMAND[name];
    if (!command) continue;
    if (args.text) process.stderr.write(`[preflight] ${name} is behind its sources — ${command}\n`);
    // Single command string + shell:true: `npm` on Windows is a shim, and the
    // args+shell form trips Node's DEP0190. Nothing here comes from user input.
    const done = spawnSync(command, {
      cwd: repoRoot,
      shell: true,
      // Same rule as setup: a build log never lands on stdout, which is JSON.
      stdio: ["ignore", 2, 2],
    });
    if (done.status === 0) rebuilt.push(name);
  }
  return rebuilt;
}

// ------------------------------------------------------------- capabilities ---

/**
 * Which half of the loop this install can actually perform, and whether the
 * skills driving it came from the same release as the tools they name.
 *
 * ## Why the parity check is one-sided
 *
 * Skills load from the plugin cache; `scripts/` runs from whichever tree the
 * command line points at. Nothing forces those to be the same release, and the
 * two directions are not symmetrical:
 *
 * - **tools behind the pack** is the dangerous one. The skill says "run
 *   `layout.mjs explain`" because its release shipped that file; the tree does
 *   not have it. Every diagnostic route silently degrades to hand measurement,
 *   and the run only finds out by not finding out. This fails.
 * - **tools ahead of the pack** is the ordinary development case — working in a
 *   checkout newer than anything installed. Informational.
 *
 * A missing cache is not a mismatch either: plenty of runs have no plugin
 * installed at all. Unknown is reported as unknown, never as a failure.
 *
 * @returns {object} versions, parity verdict, and per-file presence
 */
function describeCapabilities(versionInfo, toolsInfo) {
  const has = (relative) => fs.existsSync(path.join(repoRoot, "scripts", relative));
  const diagnostics = Object.fromEntries(DIAGNOSTIC_SCRIPTS.map((f) => [f, has(f)]));
  const checks = Object.fromEntries(CHECK_SCRIPTS.map((f) => [f, has(f)]));
  const missing = [
    ...DIAGNOSTIC_SCRIPTS.filter((f) => !diagnostics[f]),
    ...CHECK_SCRIPTS.filter((f) => !checks[f]),
  ];

  const treeVersion = readVersion(path.join(repoRoot, "package.json"));
  const packVersion = readVersion(path.join(repoRoot, ".claude-plugin", "plugin.json"));
  const installedPacks = listInstalledPacks();
  const newestPack = installedPacks.length > 0 ? installedPacks[installedPacks.length - 1] : null;

  let parity = "unknown";
  if (newestPack && treeVersion) {
    const delta = compareSemver(treeVersion, newestPack);
    if (delta === 0) parity = "matched";
    else if (delta < 0) parity = "tools-behind";
    else parity = "tools-ahead";
  } else if (treeVersion && installedPacks.length === 0) {
    // No pack installed: the skills came from this tree, so they cannot disagree
    // with it. That is a matched pair by construction, not a missing answer.
    parity = "matched";
  }

  return {
    treeVersion,
    packVersion,
    // The newest few, not all of them. A long-lived machine accumulates dozens of
    // cached packs and the whole list answers nothing the newest does not — this
    // report is read into a context window, and its size is part of its cost.
    installedPacks: installedPacks.slice(-5),
    installedPackCount: installedPacks.length,
    newestInstalledPack: newestPack,
    parity,
    // Only the failing direction carries advice; the rest is reported flat.
    parityMessage:
      parity === "tools-behind"
        ? `skills install at ${newestPack} but these tools are ${treeVersion} — ` +
          `the newer skills name files this tree does not have` +
          (missing.length > 0 ? `: ${missing.join(", ")}` : "")
        : null,
    diagnostics,
    checks,
    missing,
    layoutSnapshot: describeSnapshotSupport(versionInfo, toolsInfo),
  };
}

/**
 * Whether a render here will write `layout-snapshot.json`, which is what every
 * `layout.mjs` subcommand reads.
 *
 * Three states, because two would lie. The renderer resolves
 * `DocumentSession.layoutSnapshot()` reflectively and writes
 * `layoutSnapshot=skipped (...)` when it is absent, so the honest answer before
 * a render has happened is a prediction, not a fact — and it is wrong to report
 * "unavailable" when the truth is "nothing has been rendered yet".
 */
function describeSnapshotSupport(versionInfo, toolsInfo) {
  const writer = path.join(
    repoRoot, "tools", "preview-renderer", "src", "main", "java",
    "com", "demcha", "graphcompose", "preview", "LayoutSnapshotWriter.java",
  );
  if (!fs.existsSync(writer)) {
    return { state: "unavailable", why: "this preview-renderer has no LayoutSnapshotWriter" };
  }
  if (!toolsInfo?.previewRenderer) {
    return { state: "unknown", why: "preview-renderer is not built yet; run npm run setup" };
  }
  if (versionInfo?.status !== "supported") {
    return { state: "unknown", why: `GraphCompose version is ${versionInfo?.status ?? "unresolved"}` };
  }
  // Verified by javap across the 2.2 line: 2.2.1-SNAPSHOT, 2.2.1 and 2.2.2 all
  // expose the no-arg layoutSnapshot(). 2.2.2 adds the options overload that
  // carries the typography envelope; the plain snapshot does not need it.
  return {
    state: "available",
    why: `GraphCompose ${versionInfo.version} exposes layoutSnapshot()`,
    typographyEnvelope: compareSemver(versionInfo.version ?? "0.0.0", "2.2.2") >= 0 ? "available" : "unknown",
  };
}

/** Cache directory names are versions. Sorted oldest to newest; unreadable is empty. */
function listInstalledPacks() {
  try {
    return fs
      .readdirSync(PLUGIN_CACHE, { withFileTypes: true })
      .filter((e) => e.isDirectory() && /^\d+\.\d+\.\d+/.test(e.name))
      .map((e) => e.name)
      .sort(compareSemver);
  } catch {
    return [];
  }
}

function readVersion(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")).version ?? null;
  } catch {
    return null;
  }
}

/**
 * Compare two versions on the numeric triple alone.
 *
 * A prerelease suffix is deliberately ignored: `0.13.0` and `0.13.0-rc.1` are the
 * same release for the purpose of "do the skills and the tools agree", and
 * treating the rc as older would fail a pair that is in fact matched.
 */
function compareSemver(a, b) {
  const parse = (v) => String(v).split("-")[0].split(".").map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i += 1) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0) ? -1 : 1;
  }
  return 0;
}

function onPath(command, probeArgs) {
  try {
    const run = spawnSync(command, probeArgs, {
      encoding: "utf8",
      shell: process.platform === "win32",
      timeout: 15_000,
    });
    return run.status === 0;
  } catch {
    return false;
  }
}

// ----------------------------------------------------------------- next up ---

function nextCommands(projectInfo, routing, tools) {
  const commands = [];

  // Before anything else. A fresh install carries no `dist/` and no jar, so the
  // sequence that used to be recommended — create a workspace, then render —
  // succeeds at the first step and exits 69 at the second, which is exactly the
  // twenty-minutes-in discovery this report exists to prevent. Nothing pointed
  // at the fix: `setupCommand` was a constant that appeared whether or not it
  // was needed, and this list never read the tools at all.
  // Only when building them here did not, or could not, happen. A tree that was
  // just built reports nothing; one where the build failed says so, because
  // being told to run a command that has already failed is worse than silence.
  if (tools?.needsSetup) {
    // One `tsc` when that is the whole story, `setup` otherwise. Recommending
    // the toolchain reinstall for a CLI that only needs recompiling is advice
    // that costs tens of seconds and teaches the wrong habit; `rebuildCommands`
    // is present only when it covers every unbuilt tool.
    if (tools.rebuildCommands?.length > 0) {
      const one = tools.stale.length === 1;
      for (const run of tools.rebuildCommands) {
        commands.push({
          why:
            `${tools.stale.join(", ")} ${one ? "was" : "were"} compiled before ${one ? "its" : "their"} src/; ` +
            "a build that is behind would run anyway with the previous release's behaviour, so the tools refuse it and the first render exits 69",
          run,
        });
      }
    } else {
      commands.push({
        why: tools.setup?.ran
          ? `setup ran here and ${tools.unbuilt.join(", ")} are still not built; the error is above, and without them the first render exits 69`
          : tools.setup?.blockedBy?.length
            ? `${tools.setup.reason}; without ${tools.unbuilt.join(", ")} the first render exits 69`
            : `${tools.unbuilt.join(", ")} ${tools.unbuilt.length === 1 ? "ships as source and is" : "ship as source and are"} not built here — missing, or compiled before ${tools.unbuilt.length === 1 ? "its" : "their"} src/; either way the first render exits 69`,
        run: tools.setupCommand,
      });
    }
  }

  if (workspace.mode === "install") {
    commands.push({
      why: "no workspace here yet; without one the work lands in the harness install",
      run: `node scripts/init-workspace.mjs --project-dir ${args.projectDir} --project <id>`,
    });
  } else if (!projectInfo?.exists) {
    commands.push({
      why: "create the project inside the workspace",
      run: `node scripts/init-workspace.mjs --project-dir ${args.projectDir} --project <id>`,
    });
  }
  if (projectInfo?.exists) {
    // One loop pass, not a bare render. `render.mjs` alone leaves no comparison
    // beside the render, and iterate-status then names the focus
    // `unmeasured-render` — this list used to recommend exactly that pair.
    commands.push({
      why: "one loop pass: render, diff against the reference, measure the regions, classify the worst, run the gates",
      run: `node scripts/render-and-diff.mjs --project ${projectInfo.id} --revision ${routing.routing?.revision ?? "revision-001"}`,
    });
    commands.push({
      why: "after visual-review.json is written: ask whether the loop may take another pass",
      run: `node scripts/iterate-status.mjs ${projectInfo.id}`,
    });
  }
  return commands;
}

function printText(r) {
  const lines = [];
  if (r.workspace.banner) lines.push(r.workspace.banner);
  lines.push(`GraphCompose ${r.graphCompose.version ?? "?"} (${r.graphCompose.status}) -> ${r.graphCompose.skillPack ?? "no pack"}`);
  // Said second, before anything that would be measured against this build: a
  // pin that does not name one build makes every later number unattributable.
  if (r.graphCompose.build?.message) {
    lines.push(`Build not identified: ${r.graphCompose.build.message}`);
  } else if (r.graphCompose.build?.accepted) {
    lines.push(`Build accepted: ${r.graphCompose.build.decision}`);
  } else if (r.graphCompose.artifact?.message) {
    lines.push(`Build: ${r.graphCompose.artifact.message}`);
  }
  if (r.graphCompose.pins?.message) {
    lines.push(`Version disagreement: ${r.graphCompose.pins.message}`);
  }
  if (r.routing?.scope) {
    lines.push(`Workflow: ${r.routing.workflow ?? "?"} · scope ${r.routing.scope} · ${r.routing.revision}`);
    // Labels, not ids: the id is the addressable key and stays in the JSON.
    lines.push(`Stages: ${r.routing.stages.map((s) => s.label).join(" -> ")}`);
  }
  if (r.skills?.startingPoint) {
    lines.push(`Starting point (${r.skills.startingPoint.docKind}): ${r.skills.startingPoint.files.join(", ")}`);
  } else if (r.skills?.always) {
    lines.push(`Always load: ${r.skills.always.join(", ")}`);
  }
  if (r.knowledge.observations.length > 0) {
    lines.push(`Known behaviours: ${r.knowledge.observations.map((o) => o.id).join(", ")}`);
  }
  // The explicit lists, not every false-valued key: `ready` and `needsSetup`
  // are booleans as well, and a bare filter reported them as missing tools.
  if (r.tools.setup?.ran && r.tools.setup.ok) {
    lines.push(`Built: ${r.tools.setup.built.join(", ")} (${r.tools.setup.seconds}s)`);
  }
  if (r.tools.unbuilt.length > 0) {
    lines.push(
      r.tools.setup?.ran
        ? `Still not built after setup: ${r.tools.unbuilt.join(", ")} — run ${r.tools.setupCommand} and read the error`
        : `Not built: ${r.tools.unbuilt.join(", ")} — ${r.tools.setup?.blockedBy?.length ? r.tools.setup.reason : `run ${r.tools.setupCommand}`}`,
    );
  }
  if (r.tools.absent.length > 0) {
    lines.push(`Not on PATH: ${r.tools.absent.join(", ")} — no setup step installs these`);
    // The line already says the reader is on their own; this is where the
    // command belongs, rather than in a page they have to go and find.
    for (const name of r.tools.absent) {
      const command = installHint(name);
      if (command) lines.push(`  ${name}: ${command}`);
    }
  }
  // The gap this exists to make loud. Said before the next-commands list, because
  // a missing diagnostic changes which of those commands is worth running.
  if (r.capabilities.parityMessage) {
    lines.push(`Version mismatch: ${r.capabilities.parityMessage}`);
  } else if (r.capabilities.missing.length > 0) {
    lines.push(`Not in this tree: ${r.capabilities.missing.join(", ")}`);
  }
  lines.push(`Layout snapshot: ${r.capabilities.layoutSnapshot.state} — ${r.capabilities.layoutSnapshot.why}`);
  process.stdout.write(`${lines.join("\n")}\n`);
}
