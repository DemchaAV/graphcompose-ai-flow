#!/usr/bin/env node
/**
 * scripts/test/templates-catalog.test.mjs — one command answers "what is
 * published" and "how do I use it".
 *
 * The catalog exists so that reusing a template is lookup rather than
 * reconstruction: before it, answering "how do I use this bundle" meant opening
 * template.json, then a source to find the package, then data/ to find the
 * example, then the README for the dependencies. An agent that has to do that
 * has already read enough of the bundle to be tempted to rebuild it.
 *
 * Every case here is therefore about the output being *true* rather than about
 * it being pretty. The snippet naming a property the bundle does not read is
 * the failure this suite is most concerned with: it looks authoritative and
 * does not run.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(repoRoot, "scripts", "templates.mjs");

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gccat-${label}-`));
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

function run(root, argv = []) {
  const result = spawnSync(process.execPath, [CLI, "--root", root, ...argv], { encoding: "utf8" });
  return { status: result.status, out: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

/**
 * A workspace with one bundle, shaped however the case needs. `property` is the
 * JVM property its published provider reads — the thing the snippet has to get
 * right.
 */
function workspaceWith({ label, manifest, property = "graphcompose.template.dir", assets = [], data = true } = {}) {
  const root = path.join(tempDir(label), "graphcompose-flow");
  write(path.join(root, "flow.config.json"), { schemaVersion: 1 });
  const bundle = path.join(root, "templates", manifest.id);

  write(path.join(bundle, "template.json"), manifest);
  write(path.join(bundle, "README.md"), "# bundle\n");
  write(
    path.join(bundle, "src", `${manifest.className}.java`),
    `package com.acme.docs;\npublic final class ${manifest.className} {}\n`,
  );
  if (property) {
    write(
      path.join(bundle, "src", "AcmeSpecProvider.java"),
      `package com.acme.docs;\npublic final class AcmeSpecProvider {\n` +
        `  private static final String P = "${property}";\n}\n`,
    );
  }
  if (data) write(path.join(bundle, "data", `${manifest.docKind}-data.example.json`), { a: 1 });
  for (const rel of assets) write(path.join(bundle, "assets", rel), "x");
  write(path.join(bundle, "preview", "output-page-1.png"), "png");
  return { root, bundle };
}

const MANIFEST = {
  id: "acme-invoice",
  displayName: "Acme Invoice",
  version: "1.3.0",
  className: "AcmeInvoiceTemplate",
  entrypoint: {
    templateClass: "com.acme.docs.AcmeInvoiceTemplate",
    specClass: "com.acme.docs.AcmeInvoiceSpec",
    providerClass: "com.acme.docs.AcmeSpecProvider",
  },
  data: { example: "data/invoice-data.example.json", runtimeName: "invoice-data.json" },
  resources: { assets: "assets", manifest: null },
  docKind: "invoice",
  graphComposeVersion: "2.2.1",
  pageCount: 1,
  schemaVersion: "1.1.0",
  sourceProject: "acme-ref",
  sourceRevision: "revision-004",
  dependencies: { "io.github.demchaav:graph-compose": "2.2.1" },
};

// -------------------------------------------------------------------- list ---

test("the catalog lists what a consumer needs to choose between bundles", () => {
  const { root } = workspaceWith({ label: "list", manifest: MANIFEST });
  const { status, out } = run(root);

  assert.equal(status, 0);
  assert.match(out, /acme-invoice/);
  assert.match(out, /Acme Invoice · invoice · 1 page/);
  assert.match(out, /GraphCompose 2\.2\.1 · bundle 1\.3\.0/);
  assert.match(out, /from acme-ref revision-004/);
});

test("an empty workspace says so and points at how to publish, rather than failing", () => {
  const root = path.join(tempDir("empty"), "graphcompose-flow");
  write(path.join(root, "flow.config.json"), { schemaVersion: 1 });
  const { status, out } = run(root);

  assert.equal(status, 0, "having published nothing yet is not an error");
  assert.match(out, /no published bundles/);
  assert.match(out, /approve-and-publish/);
});

test("a bundle whose manifest is corrupt is reported, not allowed to hide the others", () => {
  const { root } = workspaceWith({ label: "broken", manifest: MANIFEST });
  write(path.join(root, "templates", "half-published", "template.json"), "{ not json");

  const { status, out } = run(root);
  assert.equal(status, 0);
  assert.match(out, /half-published/);
  assert.match(out, /UNREADABLE/);
  assert.match(out, /acme-invoice/, "one broken bundle must not suppress the working ones");
});

test("--json gives an agent the same answer without the prose", () => {
  const { root } = workspaceWith({ label: "json", manifest: MANIFEST });
  const { status, out } = run(root, ["--json"]);

  assert.equal(status, 0);
  const parsed = JSON.parse(out);
  assert.equal(parsed.templates.length, 1);
  assert.deepEqual(parsed.templates[0], {
    id: "acme-invoice",
    displayName: "Acme Invoice",
    version: "1.3.0",
    docKind: "invoice",
    graphComposeVersion: "2.2.1",
    pageCount: 1,
    sourceProject: "acme-ref",
    sourceRevision: "revision-004",
  });
});

// ----------------------------------------------------------------- inspect ---

