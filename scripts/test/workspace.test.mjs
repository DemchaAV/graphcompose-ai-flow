#!/usr/bin/env node
/**
 * scripts/test/workspace.test.mjs — the workspace resolver, and the end-to-end
 * check that matters for the plugin model: a project created from a user's Java
 * project lands in the user's tree, not in the harness install.
 *
 *   node --test "scripts/test/**\/*.test.mjs"
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ENV_ROOT,
  WORKSPACE_DIR_NAME,
  WORKSPACE_MANIFEST,
  WorkspaceError,
  discoverWorkspaceRoot,
  initWorkspace,
  installRoot,
  projectDir,
  requireProjectDir,
  resolveWorkspace,
} from "../lib/workspace.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Temp directory, removed when the test process exits. */
function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcflow-${label}-`));
  process.on("exit", () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
  return dir;
}

/** A Java project with a GraphCompose dependency, as a user would have. */
function fakeJavaProject(version = "1.9.0") {
  const dir = tempDir("javaproj");
  fs.writeFileSync(
    path.join(dir, "pom.xml"),
    `<project>
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.example</groupId>
  <artifactId>demo</artifactId>
  <version>0.0.1</version>
  <dependencies>
    <dependency>
      <groupId>io.github.demchaav</groupId>
      <artifactId>graph-compose</artifactId>
      <version>${version}</version>
    </dependency>
  </dependencies>
