#!/usr/bin/env node
/**
 * scripts/reference.mjs — what the reference measures, without writing a script
 * to find out.
 *
 *   node scripts/reference.mjs measure  --project <id> [--revision <id>]
 *   node scripts/reference.mjs rules    --project <id> [--revision <id>] [--region <id>]
 *   node scripts/reference.mjs bands    --project <id> --window <name>,<x0>,<x1>,<y0>,<y1> …
 *   node scripts/reference.mjs colors   --project <id> [--region <id>]
 *   node scripts/reference.mjs compare  --project <id> --revision <id> --window … [--window …]
 *
 * ## Why
 *
 * A create run measuring its reference against its render composed **76 ad-hoc
 * Python scripts**, costing 27.2 minutes of model time — 35% of the whole run —
 * to produce 4.7 minutes of computation. Every one of them was written, run
 * once, and thrown away: rule positions, colour samples, image dimensions, text
 * band extents. Rendering, the operation that felt expensive, cost 0.6 minutes
 * across the same run.
 *
 * At about the seventieth script the run factored its repeats into a scratch
 * `compare.py` — reference-normalised units, a named column window, ink runs
 * down it, both sides side by side. That file is the specification this one
 * implements, because the only party who knew what the loop actually needed was
 * the loop.
 *
 * ## What stays with the model
 *
 * All of it, except the arithmetic. Which region owns a divider, whether two
 * rules are one grid drawn twice, which primitive expresses an arrangement,
 * where a window should go — none of that is here and none of it should be.
 * `--window` is the seam: choosing it is judgement, reading it is not.
 *
 * ## Units
 *
 * Every coordinate in and out of `bands` and `compare` is in **reference
 * pixels**, whatever the render's raster turns out to be. The two are almost
 * never the same size — 1103x1426 against 1240x1603 in the run this came from —
 * and a comparison in mixed units is worse than no comparison, because it looks
 * like an answer.
 *
 * Exit: 0 measured | 1 unreadable input | 2 usage | 3 nothing to measure
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import {
  describeWorkspaceLine,
  installRoot,
  projectDir as workspaceProjectDir,
  resolveWorkspace,
} from "./lib/workspace.mjs";
import { extractRules } from "./lib/border-topology.mjs";
import {
  comparableBands,
  inkBands,
  pageMetrics,
  samplePalette,
} from "./lib/reference-metrics.mjs";

const repoRoot = installRoot();
// The established way to reach an npm dependency from a root script: the tools
// carry their own node_modules and the harness root has none of its own.
const require = createRequire(path.join(repoRoot, "tools", "visual-diff", "package.json"));

const COMMANDS = new Set(["measure", "rules", "bands", "colors", "compare"]);

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/reference.mjs <measure|rules|bands|colors|compare> --project <id> [options]\n\n" +
      "  measure                    page size, aspect, and the margins the ink implies\n" +
      "  rules                      horizontal and vertical rules, and the bands too thick to be rules\n" +
      "  bands                      ink runs down each window, with their horizontal extents\n" +
      "  colors                     dominant colours by coverage\n" +
      "  compare                    reference and render bands side by side, in reference pixels\n\n" +
      "  --project <id>             the project\n" +
      "  --revision <id>            the revision whose render to read (required by compare)\n" +
      "  --window <spec>            name,x0,x1,y0,y1 in REFERENCE pixels. Repeatable — pass every\n" +
      "                             window you need in one call rather than one call each.\n" +
      "  --region <id>              scope to a region's bounds from visual-analysis.json\n" +
      "  --gap <n>                  blank rows tolerated inside one band (default 0)\n" +
      "  --min-ink <n>              dark pixels per row before it counts as inked (default 0)\n" +
      "  --root <dir>               workspace override\n" +
      "  --json                     machine-readable\n\n" +
      "exit: 0 measured | 1 unreadable input | 2 usage | 3 nothing to measure\n",
  );
  process.exit(code);
}

function parseArgs(argv) {
  const out = {
    command: null, project: null, revision: null, region: null, root: null,
    windows: [], gap: 0, minInk: 0, json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--json") out.json = true;
    else if (a === "--project" || a === "-p") out.project = argv[++i];
    else if (a === "--revision" || a === "-r") out.revision = argv[++i];
    else if (a === "--region") out.region = argv[++i];
    else if (a === "--root") out.root = argv[++i];
    else if (a === "--gap") out.gap = Number.parseInt(argv[++i], 10);
    else if (a === "--min-ink") out.minInk = Number.parseInt(argv[++i], 10);
    else if (a === "--window" || a === "-w") out.windows.push(parseWindow(argv[++i]));
    else if (!out.command && COMMANDS.has(a)) out.command = a;
    else {
      process.stderr.write(`[reference] unknown argument: ${a}\n`);
      usage(2);
    }
  }
  return out;
}

/**
 * `name,x0,x1,y0,y1` — both x bounds then both y bounds.
 *
 * The order reads as the sentence the caller is thinking: columns from x0 to
 * x1, rows from y0 to y1. It is also the order the scratch `compare.py` used,
 * and there is no reason to make anyone relearn it.
 */
