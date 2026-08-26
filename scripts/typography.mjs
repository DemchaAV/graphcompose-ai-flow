#!/usr/bin/env node
/**
 * scripts/typography.mjs — which family is that, and what size?
 *
 *   node scripts/typography.mjs match  --reference <crop.png> --text "<string>" [--families A,B]
 *   node scripts/typography.mjs search --reference <crop.png> --text "<string>" --family LATO \
 *                                      --from 9 --to 12 --step 0.25
 *
 * Two questions a review pass currently answers by trial. "It looks like a
 * serif — try PT Serif" is a revision, being wrong is another one, and "the
 * size is a little small, try 10.5" is a third. Each costs a render and a
 * comparison, out of a budget of eight.
 *
 * Both are measurable. Every candidate goes into **one** document, one
 * paragraph each, rendered once; the layout snapshot from that same render says
 * exactly where each paragraph landed, so the sheet is sliced back apart with
 * no image analysis at all. Twenty candidates cost one JVM start, not twenty —
 * a full render per candidate is what item 37 forbids.
 *
 * Each slice is compared to the reference crop two ways: how wide the string
 * runs at a normalised height, and — with the width normalised away — what the
 * letterforms look like. They are reported separately, because when they
 * disagree that is information: matching shapes at the wrong width is a
 * condensed cut of the same face.
 *
 * `search` returns the best value **and the curve**. A flat curve means the
 * measurement cannot tell 10.4 from 10.6, and saying so is worth more than a
 * confident number that sends the loop to re-render four times.
 *
 * Needs ImageMagick and Maven, both already required by the harness. No model
 * is called here.
 *
 * Exit: 0 ranked · 1 a tool or render failed · 2 usage · 3 nothing to compare
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { fontsVersionFor } from "./lib/bundle-project.mjs";
import { loadSnapshot } from "./lib/layout-inspector.mjs";
import {
  ALL_FAMILIES,
  needsBundledFonts,
  specimenPom,
  specimenSource,
  validateFamilies,
} from "./lib/typography-specimen.mjs";
import {
  NORMAL_HEIGHT,
  SHAPE_BLUR,
  SHAPE_BOX,
  TRIM_FUZZ_PERCENT,
  expandCandidates,
  nodeToPixelRect,
  numericRange,
  impliedSize,
  rank,
  scoreCandidate,
  scoreSize,
  searchCurve,
} from "./lib/typography-match.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAGICK = process.env.MAGICK_BINARY || "magick";
const PACKAGE = "com.graphcompose.flow.typography";
const CLASS = "TypographySpecimen";
const DPI = 200;

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/typography.mjs <match|search> --reference <crop.png> --text \"<string>\" [options]\n\n" +
      "  match                      rank font families against the reference crop\n" +
      "  search                     find the best size (or any numeric property) in a range\n\n" +
      "  --reference <png>          the crop to match, from crop-region or any cut of the reference\n" +
      "  --text <string>            the string the crop contains — it must be the same words\n" +
      "  --families A,B,C           (match) restrict the candidate space; default is every FontName\n" +
      "  --family NAME              (search) the family to sweep a size for\n" +
      "  --from / --to / --step     (search) inclusive numeric range\n" +
      "  --size <n>                 (match) the size to set every candidate at (default 24)\n" +
      "  --top <n>                  how many ranked results to print (default 10)\n" +
      "  --graphcompose <version>   which GraphCompose to render against (default 2.2.1)\n" +
      "  --keep                     keep the scratch specimen instead of deleting it\n" +
      "  --json                     machine-readable output\n\n" +
      "exit: 0 ranked | 1 tool or render failure | 2 usage | 3 nothing to compare\n",
  );
  process.exit(code);
}

function fail(code, message) {
  process.stderr.write(`[typography] ${message}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const out = {
    command: null,
    reference: null,
    text: null,
    families: null,
    family: null,
    from: null,
    to: null,
    step: null,
    size: 24,
    scale: null,
    top: 10,
    graphcompose: "2.2.1",
    keep: false,
    json: false,
  };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--json") out.json = true;
    else if (a === "--keep") out.keep = true;
    else if (a === "--reference") out.reference = argv[++i];
    else if (a === "--text") out.text = argv[++i];
    else if (a === "--families") out.families = argv[++i];
    else if (a === "--family") out.family = argv[++i];
    else if (a === "--from") out.from = Number(argv[++i]);
    else if (a === "--to") out.to = Number(argv[++i]);
    else if (a === "--step") out.step = Number(argv[++i]);
    else if (a === "--size") out.size = Number(argv[++i]);
    else if (a === "--scale") out.scale = Number(argv[++i]);
    else if (a === "--top") out.top = Number(argv[++i]);
    else if (a === "--graphcompose") out.graphcompose = argv[++i];
    else if (a.startsWith("-")) {
      process.stderr.write(`[typography] unknown argument: ${a}\n`);
      usage(2);
    } else positional.push(a);
  }
  [out.command] = positional;
  if (out.command !== "match" && out.command !== "search") {
    process.stderr.write(out.command ? `[typography] unknown command: ${out.command}\n` : "[typography] no command given\n");
    usage(2);
  }
  if (!out.reference || !out.text) {
    process.stderr.write("[typography] --reference and --text are both required\n");
    usage(2);
  }
  if (!fs.existsSync(out.reference)) fail(3, `no such reference crop: ${out.reference}`);
  if (out.command === "search") {
    if (!out.family) {
      process.stderr.write("[typography] search needs --family\n");
      usage(2);
    }
    if (![out.from, out.to, out.step].every(Number.isFinite)) {
      process.stderr.write("[typography] search needs --from, --to and --step\n");
      usage(2);
    }
    // Family matching normalises scale away on purpose; size is the one question
    // that cannot be answered without it. Refusing beats returning what a
    // scale-free size sweep actually measures, which is rendering noise — the
    // first version of this reported "best 28, a clear minimum" for a 24pt crop.
    if (!(out.scale > 0)) {
      process.stderr.write(
        "[typography] search needs --scale <pixels per point>: a size cannot be recovered from a\n" +
          "             crop of unknown resolution. Take it from region-diff-stats.json as\n" +
          "             width / canvas.pageWidth, or as the dpi the crop was rendered at over 72.\n",
      );
      usage(2);
    }
  }
  return out;
}

/**
 * Maven is `mvn.cmd` on Windows, and `spawnSync` without a shell does not
 * resolve `.cmd`. `scripts/validate-skills.mjs` already goes through `cmd.exe`
 * for exactly this; the two would otherwise disagree about whether Maven is
 * installed.
 */
