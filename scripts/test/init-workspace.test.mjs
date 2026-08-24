#!/usr/bin/env node
/**
 * scripts/test/init-workspace.test.mjs — the workspace has a deterministic
 * entry point, and it puts the work in the user's project.
 *
 * The bug this guards against was not a crash. `initWorkspace()` existed but no
 * CLI called it, so the manifest only appeared if the agent remembered to write
 * one; without it, resolution falls through to install mode and the projects
 * directory becomes the harness's own examples/. The work went into the
 * installed runtime and every command agreed it belonged there, which is the
 * worst kind of wrong — consistent.
 *
 * So the assertions that matter are about *location* and *pins*, not exit
 * codes: the workspace lands beside pom.xml, the project lands inside it, and
 * the version written is the one the project actually pins rather than the
 * revision manager's built-in default.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(repoRoot, "scripts", "init-workspace.mjs");

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcinitws-${label}-`));
  process.on("exit", () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
  return dir;
}

/** A Java project pinning a GraphCompose version, as a user's would be. */
function javaProject(version = "2.2.0", label = "proj") {
  const dir = tempDir(label);
  fs.writeFileSync(
    path.join(dir, "pom.xml"),
    `<project><dependencies><dependency>` +
      `<groupId>io.github.demchaav</groupId><artifactId>graph-compose</artifactId>` +
      `<version>${version}</version>` +
      `</dependency></dependencies></project>\n`,
  );
  return dir;
}

