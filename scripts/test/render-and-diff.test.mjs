#!/usr/bin/env node
/**
 * scripts/test/render-and-diff.test.mjs — one loop pass is one command, and
 * its exit code is the loop's verdict.
 *
 * The render itself needs Maven and a GraphCompose artifact, so these tests
 * run the composite with --skip-render against pre-made PNGs — which is also
 * a real mode (diff-and-verdict after an external render). What is asserted
 * is the plumbing that used to be three model turns and one shell improvisation:
 * the reference is scaled once and persisted, the evidence lands in the
 * revision, and the process exits with the verdict a skill branches on.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import zlib from "node:zlib";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(repoRoot, "scripts", "render-and-diff.mjs");

// The same pngjs the tool itself uses; the CI job builds visual-diff first.
const { PNG } = createRequire(path.join(repoRoot, "tools", "visual-diff", "package.json"))("pngjs");

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcrad-${label}-`));
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

function writePng(file, width, height, value) {
  const png = new PNG({ width, height });
  png.data.fill(value);
  for (let i = 3; i < png.data.length; i += 4) png.data[i] = 255;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}

/** A workspace with one revision that has a render and a differently-sized reference. */
function scenario({ verdict = "REVISE", withParent = false, label = "ws" } = {}) {
  const host = tempDir(label);
  const root = path.join(host, "graphcompose-flow");
  const project = path.join(root, "projects", "demo");
  const revision = path.join(project, "revisions", "revision-002");

  writeJson(path.join(root, "flow.config.json"), { schemaVersion: 1 });
  writeJson(path.join(project, "template-project.json"), {
    projectName: "demo",
    currentDraftRevisionId: "revision-002",
    currentApprovedRevisionId: null,
    schemaVersion: 1,
  });
  writeJson(path.join(revision, "revision.json"), {
    id: "revision-002",
    parentRevisionId: withParent ? "revision-001" : null,
    status: "DRAFT",
    userRequest: "demo",
    targetGraphComposeVersion: "2.2.0",
    skillPack: "skills/versions/graphcompose-2.2",
    createdAt: "2026-08-25T00:00:00.000Z",
    artifacts: { userRequest: "user-request.md" },
    schemaVersion: 1,
  });
  writeJson(path.join(revision, "visual-review.json"), {
    schemaVersion: 1,
    verdict,
    largestMismatch: verdict === "REVISE" ? "header-height" : undefined,
    // A READY verdict quotes the figure it rests on — see gate-metric-unquoted.
    // These pages are solid colour and scale to a 0-pixel diff (the assertion in
    // "a scaled reference of the same design diffs to nothing" fixes that), so
    // zero is the measurement here rather than a placeholder. A REVISE fixture
    // is mid-loop and is not asked for one.
    gate:
      verdict === "READY_FOR_APPROVAL"
        ? { kind: "visual-review", passed: true, metric: "diff: 0 px (0.000%)", pages: [{ page: 1, mismatchPixels: 0 }] }
        : undefined,
    mismatches:
      verdict === "REVISE"
        ? [{ id: "header-height", severity: "MAJOR", reason: "r", action: "a" }]
        : [],
  });

  if (withParent) {
    const parent = path.join(project, "revisions", "revision-001");
    writeJson(path.join(parent, "revision.json"), {
      id: "revision-001", parentRevisionId: null, status: "APPROVED", userRequest: "first",
      targetGraphComposeVersion: "2.2.0", skillPack: "skills/versions/graphcompose-2.2",
      createdAt: "2026-08-24T00:00:00.000Z", artifacts: { userRequest: "user-request.md" },
      schemaVersion: 1,
    });
    writePng(path.join(parent, "output.png"), 124, 175, 200);
  }

  // The render, and a reference at a DIFFERENT resolution — the normal case.
  writePng(path.join(revision, "output.png"), 124, 175, 200);
  writePng(path.join(project, "reference", "reference.png"), 102, 144, 200);

  return { root, project, revision };
}

