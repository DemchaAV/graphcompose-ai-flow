#!/usr/bin/env node
/**
 * scripts/test/bundle-project.test.mjs — a bundle becomes a buildable project
 * without anyone deciding anything.
 *
 * The functions under test used to be private to verify-published-template.mjs,
 * where they were exercised only through a Maven build. That made the cheap
 * failures — a dependency the manifest omits, a placeholder nothing replaced, a
 * data file staged under its example name — cost a full compile to find, and in
 * CI they were never found at all, because the build tier does not run there.
 *
 * These are the assertions that do not need a toolchain. The ones that do —
 * that the generated project actually compiles and renders — stay in
 * `npm run verify`, which has Maven.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  copyTree,
  fontsVersionFor,
  generateConsumerReadme,
  generateMainClass,
  generatePom,
  resolveDependencies,
  stageResources,
  stageSources,
} from "../lib/bundle-project.mjs";
import { readManifest } from "../lib/template-bundle.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcproj-${label}-`));
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

/** A bundle on disk, at whichever manifest shape the case needs. */
function bundle({ label, manifest, sources = {}, files = {} }) {
  const dir = path.join(tempDir(label), manifest.id);
  write(path.join(dir, "template.json"), manifest);
  for (const [name, body] of Object.entries(sources)) write(path.join(dir, "src", name), body);
  for (const [rel, body] of Object.entries(files)) write(path.join(dir, rel), body);
  return dir;
}

const CV_MANIFEST = {
  id: "mint-editorial-cv",
  displayName: "Mint Editorial CV",
  version: "1.0.0",
  className: "MintEditorialCvTemplate",
  entrypoint: {
    templateClass: "com.demcha.examples.cv.MintEditorialCvTemplate",
    specClass: "com.demcha.examples.cv.MintEditorialCvSpec",
    providerClass: "com.demcha.examples.cv.MintEditorialCvSpecProvider",
  },
  data: { example: "data/cv-data.example.json", runtimeName: "cv-data.json" },
  resources: { assets: "assets", manifest: "assets-manifest.json" },
  docKind: "cv",
  graphComposeVersion: "2.2.1",
  schemaVersion: "1.1.0",
  dependencies: {
    "io.github.demchaav:graph-compose": "2.2.1",
    "io.github.demchaav:graph-compose-fonts": "1.1.0",
    "com.fasterxml.jackson.core:jackson-databind": "2.17.2",
  },
};

// ------------------------------------------------------------ dependencies ---

test("both dependency key shapes reach the pom as resolvable coordinates", () => {
  const modern = generatePom({ id: "x", dependencies: { "io.github.demchaav:graph-compose": "2.2.1" } });
  assert.match(modern, /<groupId>io\.github\.demchaav<\/groupId>\s*<artifactId>graph-compose<\/artifactId>/);

  // The shorthand three bundles on disk still use. "jackson" expanding to
  // io.github.demchaav:jackson is the defect this consolidation removed.
  const legacy = generatePom({ id: "x", dependencies: { graphcompose: "1.6.7", jackson: "2.17.2" } });
  assert.match(legacy, /<artifactId>graph-compose<\/artifactId>\s*<version>1\.6\.7<\/version>/);
  assert.match(
    legacy,
    /<groupId>com\.fasterxml\.jackson\.core<\/groupId>\s*<artifactId>jackson-databind<\/artifactId>/,
  );
  assert.ok(!legacy.includes("io.github.demchaav</groupId>\n      <artifactId>jackson"), "jackson landed in the wrong group");
});

test("a dependency with no version falls back to RELEASE rather than emitting an empty tag", () => {
  const pom = generatePom({ id: "x", dependencies: { "com.example:thing": null } });
  assert.match(pom, /<artifactId>thing<\/artifactId>\s*<version>RELEASE<\/version>/);
});

test("a 2.x bundle whose manifest omits the fonts artifact still gets it", () => {
  // The failure this backfills around: a manifest written before the publisher
  // read the real runner pom lists graphcompose and jackson only, so the
  // generated project compiled and then failed at render with "Bundled font
  // resource not found" — which reads like a template bug and is not one.
  const deps = resolveDependencies({ dependencies: { graphcompose: "2.2.1" } });
  const fonts = deps.find((d) => d.artifactId === "graph-compose-fonts");
  assert.ok(fonts, "a 2.x line needs the fonts artifact and the manifest did not say so");
  assert.equal(fonts.version, "1.1.0");
  assert.equal(fonts.backfilled, true, "a backfilled coordinate must be distinguishable from a declared one");
});

