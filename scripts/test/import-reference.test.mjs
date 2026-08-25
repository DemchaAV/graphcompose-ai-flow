#!/usr/bin/env node
/**
 * scripts/test/import-reference.test.mjs — the reference has one canonical home.
 *
 * Everything downstream reads `reference/reference.png`, and nothing used to put
 * anything there: turning a screenshot, a JPG or a PDF into that shape was left
 * to whichever agent was running. That is the single step of the workflow where
 * two hosts could reasonably produce two different states — and it is the state
 * every later measurement is taken against.
 *
 * The PDF and ImageMagick paths need a JDK and a binary, so they are exercised
 * where those exist and skipped where they do not, rather than being faked. What
 * is asserted unconditionally is the contract that does not need them: the
 * canonical names, the original kept beside the rasterisation, the manifest
 * recording both, and re-import replacing rather than accumulating.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(repoRoot, "scripts", "import-reference.mjs");
const { PNG } = createRequire(path.join(repoRoot, "tools", "visual-diff", "package.json"))("pngjs");

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcir-${label}-`));
  process.on("exit", () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
  return dir;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function writePng(file, width = 40, height = 30) {
  const png = new PNG({ width, height });
  png.data.fill(180);
  for (let i = 3; i < png.data.length; i += 4) png.data[i] = 255;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
  return file;
}

function workspace(label) {
  const host = tempDir(label);
  const root = path.join(host, "graphcompose-flow");
  const project = path.join(root, "projects", "demo");
  writeJson(path.join(root, "flow.config.json"), { schemaVersion: 1 });
  writeJson(path.join(project, "template-project.json"), {
    projectName: "demo",
    referenceImage: "reference/reference.png",
    schemaVersion: 1,
  });
  return { host, root, project };
}

function runCli(root, extra) {
  const spawned = spawnSync(process.execPath, [CLI, "--root", root, "--json", ...extra], {
    encoding: "utf8",
  });
  let parsed = null;
  try {
    parsed = JSON.parse(spawned.stdout);
  } catch {
    /* text or failure */
  }
  return { status: spawned.status, parsed, output: `${spawned.stdout ?? ""}${spawned.stderr ?? ""}` };
}


/** Any PDF in this checkout with more than one page, or null. */
function multiPagePdf() {
  const root = path.join(repoRoot, "examples");
  if (!fs.existsSync(root)) return null;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const revisions = path.join(root, entry.name, "revisions");
    if (!fs.existsSync(revisions)) continue;
    for (const rev of fs.readdirSync(revisions)) {
      // A revision that rasterised a second page had one to rasterise.
      if (!fs.existsSync(path.join(revisions, rev, "output-page-2.png"))) continue;
      const pdf = path.join(revisions, rev, "output.pdf");
      if (fs.existsSync(pdf)) return pdf;
    }
  }
  return null;
}

const projectOf = (ws) =>
  JSON.parse(fs.readFileSync(path.join(ws.project, "template-project.json"), "utf8"));

test("a png lands at the canonical name with the original kept beside it", () => {
  const ws = workspace("png");
  const source = writePng(path.join(ws.host, "screenshot.png"));

  const { status, parsed } = runCli(ws.root, ["--project", "demo", "--file", source]);
  assert.equal(status, 0);
  assert.equal(parsed.referenceImage, "reference/reference.png");
  assert.ok(fs.existsSync(path.join(ws.project, "reference", "reference.png")));
  assert.ok(
    fs.existsSync(path.join(ws.project, "reference", "source.png")),
    "the original was not kept — a lossy rasterisation would be the only record",
  );
});

test("the manifest records both the input and what everything reads", () => {
  const ws = workspace("manifest");
  runCli(ws.root, ["--project", "demo", "--file", writePng(path.join(ws.host, "ref.png"))]);

  const project = projectOf(ws);
  assert.equal(project.referenceImage, "reference/reference.png");
  assert.equal(project.referenceSource, "reference/source.png");
  assert.equal(project.referencePages, 1);
  assert.ok(project.updatedAt, "the import did not stamp the project");
});