function runCli(root, extra = []) {
  const spawned = spawnSync(
    process.execPath,
    [CLI, "--project", "demo", "--revision", "revision-002", "--root", root, "--skip-render", ...extra],
    { encoding: "utf8" },
  );
  let parsed = null;
  try {
    parsed = JSON.parse(spawned.stdout);
  } catch {
    /* text mode */
  }
  return { status: spawned.status, parsed, output: `${spawned.stdout ?? ""}${spawned.stderr ?? ""}` };
}

test("a pass with no review yet measures, says so, and forms no loop verdict", () => {
  // The order of a pass is render → measure → the reviewer judges → the loop
  // decides. Before this, the last step ran regardless and answered REVISE
  // with "no visual-review.json" and no focus — an exit code the skill told
  // the agent to branch on, carrying nothing.
  const s = scenario({ label: "unreviewed" });
  fs.rmSync(path.join(s.revision, "visual-review.json"));

  const { status, parsed } = runCli(s.root, ["--json"]);
  assert.equal(status, 2, "measured but unjudged is still 'keep going'");
  assert.equal(parsed.loop.verdict, "REVISE");
  assert.equal(parsed.loop.focus, "awaiting-review");
  assert.equal(parsed.loop.focusSource, "harness");
  assert.match(parsed.loop.next, /visual-review\.json/);
  assert.match(parsed.loop.next, /iterate-status/);
  // The measurement itself still happened.
  assert.ok(fs.existsSync(path.join(s.revision, "visual-diff-stats.json")));
  const verdictStep = parsed.steps.find((step) => step.name === "loop verdict");
  assert.match(verdictStep.detail, /awaiting review/);
});

test("against the parent, the comparison is exact: threshold 0", () => {
  // The parent gates are equality gates. pixelmatch's default 0.1 forgives a
  // shifted anti-aliased edge, which is right against a rasterised design and
  // wrong for two renders of the same renderer.
  const s = scenario({ label: "exact", withParent: true });
  // Parent and child differ by one faint pixel — under the default threshold
  // that is "no difference"; under the gate it is one.
  const png = fs.readFileSync(path.join(s.revision, "output.png"));
  const img = PNG.sync.read(png);
  const idx = (10 * img.width + 10) * 4;
  img.data[idx] = Math.max(0, img.data[idx] - 12);
  fs.writeFileSync(path.join(s.revision, "output.png"), PNG.sync.write(img));

  const { parsed } = runCli(s.root, ["--json", "--against", "parent"]);
  assert.equal(parsed.diff.against, "parent");
  assert.equal(parsed.diff.mismatchPx, 1, `a one-pixel change must count: ${JSON.stringify(parsed.diff)}`);
});

test("one call scales, diffs, writes the evidence and answers with the verdict", () => {
  const s = scenario({ label: "happy" });
  const { status, parsed } = runCli(s.root, ["--json"]);

  assert.equal(status, 2, "REVISE must exit 2, the code the loop branches on");
  assert.equal(parsed.loop.verdict, "REVISE");
  assert.equal(parsed.loop.focus, "header-height");
  assert.match(parsed.loop.next, /header-height/);

  // The evidence is in the revision, not in a terminal.
  assert.ok(fs.existsSync(path.join(s.revision, "diff.png")), "diff.png was not written");
  assert.ok(
    fs.existsSync(path.join(s.revision, "reference-scaled.png")),
    "the scaled reference was not persisted for later passes",
  );
  assert.equal(typeof parsed.diff.mismatchPx, "number");
});

test("the persisted scaled reference matches the render's dimensions", () => {
  // This is the step the serif run improvised with ImageMagick shell
  // arithmetic, leaving junk files in the user's project root.
  const s = scenario({ label: "scale" });
  runCli(s.root, ["--json"]);

  const scaled = PNG.sync.read(fs.readFileSync(path.join(s.revision, "reference-scaled.png")));
  assert.equal(scaled.width, 124);
  assert.equal(scaled.height, 175);
});

test("identical solid images diff to zero even across resolutions", () => {
  const s = scenario({ label: "zero" });
  const { parsed } = runCli(s.root, ["--json"]);
  assert.equal(parsed.diff.mismatchPx, 0, "scaling introduced phantom differences on a solid page");
});