test("a pre-1.8 bundle is left alone, because its fonts are inside the core artifact", () => {
  const deps = resolveDependencies({ dependencies: { graphcompose: "1.6.7", jackson: "2.17.2" } });
  assert.deepEqual(deps.map((d) => d.artifactId), ["graph-compose", "jackson-databind"]);
});

test("a manifest that already declares the fonts artifact is not given a second one", () => {
  const deps = resolveDependencies({ dependencies: CV_MANIFEST.dependencies });
  assert.equal(deps.filter((d) => d.artifactId === "graph-compose-fonts").length, 1);
});

test("fontsVersionFor maps the line, and refuses to guess at nonsense", () => {
  assert.equal(fontsVersionFor("1.6.7"), null);
  assert.equal(fontsVersionFor("1.8.0"), "1.1.0");
  assert.equal(fontsVersionFor("2.2.1"), "1.1.0");
  assert.equal(fontsVersionFor(null), null);
  assert.equal(fontsVersionFor("not-a-version"), null);
});

test("the exec plugin appears only when there is a class to exec", () => {
  assert.ok(!generatePom(CV_MANIFEST).includes("exec-maven-plugin"), "a staged bundle has no runner to exec");
  assert.match(generatePom(CV_MANIFEST, { mainClass: "Main" }), /<mainClass>Main<\/mainClass>/);
});

// ----------------------------------------------------------------- staging ---

test("sources are staged at their own package, so the tree compiles unmodified", () => {
  const dir = bundle({
    label: "stage",
    manifest: CV_MANIFEST,
    sources: {
      "MintEditorialCvTemplate.java": "package com.demcha.examples.cv;\npublic final class MintEditorialCvTemplate {}\n",
      "MintEditorialCvSpec.java": "package com.demcha.examples.cv;\npublic record MintEditorialCvSpec() {}\n",
    },
  });
  const project = tempDir("proj");

  const staged = stageSources(dir, project, { className: CV_MANIFEST.className });
  assert.equal(staged.package, "com.demcha.examples.cv");
  assert.deepEqual(staged.files, ["MintEditorialCvSpec.java", "MintEditorialCvTemplate.java"]);
  assert.ok(
    fs.existsSync(path.join(project, "src", "main", "java", "com", "demcha", "examples", "cv", "MintEditorialCvTemplate.java")),
  );
});

test("a bundle in the default package is staged at the source root, not under a directory named null", () => {
  const dir = bundle({
    label: "defaultpkg",
    manifest: { ...CV_MANIFEST, className: "T" },
    sources: { "T.java": "public final class T {}\n" },
  });
  const project = tempDir("proj-default");
  const staged = stageSources(dir, project, { className: "T" });
  assert.equal(staged.package, null);
  assert.ok(fs.existsSync(path.join(project, "src", "main", "java", "T.java")));
});

test("the example data is staged under its runtime name, which is the whole contract", () => {
  const dir = bundle({
    label: "resources",
    manifest: CV_MANIFEST,
    files: {
      "data/cv-data.example.json": { name: "Ada" },
      "assets/icons/mail.svg": "<svg/>",
      "assets-manifest.json": { icons: {} },
    },
  });
  const stage = path.join(tempDir("stage-out"), "template");

  const staged = stageResources(dir, stage, readManifest(dir));
  assert.deepEqual(staged, { data: "cv-data.json", assets: "assets", manifest: "assets-manifest.json" });
  // The rename is not cosmetic: a provider looks for cv-data.json and would not
  // find cv-data.example.json sitting beside it.
  assert.ok(fs.existsSync(path.join(stage, "cv-data.json")));
  assert.ok(!fs.existsSync(path.join(stage, "cv-data.example.json")));
  assert.ok(fs.existsSync(path.join(stage, "assets", "icons", "mail.svg")));
  assert.ok(fs.existsSync(path.join(stage, "assets-manifest.json")));
});

test("a bundle with no data and no assets stages nothing and reports nothing", () => {
  const dir = bundle({
    label: "bare",
    manifest: { ...CV_MANIFEST, data: null, resources: null },
  });
  const stage = path.join(tempDir("stage-bare"), "template");
  assert.deepEqual(stageResources(dir, stage, readManifest(dir)), { data: null, assets: null, manifest: null });
  assert.deepEqual(fs.readdirSync(stage), [], "an empty stage should not gain invented files");
});