function parseWindow(spec) {
  const parts = String(spec ?? "").split(",");
  if (parts.length !== 5) {
    process.stderr.write(`[reference] --window wants name,x0,x1,y0,y1 — got "${spec}"\n`);
    usage(2);
  }
  const [name, x0, x1, y0, y1] = parts;
  const numbers = [x0, x1, y0, y1].map((n) => Number.parseFloat(n));
  if (numbers.some((n) => !Number.isFinite(n))) {
    process.stderr.write(`[reference] --window has a non-numeric bound: "${spec}"\n`);
    usage(2);
  }
  return { name: name.trim(), x0: numbers[0], x1: numbers[1], y0: numbers[2], y1: numbers[3] };
}

const args = parseArgs(process.argv.slice(2));
if (!args.command || !args.project) usage(2);
if (args.command === "compare" && !args.revision) {
  process.stderr.write("[reference] compare needs --revision: there is nothing to compare against\n");
  usage(2);
}
if ((args.command === "bands" || args.command === "compare") && args.windows.length === 0) {
  process.stderr.write(
    `[reference] ${args.command} needs at least one --window. Scanning a whole page merges two\n` +
      "            columns at overlapping heights into one run; a window is what separates them.\n",
  );
  usage(2);
}

const workspace = resolveWorkspace({ explicitRoot: args.root ?? null });
const banner = describeWorkspaceLine(workspace);
if (banner && !args.json) console.log(banner);

const projectDir = workspaceProjectDir(workspace, args.project);
const referencePath = path.join(projectDir, "reference", "reference.png");
if (!fs.existsSync(referencePath)) {
  process.stderr.write(
    `[reference] no reference/reference.png in ${args.project} — run import-reference first\n`,
  );
  process.exit(3);
}

const { PNG } = require("pngjs");
const reference = read(referencePath);

const bandOptions = { gap: args.gap, minInk: args.minInk };
let result;

if (args.command === "measure") {
  result = { project: args.project, reference: pageMetrics(reference) };
  if (args.revision) {
    const render = read(renderPath());
    const metrics = pageMetrics(render);
    result.render = metrics;
    result.scale = round(render.width / reference.width, 6);
    // Aspect is reported as its own number rather than folded into the scale.
    // A stretched render and a matching one differ here and nowhere else.
    // From the raw ratios, not the already-rounded `aspect` fields: subtracting
    // two rounded numbers and rounding again loses a digit, and `compare`
    // computes the same quantity from raw values. They have to match.
    result.aspectDrift = round(
      render.width / render.height - reference.width / reference.height, 4,
    );
  }
} else if (args.command === "rules") {
  const bounds = args.region ? regionBounds() : null;
  const referenceRules = extractRules(reference, bounds);
  result = {
    project: args.project,
    region: args.region ?? "the whole page",
    units: "page fractions, and reference pixels alongside",
    reference: describeRules(referenceRules, reference),
  };
  if (args.revision) {
    const render = read(renderPath());
    result.render = describeRules(extractRules(render, bounds), render);
  }
} else if (args.command === "bands") {
  result = {
    project: args.project,
    units: "reference pixels",
    referenceSize: { width: reference.width, height: reference.height },
    windows: args.windows.map((w) => ({
      name: w.name,
      window: { x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1 },
      bands: inkBands(reference, w, bandOptions),
    })),
  };
} else if (args.command === "colors") {
  const bounds = args.region ? pixelBounds(regionBounds(), reference) : undefined;
  result = {
    project: args.project,
    region: args.region ?? "the whole page",
    palette: samplePalette(reference, bounds),
  };
} else {
  result = {
    project: args.project,
    revision: args.revision,
    ...comparableBands(reference, read(renderPath()), args.windows, bandOptions),
  };
}

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  printText(result);
}
process.exit(0);

// ------------------------------------------------------------------ helpers ---

function read(file) {
  try {
    return PNG.sync.read(fs.readFileSync(file));
  } catch (cause) {
    process.stderr.write(`[reference] cannot read ${file}: ${cause.message}\n`);
    process.exit(1);
  }
}

function renderPath() {
  const file = path.join(projectDir, "revisions", args.revision, "output.png");
  if (!fs.existsSync(file)) {
    process.stderr.write(`[reference] no output.png in ${args.revision} — render it first\n`);
    process.exit(3);
  }
  return file;
}