test("READY_FOR_APPROVAL exits 0", () => {
  const s = scenario({ verdict: "READY_FOR_APPROVAL", label: "ready" });
  const { status, parsed } = runCli(s.root, ["--json"]);
  assert.equal(status, 0);
  assert.match(parsed.loop.next, /report to the user/);
});

test("the pass classifies the worst regions, so nothing has to remember to ask", () => {
  // `evidence.mjs` shipped a release before this and a create run invoked it
  // zero times — 43 ImageMagick calls and 26 hand-written patch scripts did the
  // work instead. The tool was not missing and the skill named it; nothing
  // produced its output, so nothing read it. Now the pass does.
  const s = scenario({ label: "evidence" });
  writeJson(path.join(s.revision, "visual-analysis.json"), {
    schemaVersion: 1,
    page: { pageCount: 1, sizePt: { width: 595.276, height: 841.89 } },
    regions: [
      { id: "header", label: "Masthead", page: 1, role: "band", bounds: { x: 0, y: 0, w: 1, h: 0.2 } },
      { id: "body", label: "Body", page: 1, role: "content", bounds: { x: 0, y: 0.2, w: 1, h: 0.6 } },
    ],
  });
  // A render that differs from the reference everywhere, so both regions carry
  // a measured difference to rank.
  writePng(path.join(s.revision, "output.png"), 124, 175, 60);

  const { parsed } = runCli(s.root, ["--json"]);

  assert.ok(parsed.evidence, "the pass produced no evidence block");
  assert.ok(parsed.evidence.packages.length > 0, "no region was classified");
  for (const pkg of parsed.evidence.packages) {
    assert.ok(pkg.region, "a package with no region");
    assert.ok(pkg.cause, `${pkg.region}: classified as nothing at all`);
  }

  // And on disk, where a later pass and the review can read it.
  const onDisk = JSON.parse(fs.readFileSync(path.join(s.revision, "evidence.json"), "utf8"));
  assert.ok(Array.isArray(onDisk), "evidence.json is not an array");
  assert.equal(onDisk.length, parsed.evidence.packages.length);
});

test("a pass with no regions to measure still completes, and says why", () => {
  // Evidence is a view of a comparison that already succeeded. A missing view
  // is not a reason to fail the pass.
  const s = scenario({ label: "no-regions" });
  const { parsed } = runCli(s.root, ["--json"]);

  const step = parsed.steps.find((entry) => entry.name === "evidence");
  assert.ok(step, "the evidence step did not run");
  assert.equal(step.ok, true);
  assert.match(step.detail, /no measured regions/);
});

test("--against parent uses the parent's render and never resamples it", () => {
  const s = scenario({ withParent: true, label: "parent" });
  const { status, parsed } = runCli(s.root, ["--against", "parent", "--json"]);

  assert.equal(status, 2, JSON.stringify(parsed?.steps));
  assert.equal(parsed.diff.against, "parent");
  // Same renderer, same size, same solid colour: exactly zero.
  assert.equal(parsed.diff.mismatchPx, 0);
});

test("--against parent without a parent is a named failure", () => {
  const s = scenario({ label: "orphan" });
  const { status, parsed } = runCli(s.root, ["--against", "parent", "--json"]);
  assert.equal(status, 1);
  const diffStep = parsed.steps.find((x) => x.name === "diff");
  assert.match(diffStep.error, /no parent/);
});

test("--skip-render with no render is a named failure, not a diff against nothing", () => {
  const s = scenario({ label: "norender" });
  fs.rmSync(path.join(s.revision, "output.png"));
  const { status, parsed } = runCli(s.root, ["--json"]);
  assert.equal(status, 1);
  // By name, not by index: steps are added ahead of this one over time, and a
  // positional assertion turns that into a failure about the wrong thing.
  assert.match(parsed.steps.find((x) => x.name === "render (skipped)").error, /no output\.png/);
});

