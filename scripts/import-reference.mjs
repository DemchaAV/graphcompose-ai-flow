#!/usr/bin/env node
/**
 * scripts/import-reference.mjs — put the reference where everything expects it.
 *
 *   node scripts/import-reference.mjs --project <id> --file <path> [--root <ws>]
 *
 * Every tool downstream reads one path: `reference/reference.png` in the
 * project. Nothing in the harness converted anything into it, so getting a JPG,
 * a screenshot or a PDF into that shape was left to the agent — a copy, maybe a
 * convert, a filename chosen on the spot. That is the one place in the workflow
 * where two hosts could reasonably land in two different states, and it is the
 * state everything else is measured against.
 *
 * So this owns it:
 *
 *   reference/source.<ext>        the original, byte for byte, whatever it was
 *   reference/reference.png       page 1, which is what the diff compares to
 *   reference/reference-page-N.png  the rest, for a multi-page source
 *
 * The original is kept because a rasterisation is lossy and a question about
 * the reference ("what did the source actually say here?") should not have to
 * be answered from a PNG the harness made. `template-project.json` records both,
 * so a later reader does not have to infer which file was the input.
 *
 * PDFs go through the preview renderer's PDFBox path — the same rasteriser the
 * render loop uses, so a reference and a render are compared on equal terms.
 * Other raster formats go through ImageMagick, which the visual tooling already
 * requires.
 *
 * It also measures the page. The size of the document used to be decided by the
 * design stage, which had nothing to measure it against and wrote "A4" — and
 * because `visual-diff --scale-reference` resamples the reference to the
 * render's exact width and height, a page built at the wrong proportions was
 * stretched to fit right before the pixels were compared, so the gate stayed
 * green while every element placed against page height sat in the wrong place.
 * The dimensions are in the PNG header the import just wrote, so this is the
 * cheapest possible moment to look, and the last one before anything depends on
 * the answer. See scripts/lib/page-geometry.mjs for the verdicts.
 *
 * Exit: 0 imported · 2 usage · 3 no such project · 4 the source could not be
 *       converted · 5 imported, but the page size is not settled — either it
 *       matches no standard and is a question for the user, or it could not be
 *       measured at all
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
import { measureReferenceGeometry } from "./lib/page-geometry.mjs";

const repoRoot = installRoot();
const DEFAULT_DPI = 150;

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/import-reference.mjs --project <id> --file <path> [options]\n\n" +
      "  --project <id>     the project to import into (must already exist)\n" +
      "  --file <path>      the reference: png, jpg, webp, gif, bmp or pdf\n" +
      "  --pages <n>        how many pages to rasterise from a PDF (default: all)\n" +
      "  --dpi <n>          rasterisation dpi for a PDF (default: " + DEFAULT_DPI + ")\n" +
      "  --root <dir>       workspace override (default: discovered)\n" +
      "  --json             machine-readable result\n\n" +
      "exit: 0 imported | 2 usage | 3 no such project | 4 conversion failed\n" +
      "      5 imported, but the page size is unsettled (a question, or unmeasurable)\n",
  );
  process.exit(code);
}

function parseArgs(argv) {
  const out = { project: null, file: null, pages: null, dpi: DEFAULT_DPI, root: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--json") out.json = true;
    else if (a === "--project" || a === "-p") out.project = argv[++i];
    else if (a === "--file" || a === "-f") out.file = argv[++i];
    else if (a === "--pages") out.pages = Number(argv[++i]);
    else if (a === "--dpi") out.dpi = Number(argv[++i]);
    else if (a === "--root") out.root = argv[++i];
    else usage(2);
  }
  return out;
}

const RASTER = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff"]);
const MAGICK = process.env.MAGICK_BINARY || "magick";

function fail(message, code) {
  process.stderr.write(`[import-reference] ${message}\n`);
  process.exit(code);
}

/**
 * Rasterise `count` pages from `page`, in one JVM, with the same PDFBox path
 * the render loop uses.
 *
 * This used to launch a process per page: a two-hundred-page book paid two
 * hundred JVM starts at about 1.7s each to rasterise pages the renderer holds
 * open together. Measured on a two-page PDF: 3324ms as two launches, 1722ms as
 * one — the second page costs about twenty milliseconds once the document is
 * loaded, and everything else was process startup.
 *
 * `page` is 1-based, the way a person counts. The renderer's `--page` is a
 * zero-based index — the same convention `render-runtime` uses when it asks for
 * `--page 0` — and this passed the human number straight through. Importing a
 * one-page PDF therefore asked for index 1 and was refused outright ("page
 * index 1 out of range; pdf has 1 page(s)"), and importing a two-page PDF put
 * page *two* into `reference.png` and never imported page one. The second is
 * the worse of the pair: nothing fails, and every later measurement is taken
 * against the wrong page.
 */