// ------------------------------------------------------------------ runner ---

test("the generated runner substitutes every placeholder", () => {
  const main = generateMainClass({ ...CV_MANIFEST, bundleDir: "." });
  assert.ok(!/\$\{/.test(main), `an unsubstituted placeholder survived:\n${main}`);
});

test("the runner calls the template with the spec its provider loads", () => {
  const main = generateMainClass({ ...CV_MANIFEST, bundleDir: "." }, { templateDir: "template", outputFile: "output/cv.pdf" });

  assert.match(main, /com\.demcha\.examples\.cv\.MintEditorialCvSpec spec =\s*com\.demcha\.examples\.cv\.MintEditorialCvSpecProvider\.create\(\);/);
  assert.match(main, /new com\.demcha\.examples\.cv\.MintEditorialCvTemplate\(\)\s*\.compose\(session, spec\);/);
  assert.match(main, /Path\.of\("template"\)/);
  assert.match(main, /"output\/cv\.pdf"/);
  assert.match(main, /DocumentPageSize\.A4/);
});

test("a template with no spec provider composes against the session alone", () => {
  const main = generateMainClass({
    ...CV_MANIFEST,
    bundleDir: ".",
    entrypoint: { templateClass: "com.acme.T", specClass: null, providerClass: null },
    data: null,
  });
  assert.match(main, /new com\.acme\.T\(\)\s*\.compose\(session\);/);
  // Not a bare `.create()` check: that also matches the DocumentBuilder call
  // that opens the session, which every runner makes.
  assert.ok(!/\bspec\b/.test(main), "a runner with no provider declared a spec anyway");
  assert.ok(!main.includes("Provider"), "there is no provider to call");
});

test("the runner sets both resource-directory properties while published bundles read the old one", () => {
  const main = generateMainClass({ ...CV_MANIFEST, bundleDir: "." });
  // Every bundle published so far reads graphcompose.revision.dir, and its
  // provider throws when the property is unset rather than defaulting. Setting
  // only the new name would make every existing bundle fail at startup.
  assert.match(main, /setProperty\("graphcompose\.template\.dir"/);
  assert.match(main, /setProperty\("graphcompose\.revision\.dir"/);
});

test("a manifest with no template class is refused rather than producing a runner that cannot compile", () => {
  assert.throws(
    () => generateMainClass({ id: "broken", bundleDir: ".", className: null, entrypoint: {} }),
    /no template class to call/,
  );
});

test("the starter README states the dependencies the generated pom actually declares", () => {
  const readme = generateConsumerReadme({ ...CV_MANIFEST, sourceProject: "cv-reference", sourceRevision: "revision-009" });
  assert.match(readme, /# Mint Editorial CV/);
  assert.match(readme, /`graph-compose` \| 2\.2\.1/);
  assert.match(readme, /`jackson-databind` \| 2\.17\.2/);
  assert.match(readme, /template\/cv-data\.json/, "the README must name the file a consumer edits");
  assert.match(readme, /revision-009/, "provenance is the one place revision vocabulary belongs");
});

// -------------------------------------------------------------------- misc ---

test("copyTree copies nested content and creates what it needs", () => {
  const from = tempDir("copy-from");
  write(path.join(from, "a", "b", "c.txt"), "deep");
  const to = path.join(tempDir("copy-to"), "nested", "dest");
  copyTree(from, to);
  assert.equal(fs.readFileSync(path.join(to, "a", "b", "c.txt"), "utf8"), "deep");
});

test("every bundle in this repository yields a pom naming GraphCompose", () => {
  for (const id of fs.readdirSync(path.join(repoRoot, "templates"))) {
    const dir = path.join(repoRoot, "templates", id);
    if (!fs.existsSync(path.join(dir, "template.json"))) continue;
    const pom = generatePom(readManifest(dir));
    assert.match(pom, /<artifactId>graph-compose<\/artifactId>/, `${id} generated a pom without GraphCompose`);
    assert.ok(!/\$\{(?!graphcompose)/.test(pom.replace(/\$\{project\./g, "")), `${id}: unexpanded placeholder in the pom`);
  }
});
