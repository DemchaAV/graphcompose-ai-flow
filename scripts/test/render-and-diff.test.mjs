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
  writePng(path.join(project, "reference", "reference.png"), 102, 154, 200);

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
  assert.match(parsed.steps[0].error, /no output\.png/);
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