</project>
`,
    "utf8",
  );
  fs.mkdirSync(path.join(dir, "src", "main", "java"), { recursive: true });
  return dir;
}

test("with nothing to go on, the workspace is the harness's own examples/", () => {
  const ws = resolveWorkspace({ env: {}, cwd: tempDir("bare"), install: repoRoot });
  assert.equal(ws.mode, "install");
  assert.equal(ws.root, repoRoot);
  assert.equal(ws.projectsDir, path.join(repoRoot, "examples"));
  assert.equal(ws.templatesDir, path.join(repoRoot, "templates"));
});

test("an explicit root wins over everything else", () => {
  const host = tempDir("explicit");
  initWorkspace(host);
  const ws = resolveWorkspace({
    explicitRoot: host,
    env: { [ENV_ROOT]: tempDir("ignored") },
    cwd: repoRoot,
    install: repoRoot,
  });
  assert.equal(ws.mode, "explicit");
  assert.equal(ws.root, path.join(host, WORKSPACE_DIR_NAME));
});

test("an explicit root may name either the host project or the workspace directory", () => {
  const host = tempDir("either");
  const { root } = initWorkspace(host);
  const viaHost = resolveWorkspace({ explicitRoot: host, env: {}, install: repoRoot });
  const viaWorkspace = resolveWorkspace({ explicitRoot: root, env: {}, install: repoRoot });
  assert.equal(viaHost.root, viaWorkspace.root);
});

test("the environment variable is used when no flag is given", () => {
  const host = tempDir("env");
  initWorkspace(host);
  const ws = resolveWorkspace({ env: { [ENV_ROOT]: host }, cwd: repoRoot, install: repoRoot });
  assert.equal(ws.mode, "env");
  assert.equal(ws.root, path.join(host, WORKSPACE_DIR_NAME));
  // An empty variable must not shadow discovery.
  const blank = resolveWorkspace({ env: { [ENV_ROOT]: "   " }, cwd: tempDir("blank"), install: repoRoot });
  assert.equal(blank.mode, "install");
});

test("a workspace is discovered by walking up from a nested directory", () => {
  const host = tempDir("discover");
  initWorkspace(host);
  const nested = path.join(host, "src", "main", "java", "com", "example");
  fs.mkdirSync(nested, { recursive: true });

  assert.equal(discoverWorkspaceRoot(nested), path.join(host, WORKSPACE_DIR_NAME));
  const ws = resolveWorkspace({ env: {}, cwd: nested, install: repoRoot });
  assert.equal(ws.mode, "discovered");
  assert.equal(ws.projectsDir, path.join(host, WORKSPACE_DIR_NAME, "projects"));

  // Standing inside the workspace directory itself also counts.
  assert.equal(
    discoverWorkspaceRoot(path.join(host, WORKSPACE_DIR_NAME)),
    path.join(host, WORKSPACE_DIR_NAME),
  );
});

test("discovery stops at the filesystem root rather than looping", () => {
  assert.equal(discoverWorkspaceRoot(tempDir("nowhere")), null);
});

test("initWorkspace writes a valid manifest and never overwrites an existing one", () => {
  const host = tempDir("init");
  const first = initWorkspace(host, { graphComposeVersion: "2.2.0", skillPack: "skills/versions/graphcompose-2.2" });
  assert.equal(first.created, true);
  assert.ok(fs.existsSync(path.join(first.root, WORKSPACE_MANIFEST)));
  assert.ok(fs.existsSync(path.join(first.root, "projects")));
  assert.deepEqual(first.manifest, {
    schemaVersion: 1,
    graphComposeVersion: "2.2.0",
    skillPack: "skills/versions/graphcompose-2.2",
  });

  const second = initWorkspace(host, { graphComposeVersion: "9.9.9" });
  assert.equal(second.created, false);
  assert.equal(second.manifest.graphComposeVersion, "2.2.0", "an existing pin was overwritten");
});

test("project lookup refuses ids that would escape the workspace", () => {
  const ws = resolveWorkspace({ env: {}, cwd: tempDir("escape"), install: repoRoot });
  for (const bad of [
    "../elsewhere",
    "nested/project",
    "back\\slash",
    "",
    // Dot segments used to slip past a separator-only guard: ".." resolved to
    // the workspace root and "." to the projects directory itself.
    "..",
    ".",
    "...",
    ".hidden",
    "..\\up",
    null,
    undefined,
  ]) {
    assert.throws(
      () => projectDir(ws, bad),
      WorkspaceError,
      `accepted project id ${JSON.stringify(bad)}`,
    );
  }
});

test("project lookup still accepts the ids real projects use", () => {
  const ws = resolveWorkspace({ env: {}, cwd: tempDir("good-ids"), install: repoRoot });
  for (const good of ["cv-reference", "mint-editorial-cv", "demo-cv", "invoice2", "a_b.c-d"]) {
    assert.equal(
      projectDir(ws, good),
      path.join(ws.projectsDir, good),
      `rejected a legitimate project id: ${good}`,
    );
  }
});

test("a missing project is reported with the workspace and how it was found", () => {
  const host = tempDir("missing");
  initWorkspace(host);
  const ws = resolveWorkspace({ explicitRoot: host, env: {}, install: repoRoot });
  assert.throws(
    () => requireProjectDir(ws, "no-such-project"),
    (err) =>
      err instanceof WorkspaceError &&
      err.message.includes("no-such-project") &&
      err.message.includes("explicit"),
  );
});

test("the harness's own examples still resolve in install mode", () => {
  const ws = resolveWorkspace({ env: {}, cwd: repoRoot, install: repoRoot });
  assert.equal(requireProjectDir(ws, "cv-reference"), path.join(repoRoot, "examples", "cv-reference"));
});

test("end to end: a project created from a user's Java project lands in their tree", () => {
  const host = fakeJavaProject("1.9.0");
  const { root } = initWorkspace(host);
  const projectsDir = path.join(root, "projects");
  const cli = path.join(repoRoot, "tools", "revision-manager", "bin", "graphcompose-flow.mjs");

  execFileSync(process.execPath, [cli, "init", "demo-cv"], { cwd: projectsDir, stdio: "pipe" });
  execFileSync(process.execPath, [cli, "new-revision", "first pass", "--project", "demo-cv"], {
    cwd: projectsDir,
    stdio: "pipe",
  });

  const created = path.join(projectsDir, "demo-cv");
  assert.ok(fs.existsSync(path.join(created, "template-project.json")), "project not created in the workspace");
  assert.ok(
    fs.existsSync(path.join(created, "revisions", "revision-001", "revision.json")),
    "revision not created in the workspace",
  );

  // Nothing leaked into the harness install.
  assert.ok(
    !fs.existsSync(path.join(repoRoot, "examples", "demo-cv")),
    "the project leaked into the harness install root",
  );

  // And the scripts find it from inside the user's project, with no flags.
  const ws = resolveWorkspace({ env: {}, cwd: path.join(host, "src", "main", "java"), install: repoRoot });
  assert.equal(ws.mode, "discovered");
  assert.equal(requireProjectDir(ws, "demo-cv"), created);
});

test("installRoot points at the harness, not at the workspace", () => {
  assert.equal(installRoot(), repoRoot);
  assert.ok(fs.existsSync(path.join(installRoot(), "config", "pipeline.json")));
});
