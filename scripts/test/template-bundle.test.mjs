#!/usr/bin/env node
/**
 * scripts/test/template-bundle.test.mjs — a 1.0.0 bundle and a 1.1.0 bundle
 * read the same.
 *
 * The consumer contract (`entrypoint`, `data`, `resources`) landed after three
 * bundles were already published, so every consumer command has to work against
 * manifests that do not declare it. The guarantee this suite holds is that
 * `readManifest` erases the difference: a caller cannot tell which shape it got,
 * and never has a reason to branch on `schemaVersion`.
 *
 * The dependency cases are the ones that used to disagree in the wild —
 * `generatePom` expanded "jackson" one way and the README generator another.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_BUNDLE_VERSION,
  listBundles,
  normaliseDependencies,
  packageOf,
  readManifest,
} from "../lib/template-bundle.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcbundle-${label}-`));
  process.on("exit", () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
  return dir;
}

function write(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof contents === "string" ? contents : JSON.stringify(contents, null, 2), "utf8");
}

/**
 * A bundle in the pre-contract shape: flat class fields, shorthand dependency
 * keys, a legacy `dataFile`, and no entrypoint / data / resources block.
 */
function legacyBundle({ label = "legacy", withAssets = true } = {}) {
  const dir = path.join(tempDir(label), "mint-editorial-cv");
  write(path.join(dir, "template.json"), {
    id: "mint-editorial-cv",
    displayName: "Mint Editorial CV",
    sourceProject: "cv-reference",
    sourceRevision: "revision-009",
    sourceCommit: "b75db1e",
    className: "MintEditorialCvTemplate",
    specClass: "com.demcha.examples.cv.MintEditorialCvSpec",
    specProviderClass: "com.demcha.examples.cv.MintEditorialCvSpecProvider",
    dataFile: "data/cv-data.example.json",
    docKind: "cv",
    schemaVersion: "1.0.0",
    publishedAt: "2026-06-01T17:56:12.259Z",
    fonts: null,
    dependencies: { graphcompose: "1.6.7", jackson: "2.17.2" },
  });
  write(
    path.join(dir, "src", "MintEditorialCvTemplate.java"),
    "package com.demcha.examples.cv;\n\npublic final class MintEditorialCvTemplate {}\n",
  );
  write(path.join(dir, "data", "cv-data.example.json"), { name: "Ada" });
  write(path.join(dir, "preview", "output-page-1.png"), "png");
  write(path.join(dir, "preview", "output-page-2.png"), "png");
  if (withAssets) write(path.join(dir, "assets", "icons", "mail.svg"), "<svg/>");
  return dir;
}

test("a 1.0.0 manifest gets the consumer contract back-filled from disk", () => {
  const m = readManifest(legacyBundle());

  assert.equal(m.schemaVersion, "1.0.0");
  assert.equal(m.version, DEFAULT_BUNDLE_VERSION, "a manifest without `version` is 1.0.0, not undefined");

  assert.deepEqual(m.entrypoint, {
    templateClass: "com.demcha.examples.cv.MintEditorialCvTemplate",
    specClass: "com.demcha.examples.cv.MintEditorialCvSpec",
    providerClass: "com.demcha.examples.cv.MintEditorialCvSpecProvider",
  }, "the template FQCN comes from the package declared in src/<className>.java");

  assert.deepEqual(m.data, { example: "data/cv-data.example.json", runtimeName: "cv-data.json" });
  assert.deepEqual(m.resources, { assets: "assets", manifest: null });
  assert.equal(m.pageCount, 2);
  assert.equal(m.graphComposeVersion, "1.6.7", "lifted out of the shorthand dependency key");
});

test("a 1.1.0 manifest is taken verbatim, never re-derived", () => {
  const dir = path.join(tempDir("modern"), "northline-proposal");
  write(path.join(dir, "template.json"), {
    id: "northline-proposal",
    displayName: "Northline Proposal",
    version: "1.2.0",
    className: "NorthlineProposalTemplate",
    entrypoint: {
      templateClass: "com.acme.proposal.NorthlineProposalTemplate",
      specClass: "com.acme.proposal.NorthlineProposalSpec",
      providerClass: "com.acme.proposal.NorthlineProposalSpecProvider",
    },
    data: { example: "data/proposal-data.example.json", runtimeName: "proposal-data.json" },
    resources: { assets: "assets", manifest: "assets-manifest.json" },
    docKind: "proposal",
    graphComposeVersion: "2.2.1",
    pageCount: 3,
    schemaVersion: "1.1.0",
    dependencies: { "io.github.demchaav:graph-compose": "2.2.1" },
  });
  // Deliberately no src/, no data/, no preview/: a declared contract must not be
  // second-guessed against the filesystem, or a bundle staged for copy would
  // read as broken halfway through the copy.
  const m = readManifest(dir);

  assert.equal(m.version, "1.2.0");
  assert.equal(m.entrypoint.templateClass, "com.acme.proposal.NorthlineProposalTemplate");
  assert.equal(m.data.runtimeName, "proposal-data.json");
  assert.equal(m.resources.manifest, "assets-manifest.json");
  assert.equal(m.pageCount, 3);
  assert.equal(m.graphComposeVersion, "2.2.1");
});

