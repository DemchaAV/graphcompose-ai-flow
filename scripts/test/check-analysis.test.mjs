#!/usr/bin/env node
/**
 * scripts/test/check-analysis.test.mjs — the fan-out rejoins on validated
 * artifacts, not on files being present.
 *
 * ## Why the distinction is the whole point
 *
 * Create phase 2 produces three artifacts concurrently. A file exists the
 * moment its writer opens it, so a join on existence lets the architecture plan
 * read a half-written analysis, believe it, and plan around a document it has
 * only partly seen. Nothing downstream reports that: a plan built on incomplete
 * discovery still renders. It renders the wrong thing.
 *
 * Every case here is therefore a file that is *there* and not *done*.
 *
 * Run with the built-in runner (no dependencies):
 *
 *   node --test scripts/test/
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(repoRoot, "scripts", "check-analysis.mjs");

const temps = [];
process.on("exit", () => {
  for (const dir of temps) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcanalysis-${label}-`));
  temps.push(dir);
  return dir;
}

const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

/** A minimal analysis that validates, so each case can break exactly one thing. */
const GEOMETRY = {
  schemaVersion: 1,
  // Shaped from a real analysis: the schema requires the reference's own
  // pixel size and aspect, not just the page in points.
  page: {
    format: "A4",
    orientation: "portrait",
    referencePx: { width: 1054, height: 1492 },
    aspect: 1.41556,
    sizePt: { width: 595.276, height: 841.89 },
    sizeSource: "measured-standard",
    pageCount: 1,
  },
  regions: [
    { id: "page-background", label: "Page chrome", page: 1, role: "background", bounds: { x: 0, y: 0, w: 1, h: 1 } },
  ],
  flow: { kind: "fixed", overflowExpectation: "The page is the artifact." },
};
const REQUEST = { icons: [], fonts: [{ role: "body", family: "Helvetica", source: "standard14" }] };
const DATA = { name: "A Person", title: "Engineer" };

/** A workspace with one project and one revision, filled to order. */
function workspace(label, { geometry = GEOMETRY, data = DATA, request = REQUEST } = {}) {
  const host = tempDir(label);
  const root = path.join(host, "graphcompose-flow");
  const project = path.join(root, "projects", "demo");
  const revision = path.join(project, "revisions", "revision-001");

  writeJson(path.join(root, "flow.config.json"), { schemaVersion: 1 });
  writeJson(path.join(project, "template-project.json"), {
    id: "demo",
    displayName: "demo",
    docKind: "cv",
    targetGraphComposeVersion: "2.3.0",
    skillPack: "skills/versions/graphcompose-2.3",
    currentDraftRevisionId: "revision-001",
    currentApprovedRevisionId: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    schemaVersion: 1,
  });
  writeJson(path.join(revision, "revision.json"), {
    id: "revision-001",
    parentRevisionId: null,
    status: "DRAFT",
    userRequest: "make a cv",
    targetGraphComposeVersion: "2.3.0",
    skillPack: "skills/versions/graphcompose-2.3",
    createdAt: "2026-09-01T00:00:00.000Z",
    artifacts: { userRequest: "user-request.md" },
    schemaVersion: 1,
  });
  if (geometry !== null) writeJson(path.join(revision, "visual-analysis.json"), geometry);
  if (data !== null) writeJson(path.join(revision, "cv-data.json"), data);
  if (request !== null) writeJson(path.join(revision, "asset-request.json"), request);
  return { root, revision };
}

function check(root) {
  const run = spawnSync(process.execPath, [CLI, "--project", "demo", "--root", root, "--json"], {
    encoding: "utf8",
  });
  let parsed = null;
  try {
    parsed = JSON.parse(run.stdout);
  } catch {
    /* an error path */
  }
  return { status: run.status, parsed, out: `${run.stdout ?? ""}${run.stderr ?? ""}` };
}

const named = (parsed, name) => parsed.artifacts.find((a) => a.name === name);

test("three complete artifacts let the architecture plan start", () => {
  const { status, parsed, out } = check(workspace("complete").root);

  assert.equal(status, 0, out);
  assert.equal(parsed.complete, true);
  assert.equal(parsed.revision, "revision-001", "the draft was not resolved from the project");
  assert.ok(parsed.artifacts.every((a) => a.ok));
});

test("a geometry file that is there but does not validate holds the join", () => {
  // The case the whole check exists for: present, parseable, and missing the
  // regions every later stage addresses by id.
  const { root } = workspace("bad-geometry", { geometry: { schemaVersion: 1 } });
  const { status, parsed } = check(root);

  assert.equal(status, 1);
  assert.equal(parsed.complete, false);
  assert.equal(named(parsed, "visual-analysis.json").ok, false);
  assert.match(named(parsed, "visual-analysis.json").detail, /fails visual-analysis\.schema\.json/);
  assert.equal(named(parsed, "asset-request.json").ok, true, "one bad artifact must not condemn the others");
});

test("an asset request missing its required halves holds the join", () => {
  const { root } = workspace("bad-request", { request: { icons: [] } });
  const { status, parsed } = check(root);

  assert.equal(status, 1);
  assert.match(named(parsed, "asset-request.json").detail, /fails asset-request\.schema\.json/);
});

test("a data file that parsed and stayed empty is not done", () => {
  // An empty object is what a writer leaves when it opened the file and never
  // filled it — indistinguishable from finished if the join is on existence.
  const { root } = workspace("empty-data", { data: {} });
  const { status, parsed } = check(root);

  assert.equal(status, 1);
  assert.equal(named(parsed, "cv-data.json").ok, false);
  assert.match(named(parsed, "cv-data.json").detail, /empty/);
});

test("truncated JSON is reported as truncated, not as absent", () => {
  const { root, revision } = workspace("truncated");
  fs.writeFileSync(path.join(revision, "asset-request.json"), '{ "icons": [', "utf8");
  const { status, parsed } = check(root);

  assert.equal(status, 1);
  assert.match(named(parsed, "asset-request.json").detail, /not valid JSON/);
});

test("an artifact nobody has written yet says so plainly", () => {
  const { root } = workspace("missing", { request: null });
  const { status, parsed } = check(root);

  assert.equal(status, 1);
  assert.equal(named(parsed, "asset-request.json").detail, "not written yet");
});

test("the text report names what to re-run rather than what to work around", () => {
  const { root } = workspace("text", { data: {} });
  const run = spawnSync(process.execPath, [CLI, "--project", "demo", "--root", root], { encoding: "utf8" });

  assert.equal(run.status, 1);
  assert.match(run.stdout, /WAIT\s+cv-data\.json/);
  assert.match(run.stdout, /re-run what failed rather than planning around it/);
});
