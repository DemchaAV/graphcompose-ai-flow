#!/usr/bin/env node
/**
 * scripts/test/page-pairs.test.mjs — a reference can be longer than one page.
 *
 * `import-reference` has rasterised every page of a multi-page source since it
 * was written, and nothing downstream ever read past the first. The proof was
 * on disk: `examples/cv-reference` carries `reference-page-2.png`, its
 * revisions carry `output-page-2.png`, and no revision has ever held a diff
 * between the two. On a two-page CV that leaves half the document measured by
 * nobody; on the proposal or the book this exists for, almost all of it.
 *
 * What is asserted here is the pairing alone — which file is page N on each
 * side, and what it means when one side runs out first. Running the diff is the
 * composite's test.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  countReferencePages,
  countRenderPages,
  diffPageFile,
  pagePairs,
  referencePageFile,
  renderPageFile,
  scaledPageFile,
} from "../lib/page-pairs.mjs";

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcpp-${label}-`));
  process.on("exit", () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
  return dir;
}

const touch = (file) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "");
  return file;
};

/** A reference folder with `pages` pages, named the way import-reference names them. */
function reference(dir, pages) {
  if (pages >= 1) touch(path.join(dir, "reference.png"));
  for (let p = 2; p <= pages; p += 1) touch(path.join(dir, `reference-page-${p}.png`));
  return dir;
}

/** A revision folder with `pages` rendered pages, named the way the renderer names them. */
function render(dir, pages) {
  if (pages >= 1) touch(path.join(dir, "output.png"));
  for (let p = 2; p <= pages; p += 1) touch(path.join(dir, `output-page-${p}.png`));
  return dir;
}

// --- naming -------------------------------------------------------------------

test("page 1 keeps the names it has always had", () => {
  // Everything downstream reads these. Renaming them would be a migration in
  // exchange for symmetry nobody asked for.
  assert.equal(path.basename(referencePageFile("/ref", 1)), "reference.png");
  assert.equal(path.basename(renderPageFile("/rev", 1)), "output.png");
  assert.equal(path.basename(scaledPageFile("/rev", 1)), "reference-scaled.png");
  assert.equal(path.basename(diffPageFile("/rev", 1)), "diff.png");
});

test("continuation pages use the suffix the renderer already uses", () => {
  assert.equal(path.basename(referencePageFile("/ref", 3)), "reference-page-3.png");
  assert.equal(path.basename(renderPageFile("/rev", 3)), "output-page-3.png");
  assert.equal(path.basename(scaledPageFile("/rev", 3)), "reference-scaled-page-3.png");
  assert.equal(path.basename(diffPageFile("/rev", 3)), "diff-page-3.png");
});

test("the project's own answer for page 1 wins over the canonical name", () => {
  // Projects that predate import-reference name it something else, and the
  // manifest is the only place that knows.
  const declared = path.join("/proj", "reference", "scan-01.png");
  assert.equal(referencePageFile("/ref", 1, declared), declared);
  // Only page 1 — a declared image says nothing about the continuation pages.
  assert.equal(path.basename(referencePageFile("/ref", 2, declared)), "reference-page-2.png");
});

// --- counting -----------------------------------------------------------------

test("pages are counted from the files that exist, not from what a manifest claims", () => {
  // referencePages records the last import; a folder can be edited between
  // imports, and the count has to be true of the folder as it is now.
  const dir = reference(tempDir("count"), 4);
  assert.equal(countReferencePages(dir), 4);
});

test("counting stops at the first gap rather than skipping it", () => {
  // A missing page 3 with a page 4 present is a broken import, not a 4-page
  // reference; treating it as four would compare page 4 against page 3's render.
  const dir = reference(tempDir("gap"), 2);
  touch(path.join(dir, "reference-page-4.png"));
  assert.equal(countReferencePages(dir), 2);
});