const IS_WINDOWS = process.platform === "win32";
const mvn = (argv) => (IS_WINDOWS ? run("cmd.exe", ["/d", "/s", "/c", "mvn", ...argv]) : run("mvn", argv));

/** Run a tool, or explain which one is missing rather than printing its stack. */
function run(command, argv, { cwd = repoRoot, tolerateFailure = false } = {}) {
  const spawned = spawnSync(command, argv, { encoding: "utf8", cwd });
  if (spawned.error?.code === "ENOENT") {
    fail(1, `${command} is not on PATH. Run \`node scripts/preflight.mjs\` to see what the harness needs.`);
  }
  if (!tolerateFailure && spawned.status !== 0) {
    fail(1, `${command} ${argv.slice(0, 3).join(" ")} failed:\n${(spawned.stderr || spawned.stdout || "").slice(0, 1200)}`);
  }
  return spawned;
}

const magick = (argv, options) => run(MAGICK, argv, options);

/**
 * Width and height of the ink in an image, after trimming its background.
 *
 * Through the convert pipeline into `info:` rather than `identify -trim`, which
 * ImageMagick 7 rejects: `identify` reads a file, it does not transform one.
 */
function inkBox(file) {
  const probe = magick([file, "-colorspace", "Gray", "-auto-level", "-fuzz", `${TRIM_FUZZ_PERCENT}%`, "-trim", "+repage", "-format", "%wx%h", "info:"]);
  const [width, height] = probe.stdout.trim().split("x").map(Number);
  return { width, height };
}

/**
 * Grayscale, contrast-levelled, trimmed to the ink, and stretched into the
 * shared box. Levelling matters: a reference crop of grey text and a render of
 * black text are the same letterforms, and comparing them unlevelled scores the
 * ink colour instead of the shapes.
 */
function shapeNormalise(src, out) {
  magick([
    src,
    "-colorspace",
    "Gray",
    "-auto-level",
    "-fuzz",
    `${TRIM_FUZZ_PERCENT}%`,
    "-trim",
    "+repage",
    "-resize",
    `${SHAPE_BOX.width}x${SHAPE_BOX.height}!`,
    "-blur",
    `0x${SHAPE_BLUR}`,
    out,
  ]);
  return out;
}

/** RMSE between two same-sized images, 0 identical. `compare` exits 1 on any difference. */
function rmse(a, b) {
  const spawned = magick(["compare", "-metric", "RMSE", a, b, "null:"], { tolerateFailure: true });
  const text = `${spawned.stderr ?? ""}${spawned.stdout ?? ""}`;
  const matched = /\(([\d.eE+-]+)\)/.exec(text);
  if (matched) return Number(matched[1]);
  if (spawned.status === 0) return 0;
  fail(1, `could not read a comparison metric from ImageMagick: ${text.slice(0, 300)}`);
  return NaN;
}