function regionBounds() {
  const analysisPath = path.join(
    projectDir, "revisions", args.revision ?? latestRevision(), "visual-analysis.json",
  );
  if (!fs.existsSync(analysisPath)) {
    process.stderr.write("[reference] --region needs visual-analysis.json, which is not there\n");
    process.exit(3);
  }
  const analysis = JSON.parse(fs.readFileSync(analysisPath, "utf8"));
  const region = (analysis.regions ?? []).find((r) => r.id === args.region);
  if (!region?.bounds) {
    process.stderr.write(
      `[reference] region "${args.region}" has no bounds in visual-analysis.json\n`,
    );
    process.exit(3);
  }
  return region.bounds;
}

function latestRevision() {
  const dir = path.join(projectDir, "revisions");
  const all = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.startsWith("revision-")).sort() : [];
  if (all.length === 0) {
    process.stderr.write(`[reference] ${args.project} has no revisions yet\n`);
    process.exit(3);
  }
  return all[all.length - 1];
}

/** `visual-analysis.json` bounds are page fractions; the palette wants pixels. */
function pixelBounds(bounds, png) {
  return {
    x0: (bounds.x ?? 0) * png.width,
    y0: (bounds.y ?? 0) * png.height,
    x1: ((bounds.x ?? 0) + (bounds.w ?? 1)) * png.width,
    y1: ((bounds.y ?? 0) + (bounds.h ?? 1)) * png.height,
  };
}

/**
 * Rules in both units at once.
 *
 * `extractRules` works in page fractions, which is right for comparing two
 * rasters of different sizes and useless for saying "the divider is at y 227".
 * Both are cheap; printing only one guarantees somebody converts by hand.
 */
function describeRules(extracted, png) {
  const inPixels = (runs, span) =>
    runs.map((run) => ({
      at: round(run.at, 4),
      atPixels: Math.round(run.at * span),
      thickness: run.thickness,
      extent: round(run.extent, 4),
    }));
  return {
    horizontal: inPixels(extracted.horizontal, png.height),
    vertical: inPixels(extracted.vertical, png.width),
    bands: {
      horizontal: inPixels(extracted.horizontalBands ?? [], png.height),
      vertical: inPixels(extracted.verticalBands ?? [], png.width),
    },
  };
}

function printText(payload) {
  const lines = [];
  if (payload.reference?.width) {
    lines.push(
      `reference  ${payload.reference.width}x${payload.reference.height}  aspect ${payload.reference.aspect}`
        + `  margins ${formatMargins(payload.reference.margins)}`,
    );
  }
  if (payload.render?.width) {
    lines.push(
      `render     ${payload.render.width}x${payload.render.height}  aspect ${payload.render.aspect}`
        + `  scale ${payload.scale}  aspectDrift ${payload.aspectDrift}`,
    );
  }
  if (payload.palette) {
    lines.push(`palette of ${payload.region}:`);
    for (const entry of payload.palette) {
      lines.push(`  ${entry.hex}  ${(entry.share * 100).toFixed(1)}%  (${entry.pixels} px)`);
    }
  }
  if (payload.reference?.horizontal) {
    lines.push(`rules in ${payload.region}:`);
    lines.push(`  horizontal ${payload.reference.horizontal.map((r) => r.atPixels).join(", ") || "none"}`);
    lines.push(`  vertical   ${payload.reference.vertical.map((r) => r.atPixels).join(", ") || "none"}`);
  }
  for (const window of payload.windows ?? []) {
    lines.push(`=== ${window.name}  (x ${window.window.x0}-${window.window.x1})`);
    if (window.bands) {
      lines.push("       y0    y1    x0    x1");
      for (const [i, b] of window.bands.entries()) {
        lines.push(`  ${pad(i, 2)} ${pad(b.y0, 5)} ${pad(b.y1, 5)} ${pad(b.x0, 5)} ${pad(b.x1, 5)}`);
      }
      continue;
    }
    // The paired form: both sides in one table, because reading two tables and
    // subtracting is the step this exists to remove.
    lines.push(`       reference y0    y1    x0    x1  |  render    y0    y1    x0    x1`);
    const rows = Math.max(window.reference.length, window.render.length);
    for (let i = 0; i < rows; i += 1) {
      lines.push(`  ${pad(i, 2)} ${row(window.reference[i])}  |  ${row(window.render[i])}`);
    }
    if (!window.bandCountMatches) {
      lines.push(
        `     ^ ${window.reference.length} bands in the reference, ${window.render.length} in the render`,
      );
    }
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

// Declarations for the same reason `round` is one: printText runs from the
// top-level branches above, and an arrow assigned down here is still in its
// temporal dead zone when they call it.
function row(band) {
  return band
    ? `${pad(band.y0, 10)} ${pad(band.y1, 5)} ${pad(band.x0, 5)} ${pad(band.x1, 5)}`
    : " ".repeat(28);
}

function pad(value, width) {
  return String(value ?? "").padStart(width);
}

function formatMargins(m) {
  return `${m.top}/${m.right}/${m.bottom}/${m.left}`;
}
// A declaration, not a const: the command branches above run at module top
// level and would hit the temporal dead zone of an arrow assigned down here.
function round(value, places) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