test("a single-page import does not invent a render block it does not need", () => {
  const ws = workspace("onepagerender");
  runCli(ws.root, ["--project", "demo", "--file", writePng(path.join(ws.host, "one.png"))]);
  const project = projectOf(ws);
  assert.equal(project.referencePages, 1);
  assert.equal(project.render, undefined, "a one-page project grew a render.pages it has no use for");
});

test("re-importing replaces the reference rather than adding a second one", () => {
  const ws = workspace("reimport");
  runCli(ws.root, ["--project", "demo", "--file", writePng(path.join(ws.host, "first.png"))]);
  // Leave a stale continuation page behind, as a multi-page import would.
  writePng(path.join(ws.project, "reference", "reference-page-2.png"));

  runCli(ws.root, ["--project", "demo", "--file", writePng(path.join(ws.host, "second.png"), 60, 40)]);

  const files = fs.readdirSync(path.join(ws.project, "reference")).sort();
  assert.deepEqual(files, ["reference.png", "source.png"],
    "the reference folder no longer says which file the project is built from");
});

test("an unknown project is a named refusal that says how to create one", () => {
  const ws = workspace("noproject");
  const spawned = spawnSync(
    process.execPath,
    [CLI, "--root", ws.root, "--project", "absent", "--file", writePng(path.join(ws.host, "r.png"))],
    { encoding: "utf8" },
  );
  assert.equal(spawned.status, 3);
  assert.match(spawned.stderr, /init-workspace/);
});

test("an unsupported format is refused without destroying the reference it has", () => {
  // The replacement is destructive, and it used to run before the format check:
  // aiming a .docx at the command deleted the working reference and then failed,
  // so a user error cost the file it was aimed at.
  const ws = workspace("badformat");
  runCli(ws.root, ["--project", "demo", "--file", writePng(path.join(ws.host, "good.png"))]);

  const source = path.join(ws.host, "reference.docx");
  fs.writeFileSync(source, "not an image");
  const spawned = spawnSync(
    process.execPath,
    [CLI, "--root", ws.root, "--project", "demo", "--file", source],
    { encoding: "utf8" },
  );

  assert.equal(spawned.status, 2);
  assert.match(spawned.stderr, /unsupported reference format ".docx"/);
  assert.match(spawned.stderr, /\.pdf/);
  assert.deepEqual(
    fs.readdirSync(path.join(ws.project, "reference")).sort(),
    ["reference.png", "source.png"],
    "the refusal took the previous reference with it",
  );
});

test("a missing file is a usage error, not a half-written reference folder", () => {
  const ws = workspace("missing");
  const spawned = spawnSync(
    process.execPath,
    [CLI, "--root", ws.root, "--project", "demo", "--file", path.join(ws.host, "nope.png")],
    { encoding: "utf8" },
  );
  assert.equal(spawned.status, 2);
  assert.ok(
    !fs.existsSync(path.join(ws.project, "reference")),
    "the reference folder was created for an import that could not happen",
  );
});

test("usage errors are usage errors", () => {
  assert.equal(spawnSync(process.execPath, [CLI], { encoding: "utf8" }).status, 2);
  assert.equal(
    spawnSync(process.execPath, [CLI, "--project", "demo"], { encoding: "utf8" }).status,
    2,
  );
});

// --- the paths that need a toolchain -----------------------------------------

const jar = path.join(repoRoot, "tools", "preview-renderer", "target", "preview-renderer.jar");
const havePdfPath = fs.existsSync(jar) && spawnSync("java", ["-version"], { encoding: "utf8" }).status === 0;

test("a one-page pdf imports, rather than being refused as out of range", { skip: !havePdfPath }, () => {
  // The renderer's --page is a zero-based index; this passed the human number
  // straight through. A one-page PDF therefore asked for index 1 and was
  // refused outright — the single most ordinary case there is.
  const ws = workspace("onepagepdf");
  const single = pdfWithPages(1);
  if (!single) return; // no one-page PDF in this checkout

  const { status, parsed, output } = runCli(ws.root, ["--project", "demo", "--file", single]);
  assert.equal(status, 0, output);
  assert.equal(parsed.pages, 1);
  assert.deepEqual(parsed.files, ["reference.png"]);
});