/** Give a scenario a data spec with one href, and a render that may or may not carry it. */
function withLinks(s, { declared, rendered }) {
  writeJson(path.join(s.revision, "cv-data.json"), { contact: [{ value: "x", href: declared }] });
  const annots = rendered
    .map((t) => `<</Subtype /Link /A <</Type /Action /S /URI /URI (${t}) >> >>`)
    .join("\n");
  fs.writeFileSync(
    path.join(s.revision, "output.pdf"),
    Buffer.concat([
      Buffer.from("%PDF-1.7\n1 0 obj\n<</Filter /FlateDecode>>\nstream\n", "latin1"),
      zlib.deflateSync(Buffer.from(annots, "latin1")),
      Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1"),
    ]),
  );
  // The project's docKind decides which data file is read.
  const projectFile = path.join(s.project, "template-project.json");
  const project = JSON.parse(fs.readFileSync(projectFile, "utf8"));
  writeJson(projectFile, { ...project, docKind: "cv" });
}

test("a dead link downgrades READY_FOR_APPROVAL to REVISE", () => {
  // The pixel diff is zero and the reviewer said ready — and the href in the
  // data never reached the PDF. A link annotation has no pixels, so this is the
  // one defect the loop above is structurally unable to see.
  const s = scenario({ verdict: "READY_FOR_APPROVAL", label: "deadlink" });
  withLinks(s, { declared: "https://github.com/alexmorgan", rendered: [] });

  const { status, parsed } = runCli(s.root, ["--json"]);
  assert.equal(status, 2, "a template with a dead link is not ready for approval");
  assert.equal(parsed.loop.verdict, "REVISE");
  assert.equal(parsed.loop.focus, "dead-links");
  assert.equal(parsed.loop.focusSource, "link-integrity");
  assert.match(parsed.loop.next, /github\.com\/alexmorgan/);
  assert.equal(parsed.links.missing.length, 1);
});

test("live links leave a READY verdict alone", () => {
  const s = scenario({ verdict: "READY_FOR_APPROVAL", label: "livelink" });
  withLinks(s, {
    declared: "https://github.com/alexmorgan",
    rendered: ["https://github.com/alexmorgan"],
  });

  const { status, parsed } = runCli(s.root, ["--json"]);
  assert.equal(status, 0);
  assert.equal(parsed.loop.verdict, "READY_FOR_APPROVAL");
  assert.equal(parsed.links.missing.length, 0);
});

test("a dead link never overrides the focus of an already-revising pass", () => {
  // The reviewer picked the largest visual mismatch; the link is recorded and
  // waits its turn rather than jumping the queue.
  const s = scenario({ verdict: "REVISE", label: "bothwrong" });
  withLinks(s, { declared: "https://github.com/alexmorgan", rendered: [] });

  const { status, parsed } = runCli(s.root, ["--json"]);
  assert.equal(status, 2);
  assert.equal(parsed.loop.focus, "header-height");
  assert.equal(parsed.links.missing.length, 1, "still reported, just not promoted");
});

test("a revision with no data spec passes the link step without checking", () => {
  const s = scenario({ verdict: "READY_FOR_APPROVAL", label: "nolinks" });
  const { status, parsed } = runCli(s.root, ["--json"]);
  assert.equal(status, 0);
  assert.equal(parsed.links.checked, false);
  assert.ok(parsed.steps.find((x) => x.name === "links").ok);
});

test("usage errors are usage errors", () => {
  const bad = spawnSync(process.execPath, [CLI, "--project", "x"], { encoding: "utf8" });
  assert.equal(bad.status, 2);
  const badAgainst = spawnSync(
    process.execPath,
    [CLI, "--project", "x", "--revision", "r", "--against", "sideways"],
    { encoding: "utf8" },
  );
  assert.equal(badAgainst.status, 2);
});

// --- the overflow fixture is a fixture, not a preview --------------------------

