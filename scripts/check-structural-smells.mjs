#!/usr/bin/env node
/**
 * scripts/check-structural-smells.mjs — is the geometry in the right place?
 *
 *   node scripts/check-structural-smells.mjs --project <id> --revision <id> [--root <ws>] [--json]
 *
 * A template can be pixel-perfect and still be built wrong. Three siblings each
 * carrying `margin(0, 0, 5, 0)` render exactly like one parent carrying
 * `spacing(5)` — the diff between them is zero — but the first is three numbers
 * a later revision has to find and move together, and the fourth item somebody
 * adds will not have the margin. Every gate the loop has is blind to that,
 * because none of them reads the source.
 *
 * This reports where geometry sits on children that belongs on their parent,
 * where a hand-assembled construction stands in for a primitive the pinned pack
 * has, and where one region has accumulated more independent constants than a
 * layout needs.
 *
 * It is evidence, not a build failure: exit 0 whether or not it finds anything,
 * the same contract `check-region-primitives.mjs` has, so a reviewer sees the
 * whole list rather than the first item. `render-and-diff` folds the findings
 * into the loop verdict.
 *
 * The thresholds are calibrated against the corpus rather than assumed — see
 * `scripts/lib/structural-smells.mjs` for what a census of 862 inset calls
 * across 35 templates changed about them.
 *
 * Exit: 0 checked · 2 usage · 3 the inputs are not there
 */

import fs from "node:fs";
import path from "node:path";

import {
  describeWorkspaceLine,
  installRoot,
  projectDir as workspaceProjectDir,
  resolveWorkspace,
} from "./lib/workspace.mjs";
import { checkStructuralSmells } from "./lib/structural-smells.mjs";

const repoRoot = installRoot();

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/check-structural-smells.mjs --project <id> --revision <id> [options]\n\n" +
      "  --project <id>     the project\n" +
      "  --revision <id>    the revision to check\n" +
      "  --root <dir>       workspace override\n" +
      "  --json             machine-readable result\n\n" +
      "exit: 0 checked | 2 usage | 3 inputs missing\n",
  );
  process.exit(code);
}

function parseArgs(argv) {
  const out = { project: null, revision: null, root: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--json") out.json = true;
    else if (a === "--project" || a === "-p") out.project = argv[++i];
    else if (a === "--revision" || a === "-r") out.revision = argv[++i];
    else if (a === "--root") out.root = argv[++i];
    else usage(2);
  }
  return out;
}

function fail(message, code) {
  process.stderr.write(`[check-structural-smells] ${message}\n`);
  process.exit(code);
}

function readJsonOr(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/** The generated template, whatever this revision called it. */
function templateSource(revisionDir) {
  if (!fs.existsSync(revisionDir)) return null;
  const candidates = fs
    .readdirSync(revisionDir)
    .filter((name) => name.endsWith(".java") && !/Test\.java$/i.test(name));
  if (!candidates.length) return null;
  // Longest first: a template and its spec can both be here, and the template
  // is the one carrying the render methods.
  const bySize = candidates
    .map((name) => ({ name, size: fs.statSync(path.join(revisionDir, name)).size }))
    .sort((a, b) => b.size - a.size);
  return {
    file: bySize[0].name,
    source: fs.readFileSync(path.join(revisionDir, bySize[0].name), "utf8"),
  };
}

/**
 * Symbols the project's pinned pack declares.
 *
 * The manual-construction rule is gated on this: before `addTimeline` existed,
 * drawing a rail beside markers was the correct way to build a timeline, and
 * reporting it against a pack that lacks the primitive would be telling an
 * author to call something that is not there. An unreadable pack yields an
 * empty set, which makes that rule silent rather than wrong.
 */
function packSymbols(project) {
  const pack = project?.skillPack
    ? path.join(repoRoot, project.skillPack)
    : newestPack();
  const surface = pack ? path.join(pack, "00-api-surface.md") : null;
  if (!surface || !fs.existsSync(surface)) return { pack: null, symbols: new Set() };
  const source = fs.readFileSync(surface, "utf8");
  return {
    pack: path.relative(repoRoot, pack).split(path.sep).join("/"),
    symbols: new Set([...source.matchAll(/^- `[^`]*?\b(\w+)\s*\(/gm)].map((m) => m[1])),
  };
}

function newestPack() {
  const dir = path.join(repoRoot, "skills", "versions");
  if (!fs.existsSync(dir)) return null;
  const packs = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith("graphcompose-"))
    .map((e) => e.name)
    .sort((a, b) => Number(a.slice(13)) - Number(b.slice(13)));
  return packs.length ? path.join(dir, packs[packs.length - 1]) : null;
}

// --- run ---------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
if (!args.project || !args.revision) usage(2);

const workspace = resolveWorkspace({ explicitRoot: args.root ?? null });
const banner = describeWorkspaceLine(workspace);
if (banner && !args.json) console.log(banner);

const projectDir = workspaceProjectDir(workspace, args.project);
const revisionDir = path.join(projectDir, "revisions", args.revision);

const template = templateSource(revisionDir);
if (!template) {
  fail(
    `no generated template (.java) in ${revisionDir}\n` +
      "  This reads the source, so until one is written there is nothing to check.",
    3,
  );
}

const project = readJsonOr(path.join(projectDir, "template-project.json")) ?? {};
const { pack, symbols } = packSymbols(project);

const findings = checkStructuralSmells({ source: template.source, primitives: symbols });

const result = {
  project: args.project,
  revision: args.revision,
  template: template.file,
  pack,
  findings,
};

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else if (!findings.length) {
  console.log(
    `[check-structural-smells] ${template.file}: no geometry sitting on children that belongs on a parent`,
  );
} else {
  console.log(`[check-structural-smells] ${findings.length} finding(s) in ${template.file}:`);
  for (const f of findings) {
    console.log(`  ${f.kind}  [${f.method}]  ${f.detail}`);
  }
  console.log(
    "\n  Evidence, not a failure. See “Layout ownership” in\n" +
      "  skills/workflows/references/authoring-rules.md for which property owns what.",
  );
}
