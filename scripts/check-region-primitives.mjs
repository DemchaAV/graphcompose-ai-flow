#!/usr/bin/env node
/**
 * scripts/check-region-primitives.mjs — is each region built the way its role says?
 *
 *   node scripts/check-region-primitives.mjs --project <id> --revision <id> [--root <ws>] [--json]
 *
 * A footer drawn as body content appears on page one and nowhere else. A footer
 * drawn with `bleedToEdge` floods the page, because bleeding extends a fill past
 * the margin to the paper edge — the opposite of the band a footer occupies. A
 * table drawn as rows of shapes has no columns to align, no header to repeat and
 * no way to break across a page. A disc standing in for an icon is the right
 * colour in the right place and empty.
 *
 * Every one of those is invisible to a pixel diff on page one of a sample
 * document, and every one of them is decided before a line of Java is written.
 * The analysis already records what each region is; the plan already maps each
 * region to one render method. This reads both and the template, and reports
 * where the three disagree.
 *
 * Once the reference has more than one page it checks the page model too: was
 * first-page-different decided or did it happen, are the breaks the layout needs
 * declared, and does anything say what must not split across a page. None of
 * those is discoverable from a render of the one-page sample.
 *
 * It is evidence, not a build failure: exit 0 whether or not it finds anything,
 * so a reviewer sees the whole list. `render-and-diff` folds the findings into
 * the loop verdict.
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
import { checkRegionPrimitives } from "./lib/region-primitives.mjs";
import { checkPaginationPlan } from "./lib/pagination-plan.mjs";

const repoRoot = installRoot();

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/check-region-primitives.mjs --project <id> --revision <id> [options]\n\n" +
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
  process.stderr.write(`[check-region-primitives] ${message}\n`);
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
    source: candidates
      .map((name) => fs.readFileSync(path.join(revisionDir, name), "utf8"))
      .join("\n"),
  };
}

// --- run ---------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
if (!args.project || !args.revision) usage(2);

const workspace = resolveWorkspace({ explicitRoot: args.root ?? null });
const banner = describeWorkspaceLine(workspace);
if (banner && !args.json) console.log(banner);

const projectDir = workspaceProjectDir(workspace, args.project);
const revisionDir = path.join(projectDir, "revisions", args.revision);

const analysis = readJsonOr(path.join(revisionDir, "visual-analysis.json"));
if (!analysis) {
  fail(
    `no readable visual-analysis.json in ${revisionDir}\n` +
      "  The roles it records are what this check is about; without them nothing is decided.",
    3,
  );
}

const plan = readJsonOr(path.join(revisionDir, "architecture-plan.json"));
if (!plan) {
  fail(
    `no readable architecture-plan.json in ${revisionDir}\n` +
      "  It maps each region to the render method that owns it, which is the link this check follows.",
    3,
  );
}

const template = templateSource(revisionDir);
if (!template) {
  fail(`no generated template (.java) in ${revisionDir}`, 3);
}

const componentMapping = plan.componentMapping ?? [];

// How many pages the document being rebuilt has. The manifest records what the
// import produced; the reference folder is what is actually there. Take the
// larger: a project whose manifest predates a multi-page import would otherwise
// have its page model go unasked.
const project = readJsonOr(path.join(projectDir, "template-project.json")) ?? {};
const referencePages = Math.max(
  Number(project.referencePages) || 1,
  Number(project.render?.pages) || 1,
);

const findings = [
  ...checkRegionPrimitives({
    regions: analysis.regions ?? [],
    componentMapping,
    source: template.source,
  }),
  ...checkPaginationPlan({
    plan,
    referencePages,
    source: template.source,
    componentMapping,
  }),
];

const result = {
  project: args.project,
  revision: args.revision,
  template: template.file,
  regions: (analysis.regions ?? []).length,
  mapped: componentMapping.length,
  referencePages,
  findings,
};

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else if (!findings.length) {
  console.log(
    `[check-region-primitives] ${result.regions} region(s): each is built the way its role says`,
  );
} else {
  console.log(`[check-region-primitives] ${findings.length} finding(s):`);
  // A pagination finding is about the document, not about one region.
  for (const f of findings) {
    console.log(`  ${f.kind}${f.region ? `  [${f.region}]` : ""}  ${f.detail}`);
  }
}
