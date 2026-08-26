#!/usr/bin/env node
/**
 * scripts/test/use-template.test.mjs — a published bundle becomes a working
 * project without a model and without a surprise.
 *
 * The compiling half of this — that a generated starter builds and renders — is
 * exercised by `npm run verify`, which has Maven. What is asserted here is
 * everything that has to be right *before* a compile is worth attempting:
 * where the files land, what is refused rather than half-done, and whether the
 * report a consumer follows is complete.
 *
 * That last one is the case this suite exists for. The first real `--target`
 * run reported one missing dependency, the dependency was added exactly as
 * printed, and the build still failed — the target pom set no compiler release,
 * so Maven defaulted to `-source 8` and the template's records would not parse.
 * A report that is followed and still does not compile is worse than no report.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(repoRoot, "scripts", "use-template.mjs");

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcuse-${label}-`));
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

function run(root, argv) {
  const result = spawnSync(process.execPath, [CLI, "--root", root, ...argv], { encoding: "utf8" });
  return { status: result.status, out: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

const MANIFEST = {
  id: "acme-invoice",
  displayName: "Acme Invoice",
  version: "1.0.0",
  className: "AcmeInvoiceTemplate",
  entrypoint: {
    templateClass: "com.acme.docs.AcmeInvoiceTemplate",
    specClass: "com.acme.docs.AcmeInvoiceSpec",
    providerClass: "com.acme.docs.AcmeInvoiceSpecProvider",
  },
  data: { example: "data/invoice-data.example.json", runtimeName: "invoice-data.json" },
  resources: { assets: "assets", manifest: null },
  docKind: "invoice",
  graphComposeVersion: "1.6.7",
  schemaVersion: "1.1.0",
  dependencies: { "io.github.demchaav:graph-compose": "1.6.7", "com.fasterxml.jackson.core:jackson-databind": "2.17.2" },
};

/** A workspace holding one bundle. */
function workspace({ label, manifest = MANIFEST, property = "graphcompose.revision.dir" } = {}) {
  const root = path.join(tempDir(label), "graphcompose-flow");
  write(path.join(root, "flow.config.json"), { schemaVersion: 1 });
  const bundle = path.join(root, "templates", manifest.id);
  write(path.join(bundle, "template.json"), manifest);
  if (property) {
    write(
      path.join(bundle, "src", "AcmeInvoiceSpecProvider.java"),
      `package com.acme.docs;\npublic final class AcmeInvoiceSpecProvider {\n  private static final String P = "${property}";\n}\n`,
    );
  }
  write(path.join(bundle, "README.md"), "# bundle\n");
  write(
    path.join(bundle, "src", `${manifest.className}.java`),
    `package com.acme.docs;\npublic final class ${manifest.className} {}\n`,
  );
  if (manifest.data) write(path.join(bundle, manifest.data.example), { total: 1 });
  if (manifest.resources?.assets) write(path.join(bundle, "assets", "icons", "mail.svg"), "<svg/>");
  return root;
}

/** An existing Maven project, configurable in the two ways that matter. */
function mavenProject({ label, javaRelease = null, dependencies = [] } = {}) {
  const dir = tempDir(label);
  fs.mkdirSync(path.join(dir, "src", "main", "java"), { recursive: true });
  write(
    path.join(dir, "pom.xml"),
    [
      '<project xmlns="http://maven.apache.org/POM/4.0.0">',
      "  <modelVersion>4.0.0</modelVersion>",
      "  <groupId>com.acme</groupId><artifactId>app</artifactId><version>1.0.0</version>",
      ...(javaRelease
        ? ["  <properties>", `    <maven.compiler.release>${javaRelease}</maven.compiler.release>`, "  </properties>"]
        : []),
      "  <dependencies>",
      ...dependencies.map(
        (d) =>
          `    <dependency><groupId>${d.groupId}</groupId><artifactId>${d.artifactId}</artifactId><version>${d.version}</version></dependency>`,
      ),
      "  </dependencies>",
      "</project>",
    ].join("\n"),
  );
  return dir;
}

// ------------------------------------------------------------ new project ---