/** Build, render and slice the specimen. Returns crops keyed by candidate id. */
function renderSpecimen(candidates, text, args, scratch) {
  const sources = path.join(scratch, "src", "main", "java", ...PACKAGE.split("."));
  fs.mkdirSync(sources, { recursive: true });
  fs.writeFileSync(path.join(sources, `${CLASS}.java`), specimenSource({ candidates, text, packageName: PACKAGE, className: CLASS }));
  fs.writeFileSync(
    path.join(scratch, "pom.xml"),
    specimenPom({
      graphComposeVersion: args.graphcompose,
      fontsVersion: fontsVersionFor(args.graphcompose),
      needsFonts: needsBundledFonts(candidates),
    }),
  );

  const pom = path.join(scratch, "pom.xml");
  const classpathFile = path.join(scratch, "target", "cp.txt");
  mvn(["-B", "-q", "-DskipTests", "-f", pom, "compile"]);
  mvn(["-B", "-q", "-f", pom, "dependency:build-classpath", `-Dmdep.outputFile=${classpathFile}`]);

  const revision = path.join(scratch, "revision");
  fs.mkdirSync(revision, { recursive: true });
  fs.writeFileSync(path.join(revision, "revision.json"), JSON.stringify({ id: "specimen", status: "DRAFT", artifacts: {} }));

  const jar = path.join(repoRoot, "tools", "preview-renderer", "target", "preview-renderer.jar");
  if (!fs.existsSync(jar)) fail(1, "preview-renderer is not built. Run `npm run setup`.");
  run("java", [
    "-jar",
    jar,
    "render",
    "--revision",
    revision,
    "--template-class",
    `${PACKAGE}.${CLASS}`,
    "--classpath",
    path.join(scratch, "target", "classes"),
    "--classpath-file",
    classpathFile,
    "--output",
    "output.pdf",
    "--preview",
    "output.png",
    "--dpi",
    String(DPI),
    "--page",
    "0",
  ]);

  const snapshotFile = path.join(revision, "layout-snapshot.json");
  if (!fs.existsSync(snapshotFile)) {
    fail(1, `the specimen rendered without a layout snapshot, so its candidates cannot be located. GraphCompose ${args.graphcompose} may predate it.`);
  }
  const model = loadSnapshot(JSON.parse(fs.readFileSync(snapshotFile, "utf8")));
  if (model.totalPages > 1) {
    fail(1, `${candidates.length} candidates overflowed onto ${model.totalPages} pages. Narrow --families, or raise --top.`);
  }

  const cropDir = path.join(scratch, "crops");
  fs.mkdirSync(cropDir, { recursive: true });
  const crops = new Map();
  for (const candidate of candidates) {
    const node = model.nodes.find((n) => n.entityName === candidate.id);
    if (!node) continue;
    const rect = nodeToPixelRect(node, model.canvas, DPI);
    const file = path.join(cropDir, `${candidate.id}.png`);
    magick([path.join(revision, "output.png"), "-crop", `${rect.width}x${rect.height}+${rect.x}+${rect.y}`, "+repage", file]);
    crops.set(candidate.id, file);
  }
  return crops;
}

/** Ink height in points, from a crop of known scale. */
const inkPoints = (box, pixelsPerPoint) => box.height / pixelsPerPoint;

function scoreSizes(candidates, crops, referenceCrop, scale) {
  const referenceInk = inkBox(referenceCrop);
  if (!(referenceInk.height > 0)) fail(3, `the reference crop has no ink in it after trimming: ${referenceCrop}`);
  const referenceInkPt = inkPoints(referenceInk, scale);

  const scored = [];
  for (const candidate of candidates) {
    const crop = crops.get(candidate.id);
    if (!crop) continue;
    scored.push({
      family: candidate.family,
      size: candidate.size,
      ...scoreSize({ referenceInkPt, candidateInkPt: inkPoints(inkBox(crop), DPI / 72) }),
    });
  }
  if (scored.length === 0) fail(3, "no candidate produced a crop to compare");
  return { scored, referenceInk, referenceInkPt };
}