test("inspect states the classes, the data rename and the assets", () => {
  const { root } = workspaceWith({
    label: "inspect",
    manifest: MANIFEST,
    assets: ["icons/mail.svg", "icons/phone.svg", "logo.png", "asset-request.json"],
  });
  const { status, out } = run(root, ["inspect", "acme-invoice"]);

  assert.equal(status, 0);
  assert.match(out, /template\s+com\.acme\.docs\.AcmeInvoiceTemplate/);
  assert.match(out, /provider\s+com\.acme\.docs\.AcmeSpecProvider/);
  assert.match(out, /data\/invoice-data\.example\.json\s+→\s+copy to invoice-data\.json/);
  assert.match(out, /2 \.svg/);
  assert.match(out, /1 \.png/);
  // The asset request is resolution input, not something the template draws.
  assert.ok(!/\.json/.test(out.slice(out.indexOf("Resources"), out.indexOf("Fonts"))), "asset-request.json was counted as an asset");
});

test("inspect reports the dependencies a build file needs, including the one the manifest omits", () => {
  const { root } = workspaceWith({
    label: "deps",
    manifest: { ...MANIFEST, dependencies: { graphcompose: "2.2.1" } },
  });
  const { out } = run(root, ["inspect", "acme-invoice"]);

  assert.match(out, /io\.github\.demchaav:graph-compose:2\.2\.1/);
  assert.match(
    out,
    /io\.github\.demchaav:graph-compose-fonts:1\.1\.0\s+\(not in the manifest; this line needs it\)/,
    "a 2.x bundle needs the fonts artifact, and a consumer copying the manifest would not know",
  );
});

test("the usage snippet names the property the bundle's own sources read", () => {
  const legacy = workspaceWith({
    label: "legacy-prop",
    manifest: { ...MANIFEST, id: "legacy-invoice" },
    property: "graphcompose.revision.dir",
  });
  const legacyOut = run(legacy.root, ["inspect", "legacy-invoice"]).out;
  assert.match(legacyOut, /setProperty\("graphcompose\.revision\.dir"/);
  assert.match(legacyOut, /reads the older property name/);

  const modern = workspaceWith({
    label: "modern-prop",
    manifest: { ...MANIFEST, id: "modern-invoice" },
    property: "graphcompose.template.dir",
  });
  const modernOut = run(modern.root, ["inspect", "modern-invoice"]).out;
  assert.match(modernOut, /setProperty\("graphcompose\.template\.dir"/);
  assert.ok(!/older property name/.test(modernOut));
});

test("a template with no provider gets a snippet that composes against the session alone", () => {
  const { root } = workspaceWith({
    label: "nospec",
    manifest: {
      ...MANIFEST,
      id: "static-report",
      docKind: "report",
      entrypoint: { templateClass: "com.acme.docs.AcmeInvoiceTemplate", specClass: null, providerClass: null },
      data: null,
    },
    property: null,
    data: false,
  });
  const { out } = run(root, ["inspect", "static-report"]);

  assert.match(out, /none — this template ships its content in Java/);
  assert.match(out, /new AcmeInvoiceTemplate\(\)\.compose\(session\);/);
  assert.ok(!/setProperty/.test(out), "there is no resource directory to point at");
});

test("inspect --json carries the machine-readable contract", () => {
  const { root } = workspaceWith({ label: "ijson", manifest: MANIFEST, assets: ["icons/a.svg"] });
  const parsed = JSON.parse(run(root, ["inspect", "acme-invoice", "--json"]).out);

  assert.equal(parsed.entrypoint.templateClass, "com.acme.docs.AcmeInvoiceTemplate");
  assert.equal(parsed.data.runtimeName, "invoice-data.json");
  assert.equal(parsed.resourceProperty, "graphcompose.template.dir");
  assert.deepEqual(parsed.assets, { total: 1, byExtension: { ".svg": 1 } });
  // The fonts artifact is backfilled, not declared: this manifest pins 2.2.1
  // and omits it, and a consumer copying the manifest verbatim would get a
  // project that compiles and fails at render.
  assert.deepEqual(parsed.dependencies, [
    { groupId: "io.github.demchaav", artifactId: "graph-compose", version: "2.2.1", backfilled: false },
    { groupId: "io.github.demchaav", artifactId: "graph-compose-fonts", version: "1.1.0", backfilled: true },
  ]);
});

test("an unknown template exits 3 and says where it looked", () => {
  const { root } = workspaceWith({ label: "missing", manifest: MANIFEST });
  const { status, out } = run(root, ["inspect", "no-such-template"]);

  assert.equal(status, 3);
  assert.match(out, /no published bundle "no-such-template"/);
  assert.match(out, /templates\.mjs/, "the error should say how to see what is there");
});

test("inspect without an id is a usage error, not an empty report", () => {
  const { root } = workspaceWith({ label: "noid", manifest: MANIFEST });
  const { status, out } = run(root, ["inspect"]);
  assert.equal(status, 2);
  assert.match(out, /needs a template id/);
});

test("every bundle in this repository inspects cleanly", () => {
  const result = spawnSync(process.execPath, [CLI, "--json"], { encoding: "utf8", cwd: repoRoot });
  assert.equal(result.status, 0);
  for (const entry of JSON.parse(result.stdout).templates) {
    assert.ok(!entry.error, `${entry.id}: ${entry.error}`);
    const one = spawnSync(process.execPath, [CLI, "inspect", entry.id, "--json"], { encoding: "utf8", cwd: repoRoot });
    assert.equal(one.status, 0, `inspect ${entry.id} exited ${one.status}`);
    const parsed = JSON.parse(one.stdout);
    assert.ok(parsed.entrypoint.templateClass, `${entry.id} has no template class`);
    assert.ok(
      parsed.dependencies.some((d) => d.artifactId === "graph-compose"),
      `${entry.id} reports no GraphCompose dependency`,
    );
  }
});