test("an explicit null is an answer, not an absent field", () => {
  const dir = path.join(tempDir("hardcoded"), "static-report");
  write(path.join(dir, "template.json"), {
    id: "static-report",
    displayName: "Static Report",
    className: "StaticReportTemplate",
    docKind: "report",
    data: null,
    resources: null,
    schemaVersion: "1.1.0",
    dependencies: { "io.github.demchaav:graph-compose": "2.2.1" },
  });
  // The data file and the assets exist on disk; the manifest says the template
  // does not use them. A template that ships hard-coded content is a real shape,
  // and deriving over the top of `null` would make a consumer copy a data file
  // that nothing reads.
  write(path.join(dir, "data", "report-data.example.json"), { unused: true });
  write(path.join(dir, "assets", "icons", "x.svg"), "<svg/>");

  const m = readManifest(dir);
  assert.equal(m.data, null);
  assert.equal(m.resources, null);
});

test("a bundle with no data file and no assets reports neither", () => {
  const dir = path.join(tempDir("bare"), "invoice-classic");
  write(path.join(dir, "template.json"), {
    id: "invoice-classic",
    displayName: "Invoice Classic",
    className: "InvoiceClassicTemplate",
    docKind: "invoice",
    schemaVersion: "1.0.0",
    dependencies: { graphcompose: "1.6.7" },
  });
  write(
    path.join(dir, "src", "InvoiceClassicTemplate.java"),
    "package com.demcha.examples.invoice;\npublic final class InvoiceClassicTemplate {}\n",
  );

  const m = readManifest(dir);
  assert.equal(m.data, null, "no data file on disk means no data contract to state");
  assert.equal(m.resources, null);
  assert.equal(m.pageCount, null, "no preview at all is null, not 0");
});

test("the older single-page preview counts as one page", () => {
  const dir = path.join(tempDir("onepage"), "olive-curve-invoice");
  write(path.join(dir, "template.json"), {
    id: "olive-curve-invoice",
    displayName: "Olive Curve Invoice",
    className: "OliveCurveInvoiceTemplate",
    docKind: "invoice",
    schemaVersion: "1.0.0",
    dependencies: { graphcompose: "1.6.7" },
  });
  write(path.join(dir, "preview", "output.png"), "png");
  assert.equal(readManifest(dir).pageCount, 1);
});

test("dependency shorthand expands to coordinates that resolve", () => {
  const list = normaliseDependencies({
    graphcompose: "2.2.1",
    "graphcompose-fonts": "1.1.0",
    jackson: "2.17.2",
    "com.example:thing": "1.0.0",
  });

  assert.deepEqual(
    list.map((d) => `${d.coordinate}:${d.version}`),
    [
      "io.github.demchaav:graph-compose:2.2.1",
      "io.github.demchaav:graph-compose-fonts:1.1.0",
      "com.fasterxml.jackson.core:jackson-databind:2.17.2",
      "com.example:thing:1.0.0",
    ],
    "insertion order is preserved so a generated pom does not churn",
  );
  assert.ok(list.every((d) => !d.assumedGroupId), "every key here is either a coordinate or known shorthand");
});

test("an unknown shorthand key is flagged rather than guessed into graph-compose", () => {
  const [dep] = normaliseDependencies({ "some-new-artifact": "3.0.0" });
  assert.equal(dep.artifactId, "some-new-artifact");
  assert.equal(dep.assumedGroupId, true);
});

test("a dependency declared without a version reads as null, not as a string", () => {
  const [dep] = normaliseDependencies({ "com.example:managed": null });
  assert.equal(dep.version, null);
});

test("packageOf ignores the word package in prose", () => {
  const dir = tempDir("pkg");
  const file = path.join(dir, "T.java");
  write(file, "/**\n * This package holds the template.\n */\npackage com.real.pkg;\n\npublic class T {}\n");
  assert.equal(packageOf(file), "com.real.pkg");
});

test("readManifest refuses a directory that is not a bundle", () => {
  const dir = tempDir("empty");
  assert.throws(() => readManifest(dir), /not a published bundle/);
});

test("listBundles skips directories without a manifest and never throws", () => {
  const root = tempDir("catalog");
  write(path.join(root, "scratch", "notes.txt"), "in progress");
  write(path.join(root, "broken", "template.json"), "{ not json");
  write(path.join(root, "good", "template.json"), {
    id: "good",
    displayName: "Good",
    className: "GoodTemplate",
    docKind: "cv",
    schemaVersion: "1.1.0",
    dependencies: { "io.github.demchaav:graph-compose": "2.2.1" },
  });

  const found = listBundles(root);
  assert.deepEqual(found.map((b) => b.id), ["broken", "good"], "scratch/ has no manifest and is not a bundle");
  assert.equal(found[0].manifest, null);
  assert.match(found[0].error, /not valid JSON/);
  assert.equal(found[1].manifest.id, "good");
});

test("every bundle published in this repository reads through the normaliser", () => {
  const bundles = listBundles(path.join(repoRoot, "templates"));
  assert.ok(bundles.length > 0, "no bundles found — this test would otherwise pass vacuously");
  for (const bundle of bundles) {
    assert.equal(bundle.error, null, `${bundle.id}: ${bundle.error}`);
    const m = bundle.manifest;
    assert.ok(m.entrypoint.templateClass, `${bundle.id} has no resolvable template class`);
    assert.ok(m.docKind, `${bundle.id} declares no docKind`);
    assert.ok(
      m.dependencyList.some((d) => d.coordinate === "io.github.demchaav:graph-compose"),
      `${bundle.id} declares no GraphCompose dependency`,
    );
    assert.ok(m.graphComposeVersion, `${bundle.id} has no resolvable GraphCompose version`);
  }
});
