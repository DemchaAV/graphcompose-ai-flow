#!/usr/bin/env node
/**
 * scripts/test/bundle-portability.test.mjs — would this bundle work on someone
 * else's machine?
 *
 * A published bundle is the one artifact that leaves the harness, and the way
 * it fails elsewhere is quiet: the directory looks complete, the manifest
 * parses, the sources compile, and the first consumer to run it gets a missing
 * file whose path names a computer they have never used.
 *
 * The line this suite draws is between a path and a word. A path into
 * `revisions/` or a drive letter is broken for everyone but the publisher. The
 * word "revision-009" inside `template.json` is traceability the consumer
 * contract deliberately keeps — it is how a rendering service logs which
 * template produced a document. Getting that boundary wrong in either direction
 * makes the scan useless: too strict and it flags the metadata it was told to
 * preserve, too loose and it ships a bundle that resolves nowhere.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { blocking, formatFinding, known, scanPortability } from "../lib/bundle-portability.mjs";

function bundleWith(files, label = "scan") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcport-${label}-`));
  process.on("exit", () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, typeof contents === "string" ? contents : JSON.stringify(contents, null, 2), "utf8");
  }
  return dir;
}

const rulesOf = (findings) => [...new Set(findings.map((f) => f.rule))].sort();

test("a clean bundle reports nothing", () => {
  const dir = bundleWith({
    "template.json": { id: "acme", className: "T", docKind: "invoice", schemaVersion: "1.1.0" },
    "src/T.java": 'package com.acme;\npublic final class T { String a = "assets/logo.png"; }\n',
    "README.md": "# Acme\n\nEdit `invoice-data.json`.\n",
  });
  assert.deepEqual(scanPortability(dir), []);
});

test("an absolute path is blocking, on either platform's shape", () => {
  const windows = bundleWith({ "src/T.java": 'String p = "C:\\\\Dev\\\\projects\\\\logo.png";\n' }, "win");
  const posix = bundleWith({ "src/T.java": 'String p = "/Users/demch/logo.png";\n' }, "posix");

  assert.equal(rulesOf(blocking(scanPortability(windows)))[0], "absolute-path");
  assert.equal(rulesOf(blocking(scanPortability(posix)))[0], "absolute-path");
});

test("a path into the harness workspace or a revision folder is blocking", () => {
  const dir = bundleWith({
    "README.md": "See `graphcompose-flow/projects/cv/` and `examples/cv/revisions/revision-009/`.\n",
  });
  // In a README the *word* revision-009 is allowed traceability, and a *path*
  // through revisions/ still is not: the first is a fact about where this came
  // from, the second is a link that resolves on one machine.
  assert.deepEqual(rulesOf(blocking(scanPortability(dir))), ["revision-path", "workspace-path"]);
});

test("revision vocabulary is traceability in the manifest and a defect in code", () => {
  const dir = bundleWith({
    // Exactly what the consumer contract asks the publisher to record.
    "template.json": { id: "acme", sourceRevision: "revision-009", schemaVersion: "1.1.0" },
    "README.md": "Published from `cv-reference` at `revision-009`.\n",
    "src/T.java": "/** Published from revision-008. */\npublic final class T {}\n",
  });
  const found = blocking(scanPortability(dir));

  assert.equal(found.length, 1, "the manifest and README are where traceability belongs");
  assert.equal(found[0].rule, "revision-vocabulary");
  assert.equal(found[0].file, "src/T.java");
});

test("the property published providers read is known, not blocking", () => {
  // Real, scheduled, and not fixable without breaking every bundle already
  // published — so it is reported on every publish and stops nothing.
  const dir = bundleWith({
    "src/T.java": 'private static final String P = "graphcompose.revision.dir";\n',
  });
  const found = scanPortability(dir);

  assert.deepEqual(blocking(found), []);
  assert.equal(known(found).length, 1);
  assert.equal(known(found)[0].rule, "harness-property");
});

test("binary assets are not read, so bytes cannot be mistaken for a path", () => {
  const dir = bundleWith({
    "assets/icons/logo.png": "\u0089PNG\r\nC:\\Dev\\not-really-a-path",
    "preview/output.pdf": "%PDF /Users/someone",
  });
  assert.deepEqual(scanPortability(dir), []);
});

test("a finding names the file, the line and the text, so it can be acted on", () => {
  const dir = bundleWith({ "src/T.java": "public class T {}\n// see revisions/revision-003/notes.md\n" });
  const [finding] = blocking(scanPortability(dir));

  assert.equal(finding.file, "src/T.java");
  assert.equal(finding.line, 2);
  assert.match(finding.text, /revisions\/revision-003/);
  assert.match(formatFinding(finding), /^src\/T\.java:2 /);
});

test("skip leaves a rule out entirely, and does not quietly downgrade it", () => {
  const dir = bundleWith({ "src/T.java": '// C:\\Dev\\x.png and revisions/revision-001\n' });
  assert.deepEqual(rulesOf(scanPortability(dir)), ["absolute-path", "revision-path", "revision-vocabulary"]);
  assert.deepEqual(rulesOf(scanPortability(dir, { skip: ["absolute-path"] })), ["revision-path", "revision-vocabulary"]);
});

test("every bundle tracked in this repository is portable", () => {
  const repoRoot = path.resolve(import.meta.dirname, "..", "..");
  const templates = path.join(repoRoot, "templates");
  // Only the bundles git tracks. `templates/` in a clone of this repository is
  // also a live workspace, so it accumulates bundles that are someone's work in
  // progress; failing this suite over those would report a defect in the wrong
  // place.
  const tracked = ["invoice-classic", "mint-editorial-cv"];
  for (const id of tracked) {
    const findings = blocking(scanPortability(path.join(templates, id)));
    assert.deepEqual(
      findings.map(formatFinding),
      [],
      `${id} ships a path that resolves only where it was published`,
    );
  }
});