function rasterisePdfPages(source, target, page, count, dpi) {
  const jar = path.join(repoRoot, "tools", "preview-renderer", "target", "preview-renderer.jar");
  if (!fs.existsSync(jar)) {
    fail(`preview-renderer.jar is missing — run npm run setup first (${jar})`, 4);
  }
  const run = spawnSync(
    "java",
    [
      "-jar",
      jar,
      "preview",
      "--pdf",
      source,
      "--out",
      target,
      "--dpi",
      String(dpi),
      "--page",
      String(page - 1),
      "--pages",
      String(Math.max(1, count)),
    ],
    { encoding: "utf8" },
  );
  // Count the files, not the renderer's stdout. Deriving the number from
  // printed lines meant any future log line — a PDFBox warning, a progress
  // note — would inflate it, and `referencePages` and `render.pages` would then
  // claim pages that are not there, which every later diff reports as missing
  // forever. The files are the answer and cannot drift from themselves.
  let written = 0;
  while (fs.existsSync(pageFile(target, page + written))) written += 1;

  if (written === 0) {
    return { ok: false, error: (run.stderr || run.stdout || "preview-renderer failed").trim() };
  }
  // A failure partway through keeps what landed. The renderer stops at the end
  // of the document on its own, but a page it cannot encode throws — and the
  // pages before it are already written. Losing a 40-page import because page
  // 12 would not encode is worse than importing 11 and saying so.
  const partial = run.status !== 0;
  return {
    ok: true,
    written,
    partial,
    error: partial ? (run.stderr || run.stdout || "preview-renderer failed").trim() : null,
  };
}

/** Page 1 is the name it was given; the rest carry the suffix, beside it. */
function pageFile(firstTarget, page) {
  if (page <= 1) return firstTarget;
  const dir = path.dirname(firstTarget);
  const base = path.basename(firstTarget, path.extname(firstTarget));
  return path.join(dir, `${base}-page-${page}${path.extname(firstTarget)}`);
}

function convertRaster(source, target) {
  const run =
    process.platform === "win32"
      ? spawnSync("cmd.exe", ["/d", "/s", "/c", MAGICK, source, target], { encoding: "utf8" })
      : spawnSync(MAGICK, [source, target], { encoding: "utf8" });
  return run.status === 0 && fs.existsSync(target)
    ? { ok: true }
    : { ok: false, error: (run.stderr || run.stdout || `${MAGICK} failed`).trim() };
}

/**
 * How many pages a PDF has — asked of the parser, not guessed from the bytes.
 *
 * This used to scan the raw file for `/Type /Pages … /Count N`, which finds
 * nothing whenever that dictionary lives in a compressed object stream — and
 * that is where every PDF GraphCompose itself writes puts it. The function then
 * returned its "safe floor" of one, so importing a multi-page reference
 * rasterised page 1 and silently discarded the rest. Measured on the two-page
 * `examples/cv-reference` renders: the scan found 0 in all nine revisions,
 * while the renderer reports 2.
 *
 * The renderer is already required on this path — `rasterisePdfPages` refuses
 * without it — so asking it costs nothing that was not already being paid. The
 * byte scan stays as a fallback for the case where it cannot run at all.
 */