test("a new project gets the sources, the data, the runner, the pom and a README", () => {
  const root = workspace({ label: "new" });
  const dir = path.join(tempDir("out"), "starter");

  const { status, out } = run(root, ["acme-invoice", "--new-project", dir, "--no-verify"]);
  assert.equal(status, 0, out);

  assert.ok(fs.existsSync(path.join(dir, "src", "main", "java", "com", "acme", "docs", "AcmeInvoiceTemplate.java")));
  assert.ok(fs.existsSync(path.join(dir, "src", "main", "java", "Main.java")));
  assert.ok(fs.existsSync(path.join(dir, "template", "invoice-data.json")), "the example must arrive under its runtime name");
  assert.ok(!fs.existsSync(path.join(dir, "template", "invoice-data.example.json")));
  assert.ok(fs.existsSync(path.join(dir, "template", "assets", "icons", "mail.svg")));
  assert.ok(fs.existsSync(path.join(dir, "pom.xml")));
  assert.ok(fs.existsSync(path.join(dir, "README.md")));
  assert.ok(fs.existsSync(path.join(dir, "output")), "the tree should explain itself before anything is run");
});

test("the generated pom wires the runner, so `mvn exec:java` has a goal", () => {
  const root = workspace({ label: "exec" });
  const dir = path.join(tempDir("out-exec"), "starter");
  run(root, ["acme-invoice", "--new-project", dir, "--no-verify"]);

  const pom = fs.readFileSync(path.join(dir, "pom.xml"), "utf8");
  assert.match(pom, /<mainClass>Main<\/mainClass>/);
  assert.match(pom, /<maven\.compiler\.release>21<\/maven\.compiler\.release>/);
  assert.match(pom, /<artifactId>graph-compose<\/artifactId>/);
});

test("a non-empty directory is refused rather than merged into", () => {
  const root = workspace({ label: "nonempty" });
  const dir = path.join(tempDir("out-ne"), "starter");
  write(path.join(dir, "important.txt"), "do not lose me");

  const { status, out } = run(root, ["acme-invoice", "--new-project", dir, "--no-verify"]);
  assert.equal(status, 1);
  assert.match(out, /is not empty/);
  assert.equal(fs.readFileSync(path.join(dir, "important.txt"), "utf8"), "do not lose me");
  assert.ok(!fs.existsSync(path.join(dir, "pom.xml")), "nothing should have been written before refusing");
});

test("--force writes into a non-empty directory", () => {
  const root = workspace({ label: "force" });
  const dir = path.join(tempDir("out-f"), "starter");
  write(path.join(dir, "important.txt"), "still here");

  const { status } = run(root, ["acme-invoice", "--new-project", dir, "--no-verify", "--force"]);
  assert.equal(status, 0);
  assert.ok(fs.existsSync(path.join(dir, "pom.xml")));
  assert.ok(fs.existsSync(path.join(dir, "important.txt")), "--force overwrites, it does not clear the directory");
});

// ----------------------------------------------------------------- target ---

test("target: sources land at their package under the project's own source root", () => {
  const root = workspace({ label: "tgt" });
  const project = mavenProject({ label: "app" });

  const { status, out } = run(root, ["acme-invoice", "--target", project]);
  assert.equal(status, 0, out);
  assert.ok(fs.existsSync(path.join(project, "src", "main", "java", "com", "acme", "docs", "AcmeInvoiceTemplate.java")));
  // Namespaced by template id: an application may install more than one, and
  // two flat `template/` copies would silently overwrite each other's data.
  assert.ok(fs.existsSync(path.join(project, "template", "acme-invoice", "invoice-data.json")));
  assert.ok(!fs.existsSync(path.join(project, "Main.java")), "an existing app has its own entry point");
  assert.ok(!fs.existsSync(path.join(project, "README.md")), "an existing app has its own README");
});

test("target: the build file is reported on, never rewritten", () => {
  const root = workspace({ label: "nopatch" });
  const project = mavenProject({ label: "nopatch-app", javaRelease: 21 });
  const before = fs.readFileSync(path.join(project, "pom.xml"), "utf8");

  const { out } = run(root, ["acme-invoice", "--target", project]);
  assert.equal(fs.readFileSync(path.join(project, "pom.xml"), "utf8"), before, "the pom was modified");
  assert.match(out, /<artifactId>graph-compose<\/artifactId>/, "the snippet a consumer pastes must be printed");
});

