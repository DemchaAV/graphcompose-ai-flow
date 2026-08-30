#!/usr/bin/env node
/**
 * scripts/evidence.mjs — the bounded package for one mismatch.
 *
 *   node scripts/evidence.mjs --project <id> --revision <id> --region <region-id>
 *   node scripts/evidence.mjs --project <id> --revision <id> --mismatch <mismatch-id>
 *   node scripts/evidence.mjs --project <id> --revision <id> --all
 *
 * A review pass currently decides what kind of defect it is looking at by
 * staring at a picture. That is the wrong instrument for half the question: a
 * block in the wrong place and a block in the wrong colour look equally
 * different, and the fixes have nothing in common. One is a layout property on
 * a named owner; the other is a file or a font, and **compensating a wrong
 * asset with margins moves the wrong picture into place**.
 *
 * Three files in the revision already hold the answer and nothing joined them:
 * the regions read off the reference, the measured per-region pixel difference,
 * and the engine's own record of where every node ended up. This joins them for
 * one region and prints what fits on a screen.
 *
 * It classifies only what two measurements can settle — pagination, geometry,
 * and a correctly-placed image whose pixels are wrong. Everything else comes
 * back `UNKNOWN` with the candidates named, because separating a font from a
 * colour from different text needs the typography snapshot that does not exist
 * yet, and a tool that guessed between them would be the pixel-staring it
 * replaces. No model is called here.
 *
 * Exit: 0 built · 1 the revision's inputs are unreadable · 2 usage
 *       3 no such region or mismatch
 */

import fs from "node:fs";
import path from "node:path";

import { createRequire } from "node:module";

import { describeWorkspaceLine, installRoot, projectDir, resolveWorkspace } from "./lib/workspace.mjs";
import { loadSnapshot } from "./lib/layout-inspector.mjs";
import { buildEvidencePackage, summarise } from "./lib/evidence-package.mjs";
import { measureRegion } from "./lib/region-measure.mjs";

// The same pngjs visual-diff uses; the harness root carries no node_modules of its own.
const require = createRequire(path.join(installRoot(), "tools", "visual-diff", "package.json"));

/** The scaled reference and the render, decoded, when a measured pass left both. */
function loadRasters(revisionDir) {
  const referenceFile = path.join(revisionDir, "reference-scaled.png");
  const renderFile = path.join(revisionDir, "output.png");
  if (!fs.existsSync(referenceFile) || !fs.existsSync(renderFile)) return null;
  try {
    const { PNG } = require("pngjs");
    const reference = PNG.sync.read(fs.readFileSync(referenceFile));
    const render = PNG.sync.read(fs.readFileSync(renderFile));
    return { reference, render };
  } catch (err) {
    process.stderr.write(`[evidence] rasters not readable, measuring from the snapshot alone: ${err.message}\n`);
    return null;
  }
}

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/evidence.mjs --project <id> --revision <id> (--region <id> | --mismatch <id> | --all)\n\n" +
      "  --region <id>      build the package for this region of visual-analysis.json\n" +
      "  --mismatch <id>    build it for the region this mismatch names\n" +
      "  --all              one package per mismatch in visual-review.json\n" +
      "  --worst <n>        the n regions carrying the most measured difference, no review\n" +
      "  --regions <a,b,c>  these regions, in this order (what render-and-diff ranks by mass)\n" +
      "                     needed — this is what a loop pass can ask before one exists\n" +
      "  --out <file>       also write the JSON there\n" +
      "  --root <dir>       workspace override (default: discovered)\n" +
      "  --json             machine-readable output\n\n" +
      "exit: 0 built | 1 unreadable inputs | 2 usage | 3 no such region or mismatch\n",
  );
  process.exit(code);
}