test("a suffixed render writes only its own PDF and never the live preview", () => {
  // Two separate ways a fixture render could damage the pass it belongs to:
  // the debug pass and the page rasters write names WITHOUT the suffix, so
  // running them would overwrite the real render's artifacts; and current.pdf
  // is the file a person keeps open while they work, so pushing a thirty-row
  // overflow dataset into it would replace their document with a test input.
  //
  // Both are avoided by returning early, which is a shape a reader can break
  // by adding one line in the wrong place. Assert the shape, not the wording.
  const source = fs.readFileSync(path.join(repoRoot, "scripts", "lib", "render-runtime.mjs"), "utf8");

  // The predicate used to be declared twice under two names; there is one now.
  const branch = source.indexOf("if (fixtureRender) {");
  assert.ok(branch > 0, "the fixture branch is gone — this contract needs rewriting, not deleting");
  const returned = source.indexOf("return;", branch);
  assert.ok(returned > branch, "the fixture branch no longer returns early");

  const body = source.slice(branch, returned);
  assert.equal(
    /\blive\.[a-zA-Z]/.test(body),
    false,
    `a fixture render touches the live mirror: ${body.match(/\blive\.[a-zA-Z]+/g)?.join(", ")}`,
  );

  // And everything the clean pass does afterwards is genuinely after it.
  const after = source.slice(returned);
  for (const marker of ["output-debug", "live.update"]) {
    assert.ok(after.includes(marker), `${marker} moved above the fixture return`);
  }

  // The other half, which regressed once already: --pages was added to the
  // render call ABOVE this branch, so the continuation pages the early return
  // claims to skip were rasterised anyway and the line it prints became untrue.
  const renderCall = source.slice(0, branch);
  const pagesFlag = renderCall.lastIndexOf('"--pages"');
  assert.ok(pagesFlag > 0, "the render pass no longer asks for its pages at all");
  const guarded = renderCall.slice(Math.max(0, pagesFlag - 200), pagesFlag);
  assert.match(
    guarded,
    /fixtureRender \?/,
    "the fixture render asks for continuation pages it does not read, and then says it skipped them",
  );
});

// --- a reference longer than one page -----------------------------------------

/** Add continuation pages to a scenario, on either or both sides. */
function addPages(s, { reference = [], render = [] }) {
  for (const [page, value] of reference) {
    writePng(path.join(s.project, "reference", `reference-page-${page}.png`), 102, 144, value);
  }
  for (const [page, value] of render) {
    writePng(path.join(s.revision, `output-page-${page}.png`), 124, 175, value);
  }
}

test("every page of the reference is compared, not only the first", () => {
  // The gap this closes: import-reference has always rasterised page 2, the
  // renderer has always rasterised page 2, and nothing ever compared them.
  const s = scenario({ verdict: "READY_FOR_APPROVAL", label: "twopage" });
  addPages(s, { reference: [[2, 200]], render: [[2, 200]] });

  const { parsed } = runCli(s.root, ["--json"]);
  assert.equal(parsed.diff.referencePages, 2);
  assert.equal(parsed.diff.renderPages, 2);
  assert.deepEqual(parsed.diff.pages.map((p) => p.page), [1, 2]);
  assert.ok(
    fs.existsSync(path.join(s.revision, "diff-page-2.png")),
    "page 2 produced no diff image to look at",
  );
  assert.ok(
    fs.existsSync(path.join(s.revision, "reference-scaled-page-2.png")),
    "page 2's reference was never brought to size and persisted",
  );
});

test("a matching page 1 does not carry a broken page 2 to approval", () => {
  // The verdict is formed from page 1, because that is the diff every
  // downstream tool reads. On a proposal, page 1 is the cover.
  const s = scenario({ verdict: "READY_FOR_APPROVAL", label: "badpage2" });
  addPages(s, { reference: [[2, 200]], render: [[2, 10]] });

  const { status, parsed } = runCli(s.root, ["--json"]);
  assert.equal(parsed.diff.worstPage, 2);
  assert.equal(parsed.loop.verdict, "REVISE", "a page nobody looked at passed as ready");
  assert.equal(parsed.loop.focus, "page-2");
  assert.equal(parsed.loop.focusSource, "page-parity");
  assert.match(parsed.loop.next, /diff-page-2\.png/, "the reader is not told what to open");
  assert.equal(status, 2);
});

test("a page the render never produced is a named stop with the manifest fix in it", () => {
  // render.pages drives rasterisation and import-reference used to leave it at
  // one, so the render side had nothing for page 2 and the gap scored zero.
  const s = scenario({ verdict: "READY_FOR_APPROVAL", label: "missingpage" });
  addPages(s, { reference: [[2, 200], [3, 200]] });

  const { status, parsed } = runCli(s.root, ["--json"]);
  assert.deepEqual(parsed.diff.missingFromRender, [2, 3]);
  assert.equal(parsed.loop.verdict, "REVISE");
  assert.equal(parsed.loop.focus, "missing-pages");
  assert.match(parsed.loop.next, /render\.pages/, "the manifest field to change is not named");
  assert.equal(status, 2);
});