test("page one of a multi-page pdf is the page that lands in reference.png", { skip: !havePdfPath }, () => {
  // The worse half of the same off-by-one: nothing failed, page TWO became the
  // reference, and every later measurement was taken against the wrong page.
  const ws = workspace("firstpage");
  const source = pdfWithPages(2);
  if (!source) return;

  runCli(ws.root, ["--project", "demo", "--file", source]);

  // The revision that produced the PDF also rasterised its own page 1. If the
  // import took the right page, the two are the same image.
  const revisionDir = path.dirname(source);
  const imported = PNG.sync.read(
    fs.readFileSync(path.join(ws.project, "reference", "reference.png")),
  );
  const pageOne = PNG.sync.read(fs.readFileSync(path.join(revisionDir, "output.png")));

  assert.equal(imported.width, pageOne.width, "the imported page is not page 1's size");
  assert.equal(imported.height, pageOne.height, "the imported page is not page 1's size");
  assert.ok(
    imported.data.equals(pageOne.data),
    "reference.png is not page 1 of the source — the page index is off again",
  );
});

test("a multi-page import tells the render how long the document is", { skip: !havePdfPath }, () => {
  // Rasterising the render is driven by `render.pages`, and importing a
  // multi-page reference used to leave it at one. Both sides then had page 1
  // and only the reference had the rest, so pages 2..N could not be compared
  // even once the diff learned how — there was nothing to compare them to.
  const ws = workspace("renderpages");
  const multi = multiPagePdf();
  if (!multi) return; // no multi-page PDF in this checkout

  const { status, parsed } = runCli(ws.root, ["--project", "demo", "--file", multi]);
  assert.equal(status, 0);
  assert.ok(parsed.pages > 1, `${multi} rasterised as ${parsed.pages} page(s)`);

  const project = projectOf(ws);
  assert.equal(project.referencePages, parsed.pages);
  assert.equal(project.render?.pages, parsed.pages, "the render was not told to produce them");
});


/** A PDF in this checkout with exactly `want` pages, asked of the renderer. */
function pdfWithPages(want) {
  const root = path.join(repoRoot, "examples");
  if (!fs.existsSync(root)) return null;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const revisions = path.join(root, entry.name, "revisions");
    if (!fs.existsSync(revisions)) continue;
    for (const rev of fs.readdirSync(revisions).sort()) {
      const pdf = path.join(revisions, rev, "output.pdf");
      if (!fs.existsSync(pdf)) continue;
      if (!fs.existsSync(path.join(revisions, rev, "output.png"))) continue;
      const run = spawnSync("java", ["-jar", jar, "text", "--pdf", pdf], { encoding: "utf8" });
      if (run.status !== 0) continue;
      try {
        if (JSON.parse(run.stdout).pageCount === want) return pdf;
      } catch {
        /* not this one */
      }
    }
  }
  return null;
}

test("a pdf is rasterised through the same PDFBox path the render loop uses", { skip: !havePdfPath }, () => {
  const ws = workspace("pdf");
  // Any PDF this repository already produces; the point is the conversion, not
  // which document it was.
  const anyPdf = fs
    .readdirSync(path.join(repoRoot, "examples"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .flatMap((e) => {
      const revisions = path.join(repoRoot, "examples", e.name, "revisions");
      if (!fs.existsSync(revisions)) return [];
      return fs
        .readdirSync(revisions)
        .map((r) => path.join(revisions, r, "output.pdf"))
        .filter((f) => fs.existsSync(f));
    })[0];
  if (!anyPdf) return; // nothing rendered in this checkout

  const { status, parsed } = runCli(ws.root, ["--project", "demo", "--file", anyPdf]);
  assert.equal(status, 0);
  assert.ok(parsed.pages >= 1);
  assert.ok(fs.existsSync(path.join(ws.project, "reference", "reference.png")));
  assert.equal(projectOf(ws).referenceSource, "reference/source.pdf");

  const raster = PNG.sync.read(fs.readFileSync(path.join(ws.project, "reference", "reference.png")));
  assert.ok(raster.width > 0 && raster.height > 0, "the rasterisation produced an empty image");
});