function pdfPageCount(file) {
  const jar = path.join(repoRoot, "tools", "preview-renderer", "target", "preview-renderer.jar");
  if (fs.existsSync(jar)) {
    const run = spawnSync("java", ["-jar", jar, "text", "--pdf", file], { encoding: "utf8" });
    if (run.status === 0) {
      try {
        const reported = JSON.parse(run.stdout).pageCount;
        if (Number.isInteger(reported) && reported > 0) return reported;
      } catch {
        // Fall through to the scan rather than failing an import over the shape
        // of a diagnostic.
      }
    }
  }

  const text = fs.readFileSync(file).toString("latin1");
  const counts = [...text.matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  if (counts.length) return Math.max(...counts);
  // Nothing could answer. One page is the safe floor, and --pages overrides it.
  return 1;
}

// --- run ---------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
if (!args.project || !args.file) usage(2);

const workspace = resolveWorkspace({ explicitRoot: args.root ?? null });
const banner = describeWorkspaceLine(workspace);
if (banner && !args.json) console.log(banner);

const projectDir = workspaceProjectDir(workspace, args.project);
const projectFile = path.join(projectDir, "template-project.json");
if (!fs.existsSync(projectFile)) {
  fail(
    `project not found: ${path.relative(workspace.root, projectFile) || projectFile}\n` +
      `  create it first: node scripts/init-workspace.mjs --project-dir <java-project> --project ${args.project}`,
    3,
  );
}

const source = path.resolve(args.file);
if (!fs.existsSync(source)) fail(`no such file: ${source}`, 2);

const extension = path.extname(source).toLowerCase();

// Refuse before touching anything. The replacement below is destructive, and
// running it first meant that trying to import a .docx deleted the working
// reference and then failed — a user error costing the file it was aimed at.
if (extension !== ".pdf" && !RASTER.has(extension)) {
  fail(
    `unsupported reference format "${extension}". Supported: ${[...RASTER].join(", ")}, .pdf`,
    2,
  );
}

const referenceDir = path.join(projectDir, "reference");
fs.mkdirSync(referenceDir, { recursive: true });

// Re-importing replaces the reference; it does not add a second one. Without
// this, importing a PDF over a JPG leaves source.jpg and source.pdf side by
// side and the folder no longer says which one the project is built from.
for (const existing of fs.readdirSync(referenceDir)) {
  if (/^source\./i.test(existing) || /^reference-page-\d+\.png$/i.test(existing)) {
    fs.rmSync(path.join(referenceDir, existing), { force: true });
  }
}

// The original first, and under a name that says what it is. A rasterisation is
// lossy; the input should still be answerable from later.
const sourceCopy = path.join(referenceDir, `source${extension}`);
fs.copyFileSync(source, sourceCopy);

const written = [];
if (extension === ".pdf") {
  const total = args.pages && args.pages > 0 ? args.pages : pdfPageCount(source);
  // Every page in one JVM. This used to be a launch per page: a two-hundred
  // page book paid two hundred process starts at about 1.7s each to rasterise
  // pages the renderer holds open together. The naming is unchanged —
  // `reference.png` then `reference-page-N.png`.
  const target = path.join(referenceDir, "reference.png");
  const result = rasterisePdfPages(source, target, 1, total, args.dpi);
  if (!result.ok) fail(`could not rasterise the PDF: ${result.error}`, 4);
  if (result.partial) {
    process.stderr.write(
      `[import-reference] rasterised ${result.written} of ${total} page(s); the rest failed: ` +
        `${result.error.split("\n")[0]}\n`,
    );
  }
  for (let page = 1; page <= result.written; page += 1) {
    written.push(page === 1 ? "reference.png" : `reference-page-${page}.png`);
  }
} else if (extension === ".png") {
  fs.copyFileSync(source, path.join(referenceDir, "reference.png"));
  written.push("reference.png");
} else if (RASTER.has(extension)) {
  const result = convertRaster(source, path.join(referenceDir, "reference.png"));
  if (!result.ok) {
    fail(
      `could not convert ${extension} to png: ${result.error}\n` +
        `  ImageMagick is required for anything but png and pdf; set MAGICK_BINARY if it is not on PATH.`,
      4,
    );
  }
  written.push("reference.png");
}

// Measure before the project file is written, so the geometry lands in the same
// save as the page count and the two can never disagree about how many pages
// were measured.
//
// A failure here does not lose the import. The files are on disk and correct;
// what is missing is a measurement, and reporting that honestly is better than
// discarding a two-hundred-page rasterisation because a header would not read.
let geometry = null;
let geometryError = null;
try {
  geometry = measureReferenceGeometry(
    written.map((name) => path.join(referenceDir, name)),
  );
  // Store paths the way the rest of the project file stores them — relative and
  // slash-separated — so the record is portable and reads the same on both
  // hosts.
  geometry = {
    ...geometry,
    measuredAt: new Date().toISOString(),
    pages: geometry.pages.map((p) => ({
      ...p,
      file: path.relative(projectDir, p.file).split(path.sep).join("/"),
    })),
  };
} catch (error) {
  geometryError = error instanceof Error ? error.message : String(error);
}

const project = JSON.parse(fs.readFileSync(projectFile, "utf8"));
project.referenceImage = "reference/reference.png";
project.referenceSource = `reference/source${extension}`;
project.referencePages = written.length;

// Rasterising the render is driven by `render.pages`, and importing a
// three-page reference used to leave it at one. Both sides then had page 1 and
// only the reference had the rest, so pages 2..N could not be compared even
// once the diff learned how — there was nothing on the render side to compare
// them to. A reference states how long the document is; this carries that over.
//
// Downward too, and that is the half worth stating: only raising it left a
// project that had carried a three-page reference rasterising three pages
// forever after a one-page reference replaced it — two renders per pass that
// nothing compares, reported as `extraInRender` on every single loop. The
// field follows the reference rather than remembering an older one.
if (project.render || written.length > 1) {
  project.render = { ...(project.render ?? {}), pages: written.length };
}

// The measured geometry is part of what the project IS, not a note about one
// import: every later stage that has to know the page size reads it from here
// rather than deciding again.
if (geometry) project.referenceGeometry = geometry;
else delete project.referenceGeometry;

project.updatedAt = new Date().toISOString();
fs.writeFileSync(projectFile, `${JSON.stringify(project, null, 2)}\n`, "utf8");

const result = {
  project: args.project,
  projectDir,
  source: path.relative(projectDir, sourceCopy).split(path.sep).join("/"),
  referenceImage: "reference/reference.png",
  pages: written.length,
  files: written,
  geometry,
  geometryError,
};

// "ask" and "inconsistent" both mean the same thing to a caller: do not start
// designing. They get their own exit code rather than a line in the output,
// because a line in the output is exactly what the old chain had — the accuracy
// contract has said "page size matches the reference" all along, and saying it
// louder was never going to be what made someone check.
//
// A measurement that could not be taken is in the same bucket, and deliberately
// so. Exiting 0 there would make "the page is a known standard" and "nobody
// could tell what the page is" the same answer to a script — the vacuous pass
// this repository has already had to fix once, in `observations verify`.
const needsDecision = geometry === null || geometry.verdict !== "standard";

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  console.log(
    `[import-reference] ${args.project}: ${result.source} -> ${written.join(", ")}` +
      ` (${written.length} page${written.length === 1 ? "" : "s"})`,
  );
  console.log(formatGeometry(geometry, geometryError));
}