test("a render longer than its reference is reported without being condemned", () => {
  // A flowing document can legitimately run longer than the sample it was
  // rebuilt from; that is a fact for the reviewer, not a defect.
  const s = scenario({ verdict: "READY_FOR_APPROVAL", label: "longer" });
  addPages(s, { render: [[2, 200]] });

  const { status, parsed } = runCli(s.root, ["--json"]);
  assert.deepEqual(parsed.diff.extraInRender, [2]);
  assert.equal(parsed.loop.verdict, "READY_FOR_APPROVAL");
  assert.equal(status, 0);
});

test("a one-page document reports exactly what it always did", () => {
  // The common case must not grow a page list it has no use for, and the
  // top-level numbers stay where every consumer already reads them.
  const s = scenario({ verdict: "READY_FOR_APPROVAL", label: "onepage" });
  const { parsed } = runCli(s.root, ["--json"]);

  assert.equal(parsed.diff.referencePages, 1);
  assert.equal(parsed.diff.pages.length, 1);
  assert.equal(parsed.diff.pages[0].mismatchPx, parsed.diff.mismatchPx);
  assert.equal(parsed.loop.verdict, "READY_FOR_APPROVAL");
});

test("losing a page against the parent is not reported as a manifest problem", () => {
  // The two comparisons fail for different reasons and take different fixes.
  // Against the parent the manifest is not involved: the previous revision
  // produced that page and this one does not, which is the regression the
  // parent gate exists to catch. Naming render.pages sends the reader to the
  // wrong file entirely.
  const s = scenario({ verdict: "READY_FOR_APPROVAL", withParent: true, label: "lostpage" });
  writePng(path.join(s.project, "revisions", "revision-001", "output-page-2.png"), 124, 175, 200);

  const { parsed } = runCli(s.root, ["--against", "parent", "--json"]);

  assert.deepEqual(parsed.diff.missingFromRender, [2]);
  assert.equal(parsed.loop.focus, "missing-pages");
  assert.match(parsed.loop.next, /the parent revision has 2 page/);
  assert.ok(
    !/render\.pages/.test(parsed.loop.next),
    `a parent comparison was blamed on the manifest: ${parsed.loop.next}`,
  );
});

test("the worst page is the one furthest from its reference, not the biggest one", () => {
  // Pages are not obliged to be the same size, and a page with more pixels in
  // it will win a raw-count comparison while matching better than a small page
  // that is proportionally far worse.
  const s = scenario({ verdict: "READY_FOR_APPROVAL", label: "worstshare" });
  // Page 2 is small and completely wrong; page 3 is large and slightly wrong.
  writePng(path.join(s.project, "reference", "reference-page-2.png"), 20, 20, 200);
  writePng(path.join(s.revision, "output-page-2.png"), 20, 20, 10);
  writePng(path.join(s.project, "reference", "reference-page-3.png"), 400, 400, 200);
  writePng(path.join(s.revision, "output-page-3.png"), 400, 400, 200);

  const { parsed } = runCli(s.root, ["--json"]);
  const byPage = Object.fromEntries(parsed.diff.pages.map((p) => [p.page, p]));

  assert.equal(byPage[2].percent, 100, "page 2 was meant to be entirely wrong");
  assert.equal(byPage[3].percent, 0, "page 3 was meant to match");
  assert.equal(parsed.diff.worstPage, 2, "the biggest page won instead of the worst one");
});

// ----------------------------------------------- what a failed render says ---

/** Like runCli, but WITHOUT --skip-render, so the render step actually runs. */
function runCliRendering(root, extra = []) {
  const spawned = spawnSync(
    process.execPath,
    [CLI, "--project", "demo", "--revision", "revision-002", "--root", root, ...extra],
    { encoding: "utf8" },
  );
  return { status: spawned.status, output: `${spawned.stdout ?? ""}${spawned.stderr ?? ""}` };
}