function scoreAll(candidates, crops, referenceCrop, scratch) {
  const referenceShape = shapeNormalise(referenceCrop, path.join(scratch, "reference.shape.png"));
  const referenceInk = inkBox(referenceCrop);
  if (!(referenceInk.width > 0 && referenceInk.height > 0)) {
    fail(3, `the reference crop has no ink in it after trimming: ${referenceCrop}`);
  }

  const scored = [];
  for (const candidate of candidates) {
    const crop = crops.get(candidate.id);
    if (!crop) continue;
    const shape = shapeNormalise(crop, path.join(scratch, `${candidate.id}.shape.png`));
    scored.push({
      family: candidate.family,
      size: candidate.size,
      ...scoreCandidate({
        referenceInk,
        candidateInk: inkBox(crop),
        shapeRmse: rmse(referenceShape, shape),
      }),
    });
  }
  if (scored.length === 0) fail(3, "no candidate produced a crop to compare");
  return { scored, referenceInk };
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  let candidates;
  if (args.command === "match") {
    const families = validateFamilies(
      args.families ? args.families.split(",").map((f) => f.trim().toUpperCase()).filter(Boolean) : [...ALL_FAMILIES],
    );
    candidates = expandCandidates({ families, sizes: [args.size] });
  } else {
    validateFamilies([args.family.toUpperCase()]);
    candidates = expandCandidates({ families: [args.family.toUpperCase()], sizes: numericRange(args.from, args.to, args.step) });
  }

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "gcflow-typography-"));
  let result;
  try {
    const crops = renderSpecimen(candidates, args.text, args, scratch);
    if (args.command === "match") {
      const { scored, referenceInk } = scoreAll(candidates, crops, args.reference, scratch);
      result = { command: "match", reference: args.reference, text: args.text, referenceInk, ranked: rank(scored) };
    } else {
      const { scored, referenceInk, referenceInkPt } = scoreSizes(candidates, crops, args.reference, args.scale);
      const middle = scored[Math.floor(scored.length / 2)];
      result = {
        command: "search",
        reference: args.reference,
        text: args.text,
        family: args.family.toUpperCase(),
        referenceInk,
        referenceInkPt: Math.round(referenceInkPt * 1000) / 1000,
        scale: args.scale,
        // Type scales linearly, so one measured candidate answers this outright.
        // Printed beside the sweep: when they disagree the step is too coarse.
        impliedSize: impliedSize({ referenceInkPt, candidateInkPt: middle.candidateInkPt, candidateSize: middle.size }),
        ...searchCurve(scored),
      };
    }
  } finally {
    if (args.keep) process.stderr.write(`[typography] specimen kept at ${scratch}\n`);
    else fs.rmSync(scratch, { recursive: true, force: true });
  }

  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(0);
  }

  const lines = [];
  if (result.command === "match") {
    const top = result.ranked.slice(0, Math.max(1, args.top));
    lines.push(`${result.ranked.length} families set against ${JSON.stringify(args.text)}, ranked:`);
    lines.push("");
    lines.push("  rank  family                score    width   shape   ratio");
    for (const entry of top) {
      lines.push(
        `  ${String(entry.rank).padStart(4)}  ${entry.family.padEnd(20)}  ${String(entry.score).padStart(6)}  ` +
          `${String(entry.aspectPenalty).padStart(6)}  ${String(entry.shapePenalty).padStart(6)}  ${String(entry.widthRatio).padStart(5)}`,
      );
    }
    const first = result.ranked[0];
    lines.push("");
    lines.push(
      first.separation != null && first.separation < 0.02
        ? `  ⚠ ${first.family} wins by ${first.separation}, which is inside the noise — treat the top few as equally likely.`
        : `  ${first.family} leads the runner-up by ${first.separation}.`,
    );
    lines.push("  width = how far the string runs · shape = the letterforms with width normalised away.");
    lines.push("  They are independent: matching shapes at the wrong width is a condensed cut of the same face.");
  } else {
    lines.push(`${result.family} against ${JSON.stringify(args.text)}:`);
    lines.push("");
    for (const point of result.curve) {
      const bar = "█".repeat(Math.max(0, Math.round(24 * (1 - (point.score - result.best.score) / (result.spread || 1)))));
      lines.push(`  ${String(point.size).padStart(6)}  ${String(point.score).padStart(7)}  ${bar}`);
    }
    lines.push("");
    lines.push(`  reference ink is ${result.referenceInkPt}pt tall at ${result.scale} px/pt.`);
    lines.push(
      result.decisive
        ? `  best ${result.best.size} (off by ${result.best.score}pt) — a clear minimum.`
        : `  best ${result.best.size}, but ${result.indistinguishable.join(", ")} score the same. ` +
          "The measurement cannot separate them; do not re-render to find out.",
    );
    lines.push(`  proportion implies ${result.impliedSize} — type scales linearly, so this is the answer the sweep is checking.`);
  }
  process.stdout.write(`${lines.join("\n")}\n`);
  process.exit(0);
}

main();