test("no reference at all counts as no pages, not as one", () => {
  assert.equal(countReferencePages(tempDir("empty")), 0);
  assert.equal(countRenderPages(tempDir("empty2")), 0);
});

// --- pairing ------------------------------------------------------------------

test("a three-page reference against a three-page render pairs all three", () => {
  const projectDir = tempDir("three");
  const referenceDir = reference(path.join(projectDir, "reference"), 3);
  const revisionDir = render(path.join(projectDir, "revisions", "revision-001"), 3);

  const { pairs, referencePages, renderPages, missingFromRender, extraInRender } = pagePairs({
    referenceDir,
    revisionDir,
  });

  assert.equal(referencePages, 3);
  assert.equal(renderPages, 3);
  assert.deepEqual(pairs.map((p) => p.page), [1, 2, 3]);
  assert.deepEqual(missingFromRender, []);
  assert.deepEqual(extraInRender, []);
  assert.equal(path.basename(pairs[1].reference), "reference-page-2.png");
  assert.equal(path.basename(pairs[1].render), "output-page-2.png");
});

test("a page the render never produced is named, not skipped in silence", () => {
  // This is the state every multi-page project was in: render.pages left at 1,
  // so the render side had nothing for page 2 and the gap looked like a match.
  const projectDir = tempDir("short");
  const referenceDir = reference(path.join(projectDir, "reference"), 3);
  const revisionDir = render(path.join(projectDir, "revisions", "revision-001"), 1);

  const { pairs, missingFromRender } = pagePairs({ referenceDir, revisionDir });

  assert.deepEqual(pairs.map((p) => p.page), [1]);
  assert.deepEqual(missingFromRender, [2, 3], "the uncompared pages were not reported");
});

test("a render longer than its reference is reported, not judged", () => {
  // A document that flows can legitimately run longer than the sample it was
  // rebuilt from, so this is a fact for the reviewer rather than a defect.
  const projectDir = tempDir("long");
  const referenceDir = reference(path.join(projectDir, "reference"), 1);
  const revisionDir = render(path.join(projectDir, "revisions", "revision-001"), 3);

  const { pairs, extraInRender } = pagePairs({ referenceDir, revisionDir });

  assert.deepEqual(pairs.map((p) => p.page), [1]);
  assert.deepEqual(extraInRender, [2, 3]);
});

test("a parent comparison pairs the parent's pages, not the reference's", () => {
  // --against parent is a refactor check: the question is whether this render
  // still matches the previous one, page for page, and the reference is not
  // part of that question.
  const projectDir = tempDir("parent");
  reference(path.join(projectDir, "reference"), 5);
  const parentDir = render(path.join(projectDir, "revisions", "revision-001"), 2);
  const revisionDir = render(path.join(projectDir, "revisions", "revision-002"), 2);

  const { pairs, referencePages } = pagePairs({
    referenceDir: path.join(projectDir, "reference"),
    revisionDir,
    parentDir,
    against: "parent",
  });

  assert.equal(referencePages, 2, "the reference's five pages leaked into a parent comparison");
  assert.deepEqual(pairs.map((p) => p.page), [1, 2]);
  assert.ok(pairs[1].reference.includes("revision-001"), "page 2 did not come from the parent");
});

test("nothing to compare produces no pairs rather than an invented one", () => {
  const projectDir = tempDir("none");
  const { pairs, referencePages } = pagePairs({
    referenceDir: path.join(projectDir, "reference"),
    revisionDir: path.join(projectDir, "revisions", "revision-001"),
  });
  assert.deepEqual(pairs, []);
  assert.equal(referencePages, 0);
});

