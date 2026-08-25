#!/usr/bin/env node
/**
 * scripts/test/preview-live.test.mjs — the preview opens the mirror that exists.
 *
 * There are two live mirrors and they are not the same file. Every render
 * writes `current.pdf` into the project folder, always. The shared `live/` copy
 * is written only when the install IS the workspace — harness development — or
 * when GRAPHCOMPOSE_LIVE_DIR names somewhere on purpose.
 *
 * This command only ever looked in `live/`, which made it unopenable in exactly
 * the arrangement most people run: a plugin install, where that copy does not
 * exist. It reported "nothing to open yet" and told the reader to render
 * something they had already rendered.
 *
 * Launching a viewer is not asserted — that is the OS's job and a test that
 * spawned one would leave windows behind. What is asserted is which file the
 * command resolves to, and that the two ways of having nothing say different
 * things, because the fix differs.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(repoRoot, "scripts", "preview-live.mjs");

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcpv-${label}-`));
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
  fs.writeFileSync(file, contents);
}

/** A workspace with one project, optionally already rendered. */
function workspace(label, { rendered = false } = {}) {
  const root = path.join(tempDir(label), "graphcompose-flow");
  write(path.join(root, "flow.config.json"), JSON.stringify({ schemaVersion: 1 }));
  const project = path.join(root, "projects", "demo");
  write(path.join(project, "template-project.json"), JSON.stringify({ projectName: "demo" }));
  if (rendered) {
    write(path.join(project, "current.pdf"), "%PDF-1.4\n");
    write(path.join(project, "current-debug.pdf"), "%PDF-1.4\n");
  }
  return { root, project };
}

function run(args, env = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    // Point the viewer lookup at nothing so a passing test cannot open a window.
    env: { ...process.env, SUMATRAPDF_PATH: path.join(os.tmpdir(), "no-such-viewer.exe"), ...env },
  });
  return { status: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

test("--project opens that project's own mirror, wherever the workspace is", () => {
  const ws = workspace("project", { rendered: true });
  const { status, output } = run(["--root", ws.root, "--project", "demo"]);

  assert.equal(status, 0, output);
  assert.ok(
    output.includes(path.join(ws.project, "current.pdf")),
    `it opened something else: ${output}`,
  );
});

test("--debug picks the render with the guide lines drawn on", () => {
  const ws = workspace("debug", { rendered: true });
  const { status, output } = run(["--root", ws.root, "--project", "demo", "--debug"]);

  assert.equal(status, 0, output);
  assert.ok(output.includes(path.join(ws.project, "current-debug.pdf")), output);
});

test("a project with nothing rendered says so, and names the render for it", () => {
  const ws = workspace("unrendered");
  const { status, output } = run(["--root", ws.root, "--project", "demo"]);

  assert.equal(status, 1);
  assert.match(output, /nothing has been rendered for "demo" yet/i);
  assert.match(output, /render\.mjs demo/, "the command that would fix it is not named");
});

test("no shared copy is a different problem, and says a different thing", () => {
  // The old message told the reader to render something, which they had done:
  // the render wrote the project's mirror and this command was reading another
  // one. The fix is to name the project, so that is what it says.
  const empty = tempDir("nolive");
  const { status, output } = run([], { GRAPHCOMPOSE_LIVE_DIR: empty });

  assert.equal(status, 1);
  assert.match(output, /only when the install is the workspace/i);
  assert.match(output, /--project <id>/, "the reader is not told how to open theirs");
});

test("GRAPHCOMPOSE_LIVE_DIR still points the shared copy somewhere on purpose", () => {
  const live = tempDir("livedir");
  write(path.join(live, "current.pdf"), "%PDF-1.4\n");
  const { status, output } = run([], { GRAPHCOMPOSE_LIVE_DIR: live });

  assert.equal(status, 0, output);
  assert.ok(output.includes(path.join(live, "current.pdf")), output);
});
