#!/usr/bin/env node
/**
 * scripts/test/template-origin.test.mjs — a copied template is not this
 * project's template.
 *
 * The run these cover: with the analysis now bound to its reference, a run
 * wrote a genuine new analysis — measured containers and all, because the
 * schema made it — and then copied `generated-template.java` byte for byte out
 * of another project's revision. The measurements were made and reached no
 * code, and the two projects' diffs matched to four decimal places because it
 * was the same Java rendering the same data.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { describeForeignTwin, findForeignTwin } from "../lib/template-origin.mjs";

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

function workspace(label) {
  const host = fs.mkdtempSync(path.join(os.tmpdir(), `gctpl-${label}-`));
  temps.push(host);
  return path.join(host, "graphcompose-flow");
}

/**
 * Put a revision on disk with a template and a known opening time.
 *
 * `projects` is the directory the workspace keeps its projects in. It is
 * `projects/` for every workspace a user has, and `examples/` when the harness
 * resolves its own install as the workspace — which is the layout the tripwire
 * used to be blind to.
 */
function revision(root, project, id, { body, openedAt, name = "generated-template.java", projects = "projects" }) {
  const dir = path.join(root, projects, project, "revisions", id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "revision.json"), JSON.stringify({ id, createdAt: openedAt }));
  if (body !== null) fs.writeFileSync(path.join(dir, name), body);
  return path.join(dir, name);
}

const TEMPLATE = "class GeneratedCvTemplate { /* a thousand lines */ }\n";
const find = (root, projectId, templateFile, projects = "projects") =>
  findForeignTwin({ projectsDir: path.join(root, projects), projectId, templateFile });

/**
 * Does this filesystem hand back a directory under a casing nobody created?
 * Windows and macOS do; Linux does not. The two cases below describe a defect
 * that only exists on the first kind, so they ask rather than assume.
 */
function caseInsensitiveFs() {
  const probe = fs.mkdtempSync(path.join(os.tmpdir(), "gccase-"));
  temps.push(probe);
  fs.mkdirSync(path.join(probe, "Aa"));
  return fs.existsSync(path.join(probe, "aa"));
}

test("THE INCIDENT: a template copied from another project is caught", () => {
  const root = workspace("copied");
  revision(root, "nora-bennett-cv", "revision-004", { body: TEMPLATE, openedAt: "2026-09-06T16:00:00.000Z" });
  const copy = revision(root, "nora-bennett-cv-c2", "revision-001", {
    body: TEMPLATE,
    openedAt: "2026-09-06T18:00:00.000Z",
  });

  const twin = find(root, "nora-bennett-cv-c2", copy);
  assert.ok(twin, "the copy must be recognised");
  assert.equal(twin.project, "nora-bennett-cv");
  assert.equal(twin.revision, "revision-004");
  assert.match(describeForeignTwin(twin), /copied, not written from this project's analysis/);
  // The message has to leave room for the legitimate intent it resembles.
  assert.match(describeForeignTwin(twin), /use-template\.mjs/);
});

test("the ORIGINAL is not accused of copying from its own copy", () => {
  // Identity is symmetric: once the copy exists, each file is the other's twin.
  // Flagging both would stop the project that did nothing wrong from rendering.
  const root = workspace("original");
  const original = revision(root, "nora-bennett-cv", "revision-004", {
    body: TEMPLATE,
    openedAt: "2026-09-06T16:00:00.000Z",
  });
  revision(root, "nora-bennett-cv-c2", "revision-001", { body: TEMPLATE, openedAt: "2026-09-06T18:00:00.000Z" });

  assert.equal(find(root, "nora-bennett-cv", original), null);
});

test("a template carried forward inside one project is the loop working", () => {
  // pass.mjs copies the parent's sources into the next revision on purpose.
  const root = workspace("carry");
  revision(root, "demo", "revision-001", { body: TEMPLATE, openedAt: "2026-09-06T10:00:00.000Z" });
  const next = revision(root, "demo", "revision-002", { body: TEMPLATE, openedAt: "2026-09-06T11:00:00.000Z" });

  assert.equal(find(root, "demo", next), null);
});

test("a template edited after copying is not caught, and the module says so", () => {
  // Content identity is all this claims. An edited copy is out of reach, and
  // pretending otherwise would be worse than the honest gap.
  const root = workspace("edited");
  revision(root, "origin", "revision-001", { body: TEMPLATE, openedAt: "2026-09-06T10:00:00.000Z" });
  const edited = revision(root, "other", "revision-001", {
    body: `${TEMPLATE}// one more line\n`,
    openedAt: "2026-09-06T12:00:00.000Z",
  });

  assert.equal(find(root, "other", edited), null);
});

test("a differently-named template class is still recognised", () => {
  const root = workspace("named");
  revision(root, "origin", "revision-001", {
    body: TEMPLATE,
    openedAt: "2026-09-06T10:00:00.000Z",
    name: "NoraBennettCvTemplate.java",
  });
  const copy = revision(root, "other", "revision-001", { body: TEMPLATE, openedAt: "2026-09-06T12:00:00.000Z" });

  const twin = find(root, "other", copy);
  assert.ok(twin, "the canonical name and a class name are the same template");
  assert.equal(twin.project, "origin");
});

test("an undatable pair is still reported", () => {
  // A copy nobody can date is still a copy; silence would be the wrong default.
  const root = workspace("undated");
  const dir = path.join(root, "projects", "origin", "revisions", "revision-001");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "generated-template.java"), TEMPLATE);
  const copy = revision(root, "other", "revision-001", { body: TEMPLATE, openedAt: "2026-09-06T12:00:00.000Z" });

  assert.ok(find(root, "other", copy));
});