function run(args, options = {}) {
  return execFileSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

/** Run expecting failure; returns { status, output }. */
function runFailing(args) {
  try {
    run(args);
    assert.fail(`expected a non-zero exit for: ${args.join(" ")}`);
  } catch (err) {
    if (err instanceof assert.AssertionError) throw err;
    return { status: err.status, output: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

test("the workspace lands in the Java project, not in the harness install", () => {
  const project = javaProject();
  run(["--project-dir", project]);

  const manifest = path.join(project, "graphcompose-flow", "flow.config.json");
  assert.ok(fs.existsSync(manifest), "flow.config.json was not created beside pom.xml");
  assert.ok(
    fs.existsSync(path.join(project, "graphcompose-flow", "projects")),
    "the projects directory was not created",
  );
  // The install must be untouched: this is the failure the CLI exists to stop.
  assert.ok(
    !fs.existsSync(path.join(repoRoot, "examples", "flow.config.json")),
    "a manifest appeared in the harness install",
  );
});

test("the manifest is seeded with the version the project actually pins", () => {
  const project = javaProject("2.2.0");
  run(["--project-dir", project]);

  const manifest = JSON.parse(
    fs.readFileSync(path.join(project, "graphcompose-flow", "flow.config.json"), "utf8"),
  );
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.graphComposeVersion, "2.2.0");
  assert.equal(manifest.skillPack, "skills/versions/graphcompose-2.2");
});

test("--project creates the project inside the workspace with the resolved pins", () => {
  const project = javaProject("2.2.0");
  run(["--project-dir", project, "--project", "my-cv"]);

  const projectFile = path.join(
    project,
    "graphcompose-flow",
    "projects",
    "my-cv",
    "template-project.json",
  );
  assert.ok(fs.existsSync(projectFile), "the project was not created inside the workspace");
  assert.ok(
    !fs.existsSync(path.join(project, "my-cv")),
    "the project was created in the host root instead of the workspace",
  );

  const meta = JSON.parse(fs.readFileSync(projectFile, "utf8"));
  // Before --target-version was threaded through, this said 1.9.0 for every
  // project regardless of the pin, and the mismatch only surfaced at compile.
  assert.equal(meta.targetGraphComposeVersion, "2.2.0");
  assert.equal(meta.skillPack, "skills/versions/graphcompose-2.2");
});

test("a second run neither fails nor overwrites the manifest", () => {
  const project = javaProject();
  run(["--project-dir", project]);
  const manifestPath = path.join(project, "graphcompose-flow", "flow.config.json");
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify({ schemaVersion: 1, graphComposeVersion: "1.9.0", mine: true }, null, 2)}\n`,
  );

  const out = run(["--project-dir", project]);
  assert.match(out, /already exists/);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.mine, true, "a user's manifest was overwritten");
  assert.equal(manifest.graphComposeVersion, "1.9.0", "a user's pin was overwritten");
});

test("a project with no GraphCompose pin still gets a workspace, and is told why it has no pins", () => {
  const bare = tempDir("bare");
  const out = run(["--project-dir", bare]);

  assert.ok(
    fs.existsSync(path.join(bare, "graphcompose-flow", "flow.config.json")),
    "the workspace was withheld over a version question it does not own",
  );
  assert.match(out, /no version pinned in the manifest/);
  assert.match(out, /resolve-version/);

  const manifest = JSON.parse(
    fs.readFileSync(path.join(bare, "graphcompose-flow", "flow.config.json"), "utf8"),
  );
  assert.equal(manifest.graphComposeVersion, undefined, "a version was invented");
});

test("--json reports the workspace, the pins and the version status", () => {
  const project = javaProject();
  const parsed = JSON.parse(run(["--project-dir", project, "--project", "cv", "--json"]));

  assert.equal(parsed.created, true);
  assert.equal(parsed.versionStatus, "supported");
  assert.equal(parsed.graphComposeVersion, "2.2.0");
  assert.equal(path.basename(parsed.workspace), "graphcompose-flow");
  assert.equal(path.basename(parsed.project), "cv");
});

test("a project id that escapes the workspace is refused, without a stack trace", () => {
  const project = javaProject();
  const { status, output } = runFailing(["--project-dir", project, "--project", "../escape"]);

  assert.equal(status, 2);
  assert.match(output, /invalid project id/);
  assert.ok(!output.includes("at "), `a stack trace leaked to the user:\n${output}`);
  assert.ok(
    !fs.existsSync(path.join(path.dirname(project), "escape")),
    "the id escaped the projects directory",
  );
});

test("re-creating an existing project is refused rather than merged into", () => {
  const project = javaProject();
  run(["--project-dir", project, "--project", "cv"]);
  const { status, output } = runFailing(["--project-dir", project, "--project", "cv"]);

  assert.equal(status, 3);
  assert.match(output, /already exists/);
});

test("--template seeds into the workspace when the line matches the pin", () => {
  const project = javaProject("1.7.0", "seedable");
  run(["--project-dir", project, "--project", "inv", "--template", "invoice"]);

  const dir = path.join(project, "graphcompose-flow", "projects", "inv");
  assert.ok(fs.existsSync(path.join(dir, "render-runner", "pom.xml")), "no runner was seeded");
  assert.ok(
    fs.existsSync(path.join(dir, "revisions", "revision-001", "generated-template.java")),
    "no template was seeded",
  );
  // The runner pins the library itself and nothing overrides it at render time.
  const pom = fs.readFileSync(path.join(dir, "render-runner", "pom.xml"), "utf8");
  assert.match(pom, /<graphcompose\.version>1\.7\.0<\/graphcompose\.version>/);
});

test("--template refuses a seed written for another line, and leaves no project behind", () => {
  const project = javaProject("2.2.0", "crossmajor");
  const { status, output } = runFailing([
    "--project-dir",
    project,
    "--project",
    "inv",
    "--template",
    "invoice",
  ]);

  assert.notEqual(status, 0);
  assert.match(output, /written against GraphCompose 1\.7\.x/);
  assert.ok(
    !fs.existsSync(path.join(project, "graphcompose-flow", "projects", "inv")),
    "a project was left behind after the refusal",
  );
});

test("--template without --project is a usage error", () => {
  const project = javaProject();
  const { status, output } = runFailing(["--project-dir", project, "--template", "invoice"]);
  assert.equal(status, 2);
  assert.match(output, /--template needs --project/);
});

test("a missing flag value is a usage error, not a crash", () => {
  const { status, output } = runFailing(["--project-dir"]);
  assert.equal(status, 2);
  assert.match(output, /missing its value/);
});

test("a non-existent project directory is refused", () => {
  const { status, output } = runFailing(["--project-dir", path.join(tempDir("gone"), "nope")]);
  assert.equal(status, 2);
  assert.match(output, /no such directory/);
});
