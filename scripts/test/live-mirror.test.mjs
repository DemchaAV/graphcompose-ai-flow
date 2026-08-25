#!/usr/bin/env node
/**
 * scripts/test/live-mirror.test.mjs — where the newest render lands.
 *
 * The point of the mirror is a filename that does not change between revisions,
 * so a viewer opened at revision 1 keeps showing the work as it progresses. It
 * only pays off if the file is somewhere the user actually has open — which,
 * for a workspace inside their Java project, means beside template-project.json
 * and NOT in the install root, where a plugin install puts a cache directory
 * nobody opens.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createLiveMirror } from "../lib/live-mirror.mjs";

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gclm-${label}-`));
  process.on("exit", () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
  return dir;
}

/** An install root and a project dir outside it — the user-workspace shape. */
function workspaceLayout(label) {
  const host = tempDir(label);
  const install = path.join(host, "install");
  const projectDir = path.join(host, "java-project", "graphcompose-flow", "projects", "demo");
  fs.mkdirSync(install, { recursive: true });
  fs.mkdirSync(projectDir, { recursive: true });

  const source = path.join(host, "revision", "output.pdf");
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.writeFileSync(source, "%PDF-1.7 first\n");
  return { install, projectDir, source };
}

function withoutEnv(fn) {
  const saved = process.env.GRAPHCOMPOSE_LIVE_DIR;
  const savedOff = process.env.RENDER_NO_LIVE;
  delete process.env.GRAPHCOMPOSE_LIVE_DIR;
  delete process.env.RENDER_NO_LIVE;
  try {
    return fn();
  } finally {
    if (saved === undefined) delete process.env.GRAPHCOMPOSE_LIVE_DIR;
    else process.env.GRAPHCOMPOSE_LIVE_DIR = saved;
    if (savedOff === undefined) delete process.env.RENDER_NO_LIVE;
    else process.env.RENDER_NO_LIVE = savedOff;
  }
}

test("the render lands beside template-project.json", () => {
  withoutEnv(() => {
    const { install, projectDir, source } = workspaceLayout("project");
    const live = createLiveMirror(install, projectDir);
    live.update(source, "current.pdf");
    live.manifest({ projectId: "demo", revisionId: "revision-001", revisionDir: "r", hasDebug: false });

    assert.equal(fs.readFileSync(path.join(projectDir, "current.pdf"), "utf8"), "%PDF-1.7 first\n");
    assert.match(fs.readFileSync(path.join(projectDir, "current.txt"), "utf8"), /revision-001/);
  });
});

test("a later revision replaces it in place, keeping the filename", () => {
  // The whole reason for the file: a viewer opened once follows the work.
  withoutEnv(() => {
    const { install, projectDir, source } = workspaceLayout("replace");
    const live = createLiveMirror(install, projectDir);
    live.update(source, "current.pdf");

    fs.writeFileSync(source, "%PDF-1.7 eighth\n");
    live.update(source, "current.pdf");

    assert.equal(fs.readFileSync(path.join(projectDir, "current.pdf"), "utf8"), "%PDF-1.7 eighth\n");
    assert.deepEqual(
      fs.readdirSync(projectDir).filter((f) => f.endsWith(".pdf")),
      ["current.pdf"],
      "a second file appeared — the point is one stable name, not an archive",
    );
  });
});

test("a workspace outside the install writes no shared copy", () => {
  // In a plugin install the install root is a cache directory. Mirroring there
  // is churn nobody looks at.
  withoutEnv(() => {
    const { install, projectDir, source } = workspaceLayout("nolivedir");
    createLiveMirror(install, projectDir).update(source, "current.pdf");
    assert.ok(!fs.existsSync(path.join(install, "live")), "wrote into the install root anyway");
  });
});

test("a workspace inside the install also gets the shared copy", () => {
  // Harness development: examples/ live in the repo, and live/ is the
  // newest-render-anywhere view across projects.
  withoutEnv(() => {
    const host = tempDir("install");
    const install = path.join(host, "repo");
    const projectDir = path.join(install, "examples", "demo");
    fs.mkdirSync(projectDir, { recursive: true });
    const source = path.join(host, "output.pdf");
    fs.writeFileSync(source, "%PDF-1.7\n");

    const live = createLiveMirror(install, projectDir);
    live.update(source, "current.pdf");
    live.update(source, "current.png", "shared");

    assert.ok(fs.existsSync(path.join(install, "live", "current.pdf")));
    assert.ok(fs.existsSync(path.join(projectDir, "current.pdf")));
    assert.ok(
      !fs.existsSync(path.join(projectDir, "current.png")),
      "the raster belongs to the shared folder; tools read pixels from the revision",
    );
  });
});

test("GRAPHCOMPOSE_LIVE_DIR is honoured without displacing the project copy", () => {
  withoutEnv(() => {
    const { install, projectDir, source } = workspaceLayout("override");
    const elsewhere = path.join(tempDir("elsewhere"), "gc-live");
    process.env.GRAPHCOMPOSE_LIVE_DIR = elsewhere;

    createLiveMirror(install, projectDir).update(source, "current.pdf");

    assert.ok(fs.existsSync(path.join(elsewhere, "current.pdf")), "the override was ignored");
    assert.ok(fs.existsSync(path.join(projectDir, "current.pdf")), "the project copy was displaced");
  });
});

test("RENDER_NO_LIVE=1 writes nothing anywhere", () => {
  withoutEnv(() => {
    const { install, projectDir, source } = workspaceLayout("off");
    process.env.RENDER_NO_LIVE = "1";
    const live = createLiveMirror(install, projectDir);
    live.update(source, "current.pdf");
    live.manifest({ projectId: "demo", revisionId: "r", revisionDir: "r", hasDebug: false });
    live.announce();
    assert.deepEqual(fs.readdirSync(projectDir), []);
  });
});

test("a source that was never rendered is skipped silently", () => {
  withoutEnv(() => {
    const { install, projectDir } = workspaceLayout("missing");
    createLiveMirror(install, projectDir).update(path.join(projectDir, "nope.pdf"), "current.pdf");
    assert.ok(!fs.existsSync(path.join(projectDir, "current.pdf")));
  });
});
