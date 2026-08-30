#!/usr/bin/env node
/**
 * scripts/test/workspace-cli.test.mjs — the scripts honour --root.
 *
 * scripts/lib/workspace.mjs is covered directly, but the threading through the
 * CLIs was only ever checked by hand. That is the half that matters to a user:
 * if publish-template's target resolution regressed to the install root, an
 * approved bundle would be written into the harness checkout instead of the
 * user's workspace — silently, and only noticed when they cannot find it.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcwscli-${label}-`));
  process.on("exit", () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
  return dir;
}

/** A workspace holding one project, laid out the way a user's would be. */
function workspaceWith(projectId, projectMeta = {}, label = "ws") {
  const host = tempDir(label);
  const root = path.join(host, "graphcompose-flow");
  const project = path.join(root, "projects", projectId);
  fs.mkdirSync(path.join(project, "revisions", "revision-001"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "flow.config.json"),
    JSON.stringify({ schemaVersion: 1 }, null, 2),
  );
  fs.writeFileSync(
    path.join(project, "template-project.json"),
    JSON.stringify(
      {
        displayName: "Root Flag Probe",
        currentDraftRevisionId: "revision-001",
        currentApprovedRevisionId: "revision-001",
        ...projectMeta,
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(project, "revisions", "revision-001", "revision.json"),
    JSON.stringify(
      {
        id: "revision-001",
        parentRevisionId: null,
        status: "APPROVED",
        userRequest: "probe",
        targetGraphComposeVersion: "2.2.0",
        skillPack: "skills/versions/graphcompose-2.2",
        createdAt: "2026-08-24T00:00:00.000Z",
        artifacts: { userRequest: "user-request.md" },
        schemaVersion: 1,
      },
      null,
      2,
    ),
  );
  return { host, root, project };
}

/** Run a script, returning stdout+stderr and the exit code either way. */
function run(script, args, cwd = repoRoot) {
  try {
    return {
      code: 0,
      out: execFileSync(process.execPath, [path.join(repoRoot, script), ...args], {
        cwd,
        encoding: "utf8",
        stdio: "pipe",
      }),
    };
  } catch (err) {
    return { code: err.status, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

test("publish-template writes into the workspace named by --root, not the install root", () => {
  const { root } = workspaceWith("probe-cv");
  const { code, out } = run("scripts/publish-template.mjs", [
    "--project",
    "probe-cv",
    "--root",
    root,
    "--dry-run",
  ]);

  assert.equal(code, 0, out);
  assert.match(out, /\[workspace\]/, "no workspace banner — the resolver was not consulted");

  const targetLine = out.split("\n").find((line) => line.includes("targetDir"));
  assert.ok(targetLine, `no targetDir line in:\n${out}`);

  // Inside the workspace, and named the way a user can act on it. Printing it
  // relative to the install root produced "..\..\..\tmp\..." once the
  // workspace lived outside this repository, which locates nothing.
  assert.ok(
    targetLine.includes(path.join("graphcompose-flow", "templates", "root-flag-probe")),
    `targetDir is not reported inside the given workspace: ${targetLine}`,
  );
  assert.ok(
    !targetLine.includes(".."),
    `targetDir is reported by walking out of the install root: ${targetLine}`,
  );
  assert.ok(
    !out.includes(path.join(repoRoot, "templates")),
    "the bundle would have been published into the harness install root",
  );
});

test("publish-template still reports install-mode paths relative to the repository", () => {
  // The workspace-aware display must not change the output people already read
  // when running inside this checkout.
  // Run from a directory with no workspace above it, so resolution falls
  // through to install mode. Running from the checkout itself is not that on a
  // machine whose user created a workspace inside it (`init-workspace
  // --project-dir .`): discovery finds it first, and naming the checkout with
  // --root finds the same manifest. Neither is a defect; this test is about
  // install mode, so it has to stand somewhere install mode can be reached.
  const { code, out } = run(
    "scripts/publish-template.mjs",
    ["--project", "cv-reference", "--dry-run"],
    tempDir("install-mode"),
  );
  assert.equal(code, 0, out);
  assert.match(out, /targetDir\s+= templates[\\/]mint-editorial-cv/);
  assert.ok(!out.includes("[workspace]"), "install mode should stay quiet about the workspace");
});

test("publish-template reports the workspace it used when the project is missing", () => {
  const { root } = workspaceWith("probe-cv");
  const { code, out } = run("scripts/publish-template.mjs", [
    "--project",
    "not-here",
    "--root",
    root,
    "--dry-run",
  ]);
  assert.notEqual(code, 0);
  assert.ok(out.includes("not-here"), out);
});

test("render resolves the project from --root before it needs a toolchain", () => {
  // The project deliberately has no render block, so runRender aborts as soon
  // as it has READ the project — which is exactly the proof that --root was
  // honoured, without needing Java, Maven or GraphCompose on the machine.
  const { root } = workspaceWith("probe-cv");
  const { code, out } = run("scripts/render.mjs", ["probe-cv", "revision-001", "--root", root]);

  assert.notEqual(code, 0, "a project with no render block should not render");
  assert.match(out, /\[workspace\]/, "no workspace banner — the resolver was not consulted");
  assert.match(
    out,
    /templateClass is required/,
    `render did not reach the project's own config:\n${out}`,
  );
  assert.match(out, /probe-cv/);
});

test("render says which workspace it looked in when the project is not there", () => {
  const { root } = workspaceWith("probe-cv");
  const { code, out } = run("scripts/render.mjs", ["ghost", "revision-001", "--root", root]);

  assert.notEqual(code, 0);
  assert.ok(out.includes("ghost"), out);
  assert.ok(
    out.includes(root),
    `the error does not name the workspace it searched:\n${out}`,
  );
});

test("run-pipeline prints commands carrying --root once it is outside install mode", () => {
  const { root } = workspaceWith("probe-cv");
  const { code, out } = run("scripts/run-pipeline.mjs", ["probe-cv", "--root", root]);

  assert.equal(code, 0, out);
  assert.match(out, /--root/, "the printed commands would not work when pasted elsewhere");
  assert.ok(out.includes(root), out);
});

test("GRAPHCOMPOSE_FLOW_ROOT is honoured when no flag is passed", () => {
  const { root } = workspaceWith("probe-cv");
  const out = execFileSync(
    process.execPath,
    [path.join(repoRoot, "scripts", "run-pipeline.mjs"), "probe-cv"],
    { cwd: repoRoot, encoding: "utf8", env: { ...process.env, GRAPHCOMPOSE_FLOW_ROOT: root } },
  );
  assert.match(out, /\(env\)/, "the environment variable was ignored");
  assert.ok(out.includes(root));
});
