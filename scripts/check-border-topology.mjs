#!/usr/bin/env node
/**
 * scripts/check-border-topology.mjs — do the render and the reference draw the
 * same rules?
 *
 *   node scripts/check-border-topology.mjs --project <id> --revision <id> [--region <id>]
 *
 * A pixel diff cannot answer this. A divider is a hairline: losing one scores a
 * few hundred grey pixels among hundreds of thousands, which reads as noise, and
 * drawing one the reference deliberately omits scores the same and reads as
 * noise too. Yet the two are opposite defects with opposite fixes.
 *
 * The distinction this exists for: **a missing internal border is often
 * intentional.** A reference that groups two adjacent rows draws no line between
 * them. Counting rows would call that a match and a drawn divider an
 * improvement; comparing topology calls the drawn divider what it is — the thing
 * that breaks the grouping.
 *
 * So it reports the asymmetry rather than a score:
 *
 *   rule-missing-from-render   the reference has it, the render lost it
 *   rule-only-in-render        the render drew it, the reference groups there
 *
 * Neither is a verdict. This is evidence for the review, which is where the
 * judgement belongs: a reference's own hairline may be below the raster's
 * threshold, and a render may legitimately rule a block the reference shades.
 *
 * Exit: 0 always when it could compare (findings are data, not a gate) ·
 *       2 usage · 3 nothing to compare
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { compareRules, describe, extractRules } from "./lib/border-topology.mjs";
import {
  describeWorkspaceLine,
  installRoot,
  projectDir as workspaceProjectDir,
  resolveWorkspace,
} from "./lib/workspace.mjs";

const repoRoot = installRoot();
const require = createRequire(path.join(repoRoot, "tools", "visual-diff", "package.json"));

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/check-border-topology.mjs --project <id> --revision <id> [options]\n\n" +
      "  --project <id>     the project\n" +
      "  --revision <id>    the revision to compare\n" +
      "  --region <id>      scope the scan to one region's bounds from visual-analysis.json\n" +
      "                     (default: the whole page)\n" +
      "  --root <dir>       workspace override\n" +
      "  --json             machine-readable result\n\n" +
      "exit: 0 compared | 2 usage | 3 nothing to compare\n",
  );
  process.exit(code);
}

function parseArgs(argv) {
  const out = { project: null, revision: null, region: null, root: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--json") out.json = true;
    else if (a === "--project" || a === "-p") out.project = argv[++i];
    else if (a === "--revision" || a === "-r") out.revision = argv[++i];
    else if (a === "--region") out.region = argv[++i];
    else if (a === "--root") out.root = argv[++i];
    else usage(2);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.project || !args.revision) usage(2);

const workspace = resolveWorkspace({ explicitRoot: args.root ?? null });
const banner = describeWorkspaceLine(workspace);
if (banner && !args.json) console.log(banner);

const projectDir = workspaceProjectDir(workspace, args.project);
const revisionDir = path.join(projectDir, "revisions", args.revision);

const renderPath = path.join(revisionDir, "output.png");
// The scaled reference, not the original: it was resampled to this render's
// dimensions by the diff step, so positions are already on one grid.
const referencePath = path.join(revisionDir, "reference-scaled.png");

if (!fs.existsSync(renderPath) || !fs.existsSync(referencePath)) {
  const missing = !fs.existsSync(renderPath) ? "output.png" : "reference-scaled.png";
  process.stderr.write(
    `[border-topology] no ${missing} in ${args.revision} — run render-and-diff first\n`,
  );
  process.exit(3);
}

const { PNG } = require("pngjs");
const render = PNG.sync.read(fs.readFileSync(renderPath));
const reference = PNG.sync.read(fs.readFileSync(referencePath));

let bounds = null;
let regionLabel = "the whole page";
if (args.region) {
  const analysisPath = path.join(revisionDir, "visual-analysis.json");
  if (!fs.existsSync(analysisPath)) {
    process.stderr.write(`[border-topology] --region needs visual-analysis.json, which is not there\n`);
    process.exit(3);
  }
  const analysis = JSON.parse(fs.readFileSync(analysisPath, "utf8"));
  const region = (analysis.regions ?? []).find((r) => r.id === args.region);
  if (!region?.bounds) {
    process.stderr.write(
      `[border-topology] region "${args.region}" has no bounds in visual-analysis.json; ` +
        `a region without bounds cannot be scanned\n`,
    );
    process.exit(3);
  }
  bounds = region.bounds;
  regionLabel = `${region.id} (${region.label})`;
}

const renderRules = extractRules(render, bounds);
const referenceRules = extractRules(reference, bounds);

const horizontal = compareRules(referenceRules.horizontal, renderRules.horizontal);
const vertical = compareRules(referenceRules.vertical, renderRules.vertical);
const findings = [...describe("horizontal", horizontal), ...describe("vertical", vertical)];

const result = {
  project: args.project,
  revision: args.revision,
  region: regionLabel,
  reference: {
    horizontal: referenceRules.horizontal.length,
    vertical: referenceRules.vertical.length,
  },
  render: {
    horizontal: renderRules.horizontal.length,
    vertical: renderRules.vertical.length,
  },
  matched: { horizontal: horizontal.matched.length, vertical: vertical.matched.length },
  findings,
};

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  console.log(
    `  border topology in ${regionLabel}: reference ${result.reference.horizontal}h/${result.reference.vertical}v, ` +
      `render ${result.render.horizontal}h/${result.render.vertical}v, ` +
      `${result.matched.horizontal + result.matched.vertical} matched`,
  );
  for (const finding of findings) console.log(`  ${finding.kind}: ${finding.detail}`);
  if (!findings.length) console.log("  the two draw the same rules in the same places");
  console.log("");
}