function fail(code, message) {
  process.stderr.write(`[evidence] ${message}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const out = {
    project: null,
    revision: null,
    region: null,
    mismatch: null,
    all: false,
    worst: 0,
    regions: [],
    out: null,
    root: null,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--json") out.json = true;
    else if (a === "--all") out.all = true;
    else if (a === "--project" || a === "-p") out.project = argv[++i];
    else if (a === "--revision" || a === "-r") out.revision = argv[++i];
    else if (a === "--region") out.region = argv[++i];
    else if (a === "--mismatch") out.mismatch = argv[++i];
    else if (a === "--worst") out.worst = Number.parseInt(argv[++i], 10) || 0;
    else if (a === "--regions") out.regions = String(argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--root") out.root = argv[++i];
    else {
      process.stderr.write(`[evidence] unknown argument: ${a}\n`);
      usage(2);
    }
  }
  if (!out.project || !out.revision) {
    process.stderr.write("[evidence] --project and --revision are both required\n");
    usage(2);
  }
  if (!out.region && !out.mismatch && !out.all && !out.worst && out.regions.length === 0) {
    process.stderr.write("[evidence] name a --region, a --mismatch, --regions <a,b>, or pass --all / --worst <n>\n");
    usage(2);
  }
  return out;
}

/** Read a JSON artifact, or null when the loop has not produced it yet. */
function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    fail(1, `${file}: ${err.message}`);
    return null;
  }
}

const listRegions = (analysis) => (Array.isArray(analysis?.regions) ? analysis.regions : []);

/**
 * The visual-analysis governing a revision, walking up when it has none of its
 * own.
 *
 * The narrow scopes — data-only, asset-only, refactor-only, a dependency bump —
 * deliberately skip the analyser, because the regions did not move and that is
 * the entire premise of those scopes. Their analysis is the nearest ancestor's.
 * `render-and-diff` has walked up for exactly this reason since it was written;
 * this did not, so asking for evidence on a revision that inherited its analysis
 * failed with "no regions" — a file that was never missing, only one level up.
 */
function nearestAnalysis(startDir, revisionsDir) {
  let dir = startDir;
  const seen = new Set();
  while (dir && !seen.has(dir)) {
    seen.add(dir);
    const found = readJson(path.join(dir, "visual-analysis.json"));
    if (found) return found;
    const revision = readJson(path.join(dir, "revision.json"));
    if (!revision?.parentRevisionId) return null;
    dir = path.join(revisionsDir, revision.parentRevisionId);
  }
  return null;
}

function render(pkg) {
  const lines = [];
  lines.push(summarise(pkg));
  lines.push("");
  lines.push(`  cause     ${pkg.cause}`);
  lines.push(`            ${pkg.causeBasis}`);
  if (pkg.causeCandidates.length) {
    lines.push(`            candidates: ${pkg.causeCandidates.join(", ")}`);
  }
  if (pkg.prohibition) lines.push(`  ⚠         ${pkg.prohibition}`);
  lines.push("");
  lines.push(`  region    ${pkg.region.id}${pkg.region.label ? ` — ${pkg.region.label}` : ""}  (role: ${pkg.region.role ?? "—"})`);
  if (pkg.mismatch) {
    lines.push(`  mismatch  ${pkg.mismatch.id ?? "—"}  severity ${pkg.mismatch.severity ?? "—"}  component ${pkg.mismatch.component ?? "—"}`);
  }
  if (pkg.appearance) {
    lines.push(`  pixels    ${pkg.appearance.percent}% differ  (${pkg.appearance.classification ?? "—"}, ${pkg.appearance.shareOfPageMismatch}% of the page's total)`);
  }

  if (pkg.layout) {
    const d = pkg.layout.displacement;
    lines.push("");
    lines.push(`  owner     ${pkg.layout.name ?? pkg.layout.kind}  (${pkg.ownership.basis})`);
    lines.push(`            ${pkg.layout.path}`);
    lines.push(`  rendered  x ${pkg.layout.x}  top ${pkg.layout.top}  w ${pkg.layout.width}  h ${pkg.layout.height}`);
    lines.push(`  reference x ${pkg.ownership.referenceRect.x}  top ${pkg.ownership.referenceRect.top}  w ${pkg.ownership.referenceRect.width}  h ${pkg.ownership.referenceRect.height}`);
    lines.push(`  delta     x ${d.deltaX}  y ${d.deltaY}  w ${d.deltaWidth}  h ${d.deltaHeight}   (tolerance ${pkg.layout.toleranceP}pt)`);
    if (pkg.children) {
      lines.push(`  children  ${pkg.children.count}${pkg.children.omitted ? ` (${pkg.children.omitted} not listed)` : ""}`);
    }
  } else {
    lines.push("");
    lines.push("  owner     — no layout snapshot for this revision, so the geometry half is unanswered");
  }

  if (pkg.recommendedProperties.length) {
    lines.push("");
    lines.push("  the properties that produced this position:");
    for (const p of pkg.recommendedProperties) {
      lines.push(
        p.owner
          ? `    ${p.coordinate}: ${p.owner}.${p.property}  contributes ${p.contributes}`
          : `    ${p.coordinate}: ${p.note}`,
      );
    }
    lines.push("");
    lines.push("  Edit the owner named above, not the node that shows the symptom.");
  }
  if (pkg.measured) {
    const m = pkg.measured;
    lines.push("");
    if (m.shift) {
      lines.push(
        `  measured  ${m.shiftSource === "correlation" ? "by correlation (ink boxes clipped)" : m.shiftSource === "ink-box" ? "ink against ink" : "ink boxes (clipped; no shift believed)"}: dx ${m.shift.dx}${m.unit} dy ${m.shift.dy}${m.unit}` +
          ` (width ${m.shift.dWidth >= 0 ? "+" : ""}${m.shift.dWidth}, height ${m.shift.dHeight >= 0 ? "+" : ""}${m.shift.dHeight}; tolerance ${m.tolerance}${m.unit})` +
          (m.correlation ? ` · correlation dx ${m.correlation.dx} dy ${m.correlation.dy} at ${m.correlation.score}` : ""),
      );
    } else {
      lines.push(`  measured  ${m.note}`);
    }
    if (m.reference?.clipped || m.render?.clipped) {
      lines.push("            the ink ran past the widest window tried; the box is clipped and the shift is a lower bound");
    }
  }
  if (pkg.crops.length) {
    lines.push("");
    lines.push(`  crops     ${pkg.crops.join("  ")}`);
  }
  return lines.join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const workspace = resolveWorkspace({ explicitRoot: args.root });
  const revisionDir = path.join(projectDir(workspace, args.project), "revisions", args.revision);
  if (!fs.existsSync(revisionDir)) fail(1, `no such revision: ${revisionDir}`);

  const analysis = nearestAnalysis(revisionDir, path.join(projectDir(workspace, args.project), "revisions"));
  const review = readJson(path.join(revisionDir, "visual-review.json"));
  const stats = readJson(path.join(revisionDir, "region-diff-stats.json"));
  const snapshotFile = path.join(revisionDir, "layout-snapshot.json");

  let model = null;
  if (fs.existsSync(snapshotFile)) {
    try {
      model = loadSnapshot(JSON.parse(fs.readFileSync(snapshotFile, "utf8")));
    } catch (err) {
      // A revision predating the writer can hold an illustrative file that
      // parses and carries no nodes. Refusing it is right; failing the whole
      // command over it is not — the appearance half still answers.
      process.stderr.write(`[evidence] ignoring ${snapshotFile}: ${err.message}\n`);
    }
  }

  const regions = listRegions(analysis);
  if (regions.length === 0) fail(1, `no regions in ${path.join(revisionDir, "visual-analysis.json")}`);

  const statsFor = (id) => (Array.isArray(stats?.regions) ? stats.regions.find((r) => r.id === id) ?? null : null);
  const pagination = {
    expected: analysis?.page?.count ?? null,
    actual: model?.totalPages ?? null,
  };

  /** Region id + the mismatch that named it, for each thing asked for. */
  const targets = [];
  if (args.regions.length > 0) {
    // Named by the caller, in the caller's order — what render-and-diff ranks
    // by mass rather than by concentration alone.
    for (const id of args.regions) {
      const region = regions.find((r) => r.id === id);
      if (!region) fail(3, `no region with id ${JSON.stringify(id)}. Declared: ${regions.map((r) => r.id).join(", ")}`);
      const mismatch = (review?.mismatches ?? []).find((m) => m.region === region.id) ?? null;
      targets.push({ region, mismatch });
    }
  } else if (args.worst) {
    // The ranking a loop pass can ask for before a review exists. `--all`
    // needs mismatches, and mismatches are written by the review — which is
    // the step that was supposed to consult this and did not, because by the
    // time it could, it had already decided what it was looking at.
    //
    // `region-diff` already ranks, and its ranking is the one to use: raw
    // pixels put the page-background region first every time, because it
    // covers the page and therefore carries 100% of the difference. What
    // matters is concentration — a region well above its share of the page.
    const ranked = Array.isArray(stats?.ranked) && stats.ranked.length
      ? stats.ranked
      : (Array.isArray(stats?.regions) ? [...stats.regions] : [])
          .filter((r) => (r.mismatchPx ?? 0) > 0)
          .sort((a, b) => (b.concentration ?? 0) - (a.concentration ?? 0))
          .map((r) => r.id);
    for (const id of ranked) {
      const region = regions.find((r) => r.id === id);
      if (!region) continue;
      const mismatch = (review?.mismatches ?? []).find((m) => m.region === region.id) ?? null;
      targets.push({ region, mismatch });
      if (targets.length >= args.worst) break;
    }
    if (targets.length === 0) {
      fail(3, "no measured region difference to rank — run render-and-diff first");
    }
  } else if (args.all) {
    for (const mismatch of review?.mismatches ?? []) {
      const region = regions.find((r) => r.id === mismatch.region);
      if (region) targets.push({ region, mismatch });
    }
    if (targets.length === 0) fail(3, "no mismatch in visual-review.json names a region that visual-analysis.json declares");
  } else if (args.mismatch) {
    const mismatch = (review?.mismatches ?? []).find((m) => m.id === args.mismatch);
    if (!mismatch) fail(3, `no mismatch with id ${JSON.stringify(args.mismatch)} in visual-review.json`);
    const region = regions.find((r) => r.id === mismatch.region);
    if (!region) fail(3, `mismatch ${mismatch.id} names region ${JSON.stringify(mismatch.region)}, which visual-analysis.json does not declare`);
    targets.push({ region, mismatch });
  } else {
    const region = regions.find((r) => r.id === args.region);
    if (!region) {
      fail(3, `no region with id ${JSON.stringify(args.region)}. Declared: ${regions.map((r) => r.id).join(", ")}`);
    }
    const mismatch = (review?.mismatches ?? []).find((m) => m.region === region.id) ?? null;
    targets.push({ region, mismatch });
  }

  // The rasters, when the pass left them: reference-scaled.png has the render's
  // dimensions, so the two are one pixel space and a region's ink can be
  // measured on both and subtracted. Absent (a bare render, an old revision),
  // the package answers from the snapshot alone, as before.
  const rasters = loadRasters(revisionDir);
  const measure = (region) => {
    if (!rasters || !region.bounds) return null;
    try {
      const m = measureRegion(rasters.reference, rasters.render, region.bounds);
      return { ...m, space: { width: rasters.render.width, height: rasters.render.height } };
    } catch (err) {
      process.stderr.write(`[evidence] could not measure ${region.id} on the rasters: ${err.message}\n`);
      return null;
    }
  };

  const packages = targets.map(({ region, mismatch }) =>
    buildEvidencePackage({
      region,
      mismatch,
      regionStats: statsFor(region.id),
      model,
      pagination,
      crops: (mismatch?.evidence ?? []).slice(0, 2),
      measured: measure(region),
    }),
  );

  if (args.out) {
    // Written as an array whatever the count: a caller reading the file should
    // not have to branch on how many regions happened to be asked for.
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, `${JSON.stringify(packages, null, 2)}\n`, "utf8");
  }

  if (args.json) {
    process.stdout.write(`${JSON.stringify(packages.length === 1 ? packages[0] : packages, null, 2)}\n`);
  } else {
    const workspaceLine = describeWorkspaceLine(workspace);
    if (workspaceLine) process.stdout.write(`${workspaceLine}\n\n`);
    process.stdout.write(`${packages.map(render).join("\n\n---\n\n")}\n`);
  }
  process.exit(0);
}

main();