test("a failed render exits non-zero, so the loop can gate on it", () => {
  // Every other test here passes --skip-render, so until now the render step's
  // failure path had no coverage at all. The audited run reported this as exiting
  // 0; it does not, and never did — that reading came from `echo $?` after a pipe,
  // which reports the pipe's last command. The contract is worth pinning anyway.
  const s = scenario({ label: "renderfail" });
  const { status } = runCliRendering(s.root);
  assert.equal(status, 1, "a failed render must not look like a successful pass");
});

test("a failed render surfaces the reason, not the chatter around it", () => {
  // What the audited run was actually shown, in full:
  //
  //     FAIL render
  //          render failed:
  //          [asset-resolver] cache HIT mdi:heart (svg) -> cf1179b29151
  //          [asset-resolver] icon "heart": mdi:heart (explicit) -> heart.svg
  //
  // Both lines are progress chatter. The compiler's complaint was in the output
  // and never reached the reader, so the run re-invoked render.mjs by hand to
  // find out what had happened — two extra turns on every failure.
  const s = scenario({ label: "renderwhy" });
  const { output } = runCliRendering(s.root);

  assert.match(output, /FAIL render/);
  assert.match(
    output,
    /templateClass is required/,
    `the reason did not survive into the summary:\n${output}`,
  );
  // `[workspace] …` is printed by every script on every run and matches an
  // error signature through its own path. It must not crowd out the reason.
  const reported = output.split("render failed:")[1] ?? "";
  assert.doesNotMatch(reported, /\[workspace\]/, "workspace chatter reached the excerpt");
});

// --- the page model outranks the focus ------------------------------------------

test("a page the render never produced is the focus even when the review already said REVISE", () => {
  // Before: the missing-page stop fired only on READY, so a proposal could
  // spend five REVISE passes aimed at a region while page 2 was never rendered.
  const s = scenario({ verdict: "REVISE", label: "missing-on-revise" });
  addPages(s, { reference: [[2, 200]] });
  const { status, parsed } = runCli(s.root, ["--json"]);
  assert.equal(status, 2);
  assert.equal(parsed.loop.focus, "missing-pages", JSON.stringify(parsed.loop));
  assert.equal(parsed.loop.focusSource, "page-parity");
  assert.match(parsed.loop.next, /render\.pages/);
});

test("a stretched reference with the page size unsettled is the focus, above everything", () => {
  const s = scenario({ verdict: "REVISE", label: "aspect-unsettled" });
  // A reference whose shape the render does not have: 6.6% off, well past 1%.
  writePng(path.join(s.project, "reference", "reference.png"), 102, 154, 200);
  const { status, parsed } = runCli(s.root, ["--json"]);
  assert.equal(status, 2);
  assert.ok((parsed.diff.aspectMismatchPages ?? []).length > 0, "the scenario should have stretched the reference");
  assert.equal(parsed.loop.focus, "page-size-unsettled", JSON.stringify(parsed.loop));
  assert.match(parsed.loop.next, /page-size\.mjs/);
});

test("once the page size is settled, a stretched reference no longer overrides the focus", () => {
  const s = scenario({ verdict: "REVISE", label: "aspect-settled" });
  writePng(path.join(s.project, "reference", "reference.png"), 102, 154, 200);
  const projectFile = path.join(s.project, "template-project.json");
  const project = JSON.parse(fs.readFileSync(projectFile, "utf8"));
  project.referenceGeometry = {
    verdict: "decided",
    aspect: 0.662,
    pageSize: { format: "custom", widthPt: 595, heightPt: 898, source: "user", decision: "keep the reference's proportions" },
  };
  fs.writeFileSync(projectFile, JSON.stringify(project, null, 2));
  const { parsed } = runCli(s.root, ["--json"]);
  assert.notEqual(parsed.loop.focus, "page-size-unsettled", JSON.stringify(parsed.loop));
});

// --- the furniture at the page's edges -------------------------------------------

