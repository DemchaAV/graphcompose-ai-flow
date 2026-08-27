#!/usr/bin/env node
/**
 * scripts/test/scaffold-runner.test.mjs — the point where a version stops being
 * a string and becomes the code that gets compiled.
 *
 * One run scaffolded a runner for `2.2.1-SNAPSHOT` out of a workspace whose
 * manifest said `2.2.0`. Both files were readable the whole time and nothing
 * compared them, so every measurement afterwards belonged to a build nobody had
 * named. This is the last place that disagreement is cheap to catch.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(repoRoot, "scripts", "scaffold-runner.mjs");

function scenario({ projectVersion, resolvedVersion = null }, label) {
  const host = fs.mkdtempSync(path.join(os.tmpdir(), `gcscaffold-${label}-`));
  process.on("exit", () => {
    try {
      fs.rmSync(host, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });

  const root = path.join(host, "graphcompose-flow");
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, "flow.config.json"), JSON.stringify({ schemaVersion: 1 }), "utf8");

  const project = path.join(root, "projects", "demo");
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(
    path.join(project, "template-project.json"),
    JSON.stringify({ projectName: "demo", docKind: "cv", targetGraphComposeVersion: projectVersion }),
    "utf8",
  );

  if (resolvedVersion) {
    fs.writeFileSync(
      path.join(root, "resolved-version.json"),
      JSON.stringify({
        schemaVersion: 1,
        resolvedAt: "2026-08-27T12:00:00.000Z",
        version: resolvedVersion,
        line: "2.2",
        buildFile: path.join(host, "pom.xml"),
        build: { identifiesOneBuild: true, mutable: false },
        accepted: null,
      }),
      "utf8",
    );
  }

  return { root, project };
}

function run(root) {
  const result = spawnSync(process.execPath, [CLI, "--project", "demo", "--root", root], {
    encoding: "utf8",
  });
  return { status: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

test("a project pinned against one build and a workspace resolved to another is refused", () => {
  const { root } = scenario(
    { projectVersion: "2.2.1-SNAPSHOT", resolvedVersion: "2.2.2" },
    "disagree",
  );
  const { status, output } = run(root);

  assert.equal(status, 1);
  assert.match(output, /2\.2\.1-SNAPSHOT/);
  assert.match(output, /2\.2\.2/);
  // Both versions named, and the pom not written: what must not happen is
  // compiling against one and reporting the other.
  assert.match(output, /pins 2\.2\.1-SNAPSHOT, but the workspace resolved 2\.2\.2/);
});

test("--force builds the project's own version, and says it is doing so", () => {
  // An older project in an upgraded workspace is not wrong, it is older. The
  // refusal exists so nobody compiles against one version and reports another,
  // not to make the older project unbuildable.
  const { root, project } = scenario(
    { projectVersion: "2.2.1-SNAPSHOT", resolvedVersion: "2.2.2" },
    "forced",
  );
  const result = spawnSync(
    process.execPath,
    [CLI, "--project", "demo", "--root", root, "--force"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, `${result.stdout ?? ""}${result.stderr ?? ""}`);
  assert.match(result.stdout, /--force/);
  const pom = fs.readFileSync(path.join(project, "render-runner", "pom.xml"), "utf8");
  assert.match(pom, /<graphcompose\.version>2\.2\.1-SNAPSHOT<\/graphcompose\.version>/);
});

test("the refusal names the edit that would settle it", () => {
  const { root } = scenario(
    { projectVersion: "2.2.1-SNAPSHOT", resolvedVersion: "2.2.2" },
    "names-the-edit",
  );
  const { output } = run(root);

  assert.match(output, /"targetGraphComposeVersion": "2\.2\.2"/);
  assert.match(output, /template-project\.json/);
  assert.match(output, /pass --force/);
});

test("agreement scaffolds the runner at that version", () => {
  const { root, project } = scenario(
    { projectVersion: "2.2.2", resolvedVersion: "2.2.2" },
    "agree",
  );
  const { status } = run(root);

  assert.equal(status, 0);
  const pom = fs.readFileSync(path.join(project, "render-runner", "pom.xml"), "utf8");
  assert.match(pom, /<graphcompose\.version>2\.2\.2<\/graphcompose\.version>/);
});

test("a workspace with no resolution yet is not blocked by one", () => {
  // preflight writes the record; a project scaffolded before it ever ran should
  // not be held hostage to a file that does not exist.
  const { root } = scenario({ projectVersion: "2.2.2" }, "unresolved");
  assert.equal(run(root).status, 0);
});