test("a missing directory is refused by name, not resolved against the process cwd", () => {
  // The guard here was `?? ""`, which is worse than no guard: an empty path
  // resolves against the working directory, so the count answered from whatever
  // files happened to be sitting there. And it only covered the count — the
  // pairing then threw `path.join(null, …)`, a Node type error naming neither
  // the caller nor the argument.
  assert.throws(
    () => pagePairs({ revisionDir: ".", against: "parent" }),
    /a parent comparison needs parentDir/,
  );
  assert.throws(
    () => pagePairs({ revisionDir: "." }),
    /needs referenceDir or referenceImage/,
  );
  assert.throws(() => pagePairs({ referenceDir: "/ref" }), /revisionDir is required/);
});

// --- rasterising the pages ------------------------------------------------------

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const jar = path.join(repoRoot, "tools", "preview-renderer", "target", "preview-renderer.jar");
const haveRenderer =
  fs.existsSync(jar) && spawnSync("java", ["-version"], { encoding: "utf8" }).status === 0;

test("the renderer writes every page in one JVM, named the way the pairing expects",
  { skip: !haveRenderer }, () => {
  // This used to be a process launch per continuation page, per pass, and again
  // for the debug render — 1.7s each against 0.22s of bare JVM startup. On a
  // two-page PDF: 3324ms as two launches, 1722ms as one, because the second
  // page costs about twenty milliseconds once the document is loaded.
  //
  // What matters for correctness is the naming: page 1 keeps the name it was
  // given and the rest land beside it as `<stem>-page-N.png`, which is exactly
  // what pagePairs looks for.
  const anyTwoPage = (() => {
    const root = path.join(repoRoot, "examples");
    if (!fs.existsSync(root)) return null;
    for (const project of fs.readdirSync(root)) {
      const revisions = path.join(root, project, "revisions");
      if (!fs.existsSync(revisions)) continue;
      for (const rev of fs.readdirSync(revisions)) {
        if (fs.existsSync(path.join(revisions, rev, "output-page-2.png"))) {
          const pdf = path.join(revisions, rev, "output.pdf");
          if (fs.existsSync(pdf)) return pdf;
        }
      }
    }
    return null;
  })();
  if (!anyTwoPage) return; // nothing multi-page in this checkout

  const out = path.join(tempDir("raster"), "output.png");
  const run = spawnSync(
    "java",
    ["-jar", jar, "preview", "--pdf", anyTwoPage, "--out", out, "--dpi", "72", "--page", "0", "--pages", "2"],
    { encoding: "utf8" },
  );
  assert.equal(run.status, 0, run.stderr);

  assert.ok(fs.existsSync(out), "page 1 was not written under the name it was given");
  const second = renderPageFile(path.dirname(out), 2);
  assert.ok(
    fs.existsSync(second),
    `page 2 is not where the pairing looks for it: ${path.basename(second)}`,
  );
  assert.equal(countRenderPages(path.dirname(out)), 2, "the pairing cannot count what was written");
});

test("asking for more pages than the document has stops at the end rather than failing",
  { skip: !haveRenderer }, () => {
  // `render.pages` is a declaration about the document. A render that came out
  // shorter is a fact for the caller to report — page-pairs already reports it
  // as missingFromRender — not a crash inside the rasteriser.
  const onePage = (() => {
    const root = path.join(repoRoot, "examples", "invoice-reference", "revisions");
    if (!fs.existsSync(root)) return null;
    for (const rev of fs.readdirSync(root)) {
      const pdf = path.join(root, rev, "output.pdf");
      if (fs.existsSync(pdf) && !fs.existsSync(path.join(root, rev, "output-page-2.png"))) return pdf;
    }
    return null;
  })();
  if (!onePage) return;

  const out = path.join(tempDir("overshoot"), "output.png");
  const run = spawnSync(
    "java",
    ["-jar", jar, "preview", "--pdf", onePage, "--out", out, "--dpi", "72", "--page", "0", "--pages", "5"],
    { encoding: "utf8" },
  );
  assert.equal(run.status, 0, `asking for five pages of a one-page document failed: ${run.stderr}`);
  assert.equal(countRenderPages(path.dirname(out)), 1);
});