test("target: a dependency already declared is not reported missing, and a version gap is a note", () => {
  const root = workspace({ label: "declared" });
  const project = mavenProject({
    label: "declared-app",
    javaRelease: 21,
    dependencies: [
      { groupId: "io.github.demchaav", artifactId: "graph-compose", version: "1.9.0" },
      { groupId: "com.fasterxml.jackson.core", artifactId: "jackson-databind", version: "2.17.2" },
    ],
  });

  const { out } = run(root, ["acme-invoice", "--target", project]);
  assert.match(out, /already declares everything/);
  assert.match(
    out,
    /graph-compose is declared as 1\.9\.0; this bundle was published against 1\.6\.7/,
    "a version difference is worth knowing and is not a failure to declare",
  );
});

test("target: a project with no compiler release is told these sources need records", () => {
  // The defect this check exists for: the first real run reported one missing
  // dependency, it was added exactly as printed, and the build failed anyway
  // with "records are not supported in -source 8".
  const root = workspace({ label: "java8" });
  const project = mavenProject({ label: "java8-app" });

  const { out } = run(root, ["acme-invoice", "--target", project]);
  assert.match(out, /sets no Java release/);
  assert.match(out, /need 21 or later/);
  assert.match(out, /<maven\.compiler\.release>21<\/maven\.compiler\.release>/);
});

test("target: a project below 21 is told which release it is on", () => {
  const root = workspace({ label: "java17" });
  const project = mavenProject({ label: "java17-app", javaRelease: 17 });

  const { out } = run(root, ["acme-invoice", "--target", project]);
  assert.match(out, /compiles at Java 17/);
});

test("target: a project already on 21 is not lectured about it", () => {
  const root = workspace({ label: "java21" });
  const project = mavenProject({ label: "java21-app", javaRelease: 21 });

  const { out } = run(root, ["acme-invoice", "--target", project]);
  assert.ok(!/Java release/.test(out), "a project that is already fine should be told nothing");
});