test("a page number lower than the reference's turns READY into REVISE, named", () => {
  const s = scenario({ verdict: "READY_FOR_APPROVAL", label: "furniture" });
  // Same shape as the scenario's pair (aspects within 1%), with a dark band
  // near the bottom of each — the render's 20 rows lower.
  const draw = (file, w, h, bandY) => {
    const png = new PNG({ width: w, height: h });
    png.data.fill(255);
    for (let y = bandY; y < bandY + 4; y += 1) {
      for (let x = Math.round(w * 0.4); x < Math.round(w * 0.6); x += 1) {
        const i = (y * w + x) * 4;
        png.data[i] = 20; png.data[i + 1] = 20; png.data[i + 2] = 20;
      }
    }
    fs.writeFileSync(file, PNG.sync.write(png));
  };
  draw(path.join(s.project, "reference", "reference.png"), 510, 720, 650);
  draw(path.join(s.revision, "output.png"), 620, 875, 810 + 20);

  // These images are this test's own, so the scenario's quoted zero is no longer
  // the measurement. Take the real figure from a first pass and quote it, rather
  // than hardcoding a pixel count that every change to the scaling would break:
  // what is under test is the furniture defect, not the metric rules, and a
  // review that misquotes would be caught by those instead.
  const measured = runCli(s.root, ["--json"]).parsed.diff.mismatchPx;
  const reviewFile = path.join(s.revision, "visual-review.json");
  const review = JSON.parse(fs.readFileSync(reviewFile, "utf8"));
  review.gate.pages = [{ page: 1, mismatchPixels: measured }];
  review.gate.metric = `diff: ${measured} px`;
  fs.writeFileSync(reviewFile, JSON.stringify(review, null, 2));

  const { status, parsed } = runCli(s.root, ["--json"]);
  assert.equal(status, 2, JSON.stringify(parsed?.loop));
  assert.equal(parsed.loop.focus, "bottom-band-lower");
  assert.equal(parsed.loop.focusSource, "furniture");
  assert.match(parsed.loop.next, /lower in the render/);
  assert.ok(parsed.furniture.defects.length >= 1);
});

test("furniture where the reference has it leaves READY alone", () => {
  const s = scenario({ verdict: "READY_FOR_APPROVAL", label: "furniture-ok" });
  const draw = (file, w, h, bandY) => {
    const png = new PNG({ width: w, height: h });
    png.data.fill(255);
    for (let y = bandY; y < bandY + 4; y += 1) {
      for (let x = Math.round(w * 0.4); x < Math.round(w * 0.6); x += 1) {
        const i = (y * w + x) * 4;
        png.data[i] = 20; png.data[i + 1] = 20; png.data[i + 2] = 20;
      }
    }
    fs.writeFileSync(file, PNG.sync.write(png));
  };
  draw(path.join(s.project, "reference", "reference.png"), 510, 720, 650);
  draw(path.join(s.revision, "output.png"), 620, 875, 790);

  const { parsed } = runCli(s.root, ["--json"]);
  assert.deepEqual(parsed.furniture.defects, []);
  assert.notEqual(parsed.loop.focusSource, "furniture");
});

test("the harness's focus is written beside the review, and iterate-status reports the same focus", () => {
  const s = scenario({ verdict: "REVISE", label: "harness-focus" });
  addPages(s, { reference: [[2, 200]] });
  const { parsed } = runCli(s.root, ["--json"]);
  assert.equal(parsed.loop.focus, "missing-pages");
  const written = JSON.parse(fs.readFileSync(path.join(s.revision, "harness-focus.json"), "utf8"));
  assert.equal(written.focus, "missing-pages");
  assert.equal(written.focusSource, "page-parity");

  const status = spawnSync(
    process.execPath,
    [path.join(repoRoot, "scripts", "iterate-status.mjs"), "demo", "--root", s.root, "--json"],
    { encoding: "utf8" },
  );
  const parsedStatus = JSON.parse(status.stdout);
  assert.equal(parsedStatus.largestMismatch, "missing-pages", "the two commands must name one focus");
  assert.equal(parsedStatus.focusSource, "page-parity");

  // Once the page model closes, the file goes and the review's focus is back.
  addPages(s, { render: [[2, 200]] });
  const again = runCli(s.root, ["--json"]);
  assert.equal(again.parsed.loop.focus, "header-height");
  assert.ok(!fs.existsSync(path.join(s.revision, "harness-focus.json")));
});