test("no template, no workspace, and a lone project are all quiet", () => {
  const root = workspace("quiet");
  const only = revision(root, "demo", "revision-001", { body: TEMPLATE, openedAt: "2026-09-06T10:00:00.000Z" });
  assert.equal(find(root, "demo", only), null, "nothing to compare against");
  assert.equal(find(root, "demo", path.join(path.dirname(only), "absent.java")), null);
  assert.equal(find(path.join(root, "nope"), "demo", only), null);
});

test("the tripwire is live where the harness keeps its own corpus", () => {
  // A workspace resolved in install mode keeps projects under `examples/`, not
  // `projects/`. The directory used to be re-derived as `<root>/projects`, so
  // the scan found nothing to scan and every project in the harness's own
  // corpus could copy freely — while these tests passed, because they built
  // the one layout the code could see.
  const root = workspace("install-mode");
  revision(root, "cv-reference", "revision-004", {
    body: TEMPLATE,
    openedAt: "2026-09-06T16:00:00.000Z",
    projects: "examples",
  });
  const copy = revision(root, "noir-corporate-cv", "revision-001", {
    body: TEMPLATE,
    openedAt: "2026-09-06T18:00:00.000Z",
    projects: "examples",
  });

  const twin = find(root, "noir-corporate-cv", copy, "examples");
  assert.ok(twin, "a copy inside examples/ is still a copy");
  assert.equal(twin.project, "cv-reference");
});

test("a project typed in the wrong case is not accused of copying itself", { skip: !caseInsensitiveFs() }, () => {
  // `--project Nora-Bennett-CV` opens `projects/nora-bennett-cv` on Windows and
  // macOS. Comparing the typed id against the directory listing skipped
  // nothing, so the project found its own parent revision — whose template
  // `pass` carries forward byte for byte — and the render died accusing the
  // author of a shortcut they had not taken.
  const root = workspace("mis-cased");
  revision(root, "nora-bennett-cv", "revision-001", { body: TEMPLATE, openedAt: "2026-09-06T10:00:00.000Z" });
  const mine = revision(root, "nora-bennett-cv", "revision-002", {
    body: TEMPLATE,
    openedAt: "2026-09-06T12:00:00.000Z",
  });

  assert.equal(find(root, "nora-bennett-cv", mine), null, "the correctly typed id was never the problem");
  assert.equal(find(root, "Nora-Bennett-CV", mine), null, "and the same project typed loudly is still the same project");
});