test("target: the wire-up names the property this bundle reads, not the one we prefer", () => {
  // Telling a consumer to set a name their template never looks up produces a
  // provider that throws with the property already set.
  const legacy = workspace({ label: "wire-old" });
  const legacyOut = run(legacy, ["acme-invoice", "--target", mavenProject({ label: "wire-old-app", javaRelease: 21 })]).out;
  assert.match(legacyOut, /setProperty\("graphcompose\.revision\.dir"/);
  assert.match(legacyOut, /harness's own name/);
  assert.ok(!/setProperty\("graphcompose\.template\.dir"/.test(legacyOut));

  const modern = workspace({ label: "wire-new", property: "graphcompose.template.dir" });
  const modernOut = run(modern, ["acme-invoice", "--target", mavenProject({ label: "wire-new-app", javaRelease: 21 })]).out;
  assert.match(modernOut, /setProperty\("graphcompose\.template\.dir"/);
  assert.ok(!/harness's own name/.test(modernOut), "a template on the current rule needs no apology");
});

test("target: a Gradle build gets Gradle syntax, not a pom fragment", () => {
  const root = workspace({ label: "gradle" });
  const project = tempDir("gradle-app");
  fs.mkdirSync(path.join(project, "src", "main", "java"), { recursive: true });
  write(path.join(project, "build.gradle.kts"), "plugins { java }\ndependencies { }\n");

  const { out } = run(root, ["acme-invoice", "--target", project]);
  assert.match(out, /implementation\("io\.github\.demchaav:graph-compose:1\.6\.7"\)/);
  assert.match(out, /JavaLanguageVersion\.of\(21\)/);
  assert.ok(!out.includes("<dependency>"), "a Gradle project was handed Maven XML");
});

test("target: a directory that is not a Java project is refused, not turned into one", () => {
  const root = workspace({ label: "notjava" });
  const dir = tempDir("notjava-dir");
  write(path.join(dir, "notes.txt"), "hi");

  const { status, out } = run(root, ["acme-invoice", "--target", dir]);
  assert.equal(status, 1);
  assert.match(out, /does not look like a Java project/);
  assert.ok(!fs.existsSync(path.join(dir, "src")), "no source tree should have been invented");
});

test("target: existing files are refused before anything is written", () => {
  const root = workspace({ label: "clash" });
  const project = mavenProject({ label: "clash-app", javaRelease: 21 });
  run(root, ["acme-invoice", "--target", project]);

  const dataPath = path.join(project, "template", "acme-invoice", "invoice-data.json");
  fs.writeFileSync(dataPath, '{"total": 999}', "utf8");

  const { status, out } = run(root, ["acme-invoice", "--target", project]);
  assert.equal(status, 1);
  assert.match(out, /already exist/);
  assert.equal(JSON.parse(fs.readFileSync(dataPath, "utf8")).total, 999, "the consumer's edited data was overwritten");
});

test("target: --resource-dir puts a second copy somewhere else instead of clashing", () => {
  const root = workspace({ label: "resdir" });
  const project = mavenProject({ label: "resdir-app", javaRelease: 21 });
  run(root, ["acme-invoice", "--target", project]);

  const { status } = run(root, ["acme-invoice", "--target", project, "--resource-dir", "templates/second", "--force"]);
  assert.equal(status, 0);
  assert.ok(fs.existsSync(path.join(project, "templates", "second", "invoice-data.json")));
});

test("target: --source-root honours a project that keeps sources elsewhere", () => {
  const root = workspace({ label: "srcroot" });
  const project = mavenProject({ label: "srcroot-app", javaRelease: 21 });
  fs.mkdirSync(path.join(project, "app", "java"), { recursive: true });

  const { status, out } = run(root, ["acme-invoice", "--target", project, "--source-root", "app/java"]);
  assert.equal(status, 0, out);
  assert.ok(fs.existsSync(path.join(project, "app", "java", "com", "acme", "docs", "AcmeInvoiceTemplate.java")));
  assert.ok(!fs.existsSync(path.join(project, "src", "main", "java", "com")), "sources went to the default root as well");
});

// ------------------------------------------------------------------ shape ---

test("--json reports what was written and what is missing", () => {
  const root = workspace({ label: "json" });
  const project = mavenProject({ label: "json-app" });

  const { status, out } = run(root, ["acme-invoice", "--target", project, "--json"]);
  assert.equal(status, 0);
  const parsed = JSON.parse(out);
  assert.equal(parsed.mode, "target");
  assert.equal(parsed.templateId, "acme-invoice");
  assert.equal(parsed.resourceDir, "template/acme-invoice");
  assert.ok(parsed.wrote.includes("template/acme-invoice/invoice-data.json"));
  assert.deepEqual(
    parsed.missingDependencies.map((d) => `${d.groupId}:${d.artifactId}`),
    ["io.github.demchaav:graph-compose", "com.fasterxml.jackson.core:jackson-databind"],
  );
  assert.deepEqual(parsed.javaRelease, { required: 21, declared: null, sufficient: false });
});

test("an unknown template exits 3, and the argument shapes that cannot mean anything exit 2", () => {
  const root = workspace({ label: "exits" });
  assert.equal(run(root, ["no-such", "--new-project", path.join(tempDir("x"), "p")]).status, 3);
  assert.equal(run(root, ["acme-invoice", "--target", "a", "--new-project", "b"]).status, 2);
  assert.equal(run(root, ["acme-invoice"]).status, 2);
  assert.equal(run(root, ["--new-project", "p"]).status, 2);
});

test("a template with no data file installs without inventing one", () => {
  const root = workspace({
    label: "nodata",
    manifest: { ...MANIFEST, id: "static-report", docKind: "report", data: null, resources: null },
  });
  const dir = path.join(tempDir("out-nodata"), "starter");

  const { status, out } = run(root, ["static-report", "--new-project", dir, "--no-verify"]);
  assert.equal(status, 0, out);
  assert.match(out, /ships its content in Java/);
  assert.ok(fs.existsSync(path.join(dir, "src", "main", "java", "Main.java")));
  assert.deepEqual(fs.readdirSync(path.join(dir, "template")), [], "no data file should have been invented");
});
