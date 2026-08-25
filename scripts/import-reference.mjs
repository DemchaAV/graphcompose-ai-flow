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
 * Exit: 0 imported · 2 usage · 3 no such project · 4 the source could not be
 *       converted
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
      "exit: 0 imported | 2 usage | 3 no such project | 4 conversion failed\n",
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

/** Rasterise one PDF page with the same PDFBox path the render loop uses. */
function rasterisePdfPage(source, target, page, dpi) {
  const jar = path.join(repoRoot, "tools", "preview-renderer", "target", "preview-renderer.jar");
  if (!fs.existsSync(jar)) {
    fail(`preview-renderer.jar is missing — run npm run setup first (${jar})`, 4);
  }
  const run = spawnSync(
    "java",
    ["-jar", jar, "preview", "--pdf", source, "--out", target, "--dpi", String(dpi), "--page", String(page)],
    { encoding: "utf8" },
  );
  return run.status === 0 && fs.existsSync(target)
    ? { ok: true }
    : { ok: false, error: (run.stderr || run.stdout || "preview-renderer failed").trim() };
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

/** How many pages a PDF has, read from its own page-tree count. */
function pdfPageCount(file) {
  const text = fs.readFileSync(file).toString("latin1");
  const counts = [...text.matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  if (counts.length) return Math.max(...counts);
  // A linearised or object-stream PDF may not expose it in the raw bytes; one
  // page is the safe floor, and --pages overrides it.
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
  for (let page = 1; page <= total; page += 1) {
    const target = path.join(referenceDir, page === 1 ? "reference.png" : `reference-page-${page}.png`);
    const result = rasterisePdfPage(source, target, page, args.dpi);
    if (!result.ok) {
      if (page === 1) fail(`could not rasterise page 1 of the PDF: ${result.error}`, 4);
      // A page count read from the raw bytes can overshoot; stop at the first
      // page that is not there rather than failing an import that worked.
      break;
    }
    written.push(path.basename(target));
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
} else {
  fail(
    `unsupported reference format "${extension}". Supported: ${[...RASTER].join(", ")}, .pdf`,
    2,
  );
}

const project = JSON.parse(fs.readFileSync(projectFile, "utf8"));
project.referenceImage = "reference/reference.png";
project.referenceSource = `reference/source${extension}`;
project.referencePages = written.length;
project.updatedAt = new Date().toISOString();
fs.writeFileSync(projectFile, `${JSON.stringify(project, null, 2)}\n`, "utf8");

const result = {
  project: args.project,
  projectDir,
  source: path.relative(projectDir, sourceCopy).split(path.sep).join("/"),
  referenceImage: "reference/reference.png",
  pages: written.length,
  files: written,
};

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  console.log(
    `[import-reference] ${args.project}: ${result.source} -> ${written.join(", ")}` +
      ` (${written.length} page${written.length === 1 ? "" : "s"})`,
  );
}