// `process.exitCode`, not `process.exit()`. stdout is asynchronous when it is a
// pipe, which is exactly how every caller here runs — and exiting outright can
// drop a buffered write, so the JSON payload this same block just produced
// could be truncated by the line that reports its verdict.
process.exitCode = needsDecision ? 5 : 0;

/**
 * The measurement, as something a person reads and acts on.
 *
 * The ranked candidates are printed even when the verdict is settled: the run
 * that broke `mocha-profile-cv` built at A4 when the nearest standard was
 * LETTER, and a table showing both would have made that visible without anyone
 * having to suspect it first.
 */
function formatGeometry(g, error) {
  if (error) {
    return `[import-reference] page size NOT measured: ${error}\n` +
      "  Design cannot assume A4 — establish the page size before the layout depends on it.";
  }
  const first = g.pages[0];
  const head =
    `[import-reference] page: ${first.widthPx}x${first.heightPx}px, ` +
    `aspect ${g.aspect} (${g.orientation})`;
  const table = g.candidates
    .map((c) => `    ${c.name.padEnd(6)} aspect ${String(c.aspect).padEnd(8)} off by ${c.deviationPercent}%`)
    .join("\n");

  if (g.verdict === "standard") {
    return (
      `${head}\n  page size: ${g.pageSize.format} ${g.pageSize.orientation} ` +
      `(${g.pageSize.widthPt} x ${g.pageSize.heightPt} pt, within ${g.tolerancePercent}%)\n` +
      `  nearest standards:\n${table}`
    );
  }
  return (
    `${head}\n  page size: UNDECIDED — ask the user before designing.\n` +
    `  nearest standards:\n${table}\n\n  ${g.question}\n`
  );
}
