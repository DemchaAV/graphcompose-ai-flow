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
 * not a GraphCompose project, 2 usage. The version codes match
 * resolve-version.mjs so a caller can branch the same way on either.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  describeWorkspaceLine,
  installRoot,
  projectDir as workspaceProjectDir,
  resolveWorkspace,
} from "./lib/workspace.mjs";
import { resolveVersion } from "./lib/version-resolver.mjs";
import {
  loadPipelineConfig,
  resolveScope,
  stagesForScope,
} from "./lib/pipeline-config.mjs";

const repoRoot = installRoot();
const EXIT = { ready: 0, usage: 2, unsupported: 3, unknown: 4 };

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/preflight.mjs [--project-dir <dir>] [--project <id>] [--json]\n\n" +
      "  --project-dir <dir>   the Java project (default: current directory)\n" +
      "  --project <id>        a project in the workspace, when one exists\n" +
      "  --root <workspace>    workspace override\n" +
      "  --json                machine-readable (default)\n" +
      "  --text                a short human summary instead\n",
  );
  process.exit(code);
}

const args = { projectDir: process.cwd(), project: null, root: null, text: false };
for (let i = 0; i < process.argv.length - 2; i += 1) {
  const a = process.argv[i + 2];
  if (a === "--help" || a === "-h") usage(0);
  else if (a === "--json") args.text = false;
  else if (a === "--text") args.text = true;
  else if (a === "--project-dir" || a === "-C") args.projectDir = process.argv[++i + 2];
  else if (a === "--project" || a === "-p") args.project = process.argv[++i + 2];
  else if (a === "--root") args.root = process.argv[++i + 2];
  else {
    process.stderr.write(`[preflight] unknown argument: ${a}\n`);
    usage(2);
  }
}

const workspace = resolveWorkspace({ explicitRoot: args.root ?? null, cwd: args.projectDir });
const version = resolveVersion({ projectDir: args.projectDir, install: repoRoot });

/** The three that ship as source and have to be built before anything runs. */
const BUILT_TOOLS = Object.freeze(["revisionManager", "visualDiff", "previewRenderer"]);

/** The three that have to already be on the machine; no setup step installs them. */
const EXTERNAL_TOOLS = Object.freeze(["imagemagick", "java", "maven"]);

const project = describeProject();
const routing = describeRouting(project);
// Read once: the report publishes it and `nextCommands` branches on it, and a
// second probe would let the two disagree about the same machine.
const tools = describeTools();

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
    availablePacks: version.availablePacks ?? [],
    message: version.status === "supported" ? null : version.message,
  },
  project,
  ...routing,
  skills: describeSkills(version.line, project?.docKind ?? null),
  knowledge: describeKnowledge(version.line),
  tools,
  nextCommands: nextCommands(project, routing, tools),
};

if (args.text) {
  printText(report);
} else {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

process.exit(EXIT[version.status] ?? EXIT.ready);

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

/** What previous runs already established for this line, and what can be asked. */
function describeKnowledge(line) {
  const out = { observations: [], probes: [] };
  if (!line) return out;

  const observationsDir = path.join(repoRoot, "observations", `graphcompose-${line}`);
  if (fs.existsSync(observationsDir)) {
    for (const file of fs.readdirSync(observationsDir).filter((f) => f.endsWith(".json"))) {
      try {
        const body = JSON.parse(fs.readFileSync(path.join(observationsDir, file), "utf8"));
        out.observations.push({
          id: body.id,
          confidence: body.confidence,
          behaviour: body.observedBehaviour?.split(". ")[0],
        });
      } catch {
        /* the observations CLI reports malformed records */
      }
    }
  }

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
  const built = (relative) => fs.existsSync(path.join(repoRoot, relative));
  const tools = {
    revisionManager: built("tools/revision-manager/dist"),
    visualDiff: built("tools/visual-diff/dist"),
    previewRenderer: built("tools/preview-renderer/target/preview-renderer.jar"),
    imagemagick: onPath("magick", ["-version"]),
    java: onPath("java", ["-version"]),
    maven: onPath(process.platform === "win32" ? "mvn.cmd" : "mvn", ["-v"]),
  };

  // The two halves are not interchangeable, and the difference is the whole
  // point of splitting them: `npm run setup` builds what shipped as source and
  // cannot install a JDK. Recommending it for a missing `java` would be wrong
  // advice delivered confidently.
  const unbuilt = BUILT_TOOLS.filter((name) => !tools[name]);
  const absent = EXTERNAL_TOOLS.filter((name) => !tools[name]);

  return {
    ...tools,
    ready: unbuilt.length === 0 && absent.length === 0,
    needsSetup: unbuilt.length > 0,
    unbuilt,
    absent,
    setupCommand: "npm run setup",
  };
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
  if (tools?.needsSetup) {
    commands.push({
      why: `${tools.unbuilt.join(", ")} ship as source and are not built here; without them the first render exits 69`,
      run: tools.setupCommand,
    });
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
    commands.push({
      why: "render the revision this scope is about to work on",
      run: `node scripts/render.mjs ${projectInfo.id} ${routing.routing?.revision ?? "revision-001"}`,
    });
    commands.push({
      why: "ask whether the loop may take another pass",
      run: `node scripts/iterate-status.mjs ${projectInfo.id}`,
    });
  }
  return commands;
}

function printText(r) {
  const lines = [];
  if (r.workspace.banner) lines.push(r.workspace.banner);
  lines.push(`GraphCompose ${r.graphCompose.version ?? "?"} (${r.graphCompose.status}) -> ${r.graphCompose.skillPack ?? "no pack"}`);
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
  if (r.tools.unbuilt.length > 0) {
    lines.push(`Not built: ${r.tools.unbuilt.join(", ")} — run ${r.tools.setupCommand}`);
  }
  if (r.tools.absent.length > 0) {
    lines.push(`Not on PATH: ${r.tools.absent.join(", ")} — no setup step installs these`);
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}
