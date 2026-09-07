#!/usr/bin/env node
/**
 * scripts/test/reference-fingerprint.test.mjs — is this analysis of THIS reference?
 *
 * The incident these cover: an agent asked to build from a new reference opened
 * a fresh project and copied another project's revision folder in. The analysis
 * that landed was byte-identical, the barrier passed, and discovery had never
 * run. Both projects carried the same id and the same reference bytes — only
 * the workspace differed — so the last case here is the one that reproduces it.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  compareFingerprint,
  computeFingerprint,
  referencePages,
  workspaceId,
} from "../lib/reference-fingerprint.mjs";

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

/** A workspace holding one project, with the given reference page bytes. */
function projectAt(label, { project = "demo", pages = { "reference.png": "REFERENCE-A" } } = {}) {
  const host = fs.mkdtempSync(path.join(os.tmpdir(), `gcfp-${label}-`));
  temps.push(host);
  const projectDir = path.join(host, "graphcompose-flow", "projects", project);
  fs.mkdirSync(path.join(projectDir, "reference"), { recursive: true });
  for (const [name, body] of Object.entries(pages)) {
    fs.writeFileSync(path.join(projectDir, "reference", name), body);
  }
  return { projectDir, projectId: project };
}

test("source.png is not part of the reference", () => {
  const { projectDir } = projectAt("source", {
    pages: { "reference.png": "A", "source.png": "the webp this came from" },
  });
  assert.deepEqual(referencePages(projectDir), ["reference.png"]);
});

test("multi-page references hash every page, in order", () => {
  const { projectDir } = projectAt("multi", {
    pages: { "reference.png": "A", "reference-2.png": "B" },
  });
  assert.deepEqual(referencePages(projectDir), ["reference-2.png", "reference.png"]);
  assert.equal(computeFingerprint({ projectDir, projectId: "demo" }).reference.pages.length, 2);
});

test("a project with no reference has no fingerprint, and that is not a failure", () => {
  const host = fs.mkdtempSync(path.join(os.tmpdir(), "gcfp-bare-"));
  temps.push(host);
  const projectDir = path.join(host, "graphcompose-flow", "projects", "demo");
  fs.mkdirSync(projectDir, { recursive: true });
  assert.equal(computeFingerprint({ projectDir, projectId: "demo" }), null);
  // Nothing to compare against is reported as such, never as a pass or a theft.
  const verdict = compareFingerprint(undefined, null);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.kind, "no-reference");
});

test("a fingerprint matches itself", () => {
  const { projectDir, projectId } = projectAt("match");
  const fp = computeFingerprint({ projectDir, projectId });
  const verdict = compareFingerprint(fp, computeFingerprint({ projectDir, projectId }));
  assert.equal(verdict.ok, true);
  assert.equal(verdict.kind, "match");
});

test("an analysis carrying no provenance is refused, with the command that fixes it", () => {
  const { projectDir, projectId } = projectAt("missing");
  const actual = computeFingerprint({ projectDir, projectId });
  for (const recorded of [undefined, null, "", 42]) {
    const verdict = compareFingerprint(recorded, actual);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.kind, "missing");
    assert.match(verdict.reason, /write-artifact\.mjs/);
  }
});

test("an analysis written for another project is refused", () => {
  const { projectDir, projectId } = projectAt("other-project");
  const actual = computeFingerprint({ projectDir, projectId });
  const foreign = { ...actual, project: "somebody-elses-cv" };
  const verdict = compareFingerprint(foreign, actual);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.kind, "foreign-project");
  assert.match(verdict.reason, /somebody-elses-cv/);
});

test("an analysis of a different image is refused", () => {
  const a = projectAt("img-a", { pages: { "reference.png": "REFERENCE-A" } });
  const b = projectAt("img-b", { pages: { "reference.png": "REFERENCE-B" } });
  const fpA = computeFingerprint(a);
  const fpB = computeFingerprint(b);
  assert.notEqual(fpA.reference.sha256, fpB.reference.sha256);

  // Same project id, same workspace shape — only the image differs.
  const verdict = compareFingerprint({ ...fpB, workspace: fpA.workspace }, fpA);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.kind, "foreign-reference");
});

test("THE INCIDENT: same project id, same reference bytes, different workspace", () => {
  // This is the case a fingerprint over the image — or over the image and the
  // project id — would have waved through, and it is the one that actually
  // happened. Both projects are "nora-bennett-cv"; both hold the same PNG.
  const origin = projectAt("origin", {
    project: "nora-bennett-cv",
    pages: { "reference.png": "THE SAME BYTES" },
  });
  const imported = projectAt("imported", {
    project: "nora-bennett-cv",
    pages: { "reference.png": "THE SAME BYTES" },
  });

  const fpOrigin = computeFingerprint(origin);
  const fpImported = computeFingerprint(imported);
  assert.equal(fpOrigin.project, fpImported.project, "same project id");
  assert.equal(fpOrigin.reference.sha256, fpImported.reference.sha256, "same reference bytes");
  assert.notEqual(fpOrigin.workspace, fpImported.workspace, "different workspace");

  // The origin's analysis, copied into the other workspace.
  const verdict = compareFingerprint(fpOrigin, fpImported);
  assert.equal(verdict.ok, false, "the copy must not pass");
  assert.equal(verdict.kind, "foreign-workspace");
  // A move and a theft look identical here, so the message has to name both.
  assert.match(verdict.reason, /discovery has not run here/);
  assert.match(verdict.reason, /moved or renamed/);
});

test("the workspace id is stable across separator and case differences", () => {
  // Windows hands the same directory back spelled several ways; the same tree
  // must not read as two workspaces.
  const host = fs.mkdtempSync(path.join(os.tmpdir(), "gcfp-case-"));
  temps.push(host);
  const a = path.join(host, "graphcompose-flow", "projects", "demo");
  const b = path.join(host, "graphcompose-flow", "..", "graphcompose-flow", "projects", "demo");
  fs.mkdirSync(a, { recursive: true });
  assert.equal(workspaceId(a), workspaceId(b));
  assert.match(workspaceId(a), /^[0-9a-f]{32}$/);
});

test("the workspace id does not leak the path it was made from", () => {
  const { projectDir } = projectAt("nopath");
  const id = workspaceId(projectDir);
  assert.doesNotMatch(id, /[\\/]/);
  assert.equal(id.length, 32);
});

test("the project id is the one on disk, not the one that was typed", () => {
  // `--project Nora-Bennett-CV` opens `projects/nora-bennett-cv` on Windows and
  // macOS. Stamping the typed casing and checking a differently-typed run of
  // the same project reported "foreign-project" — copy someone else's analysis
  // — for an analysis written from this project's own reference.
  const host = fs.mkdtempSync(path.join(os.tmpdir(), "gcfp-typed-"));
  temps.push(host);
  const projectDir = path.join(host, "graphcompose-flow", "projects", "nora-bennett-cv");
  fs.mkdirSync(path.join(projectDir, "reference"), { recursive: true });
  fs.writeFileSync(path.join(projectDir, "reference", "reference.png"), "REFERENCE-A");

  const asTyped = path.join(host, "graphcompose-flow", "projects", "Nora-Bennett-CV");
  if (!fs.existsSync(asTyped)) return; // case-sensitive filesystem: two projects, correctly.

  const stamped = computeFingerprint({ projectDir: asTyped, projectId: "Nora-Bennett-CV" });
  const checked = computeFingerprint({ projectDir, projectId: "nora-bennett-cv" });
  assert.equal(stamped.project, "nora-bennett-cv", "the name on disk decides");
  assert.equal(compareFingerprint(stamped, checked).kind, "match");
});
