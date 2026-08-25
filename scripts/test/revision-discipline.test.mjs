#!/usr/bin/env node
/**
 * scripts/test/revision-discipline.test.mjs — a correction opens a revision.
 *
 * "Every change creates a NEW revision" is the first non-negotiable in this
 * project's own contract, and nothing enforced it: `new-revision` is a command
 * an agent is free not to run.
 *
 * Measured on a real proposal run — one revision, created 17:17 and approved
 * 19:40, absorbing three corrections in place. The template was rewritten, the
 * render replaced and the review overwritten, so:
 *
 *   - there was no earlier state to roll back to, which is the whole point of
 *     the revision model;
 *   - the two corrections survive nowhere in the record, because `userRequest`
 *     holds the first request only;
 *   - `iterate-status` counts iterations by walking the revision chain, so it
 *     saw one pass where there had been three. Every loop bound — maximum
 *     iterations, same-mismatch attempts, consecutive build failures — was off
 *     for that run.
 *
 * The signal is exact: a revision that already carries a `visual-review.json`
 * has had its pass judged. Rendering into it again is the moment a new revision
 * should have been opened. A failed compile fixed and re-rendered inside the
 * same pass is not that — there is no review yet.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcrd-${label}-`));
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
  fs.writeFileSync(file, typeof contents === "string" ? contents : JSON.stringify(contents), "utf8");
}

/** A project with one revision, optionally already reviewed. */
function scenario(label, { reviewed }) {
  const root = path.join(tempDir(label), "graphcompose-flow");
  const project = path.join(root, "projects", "demo");
  const revision = path.join(project, "revisions", "revision-001");
  write(path.join(root, "flow.config.json"), { schemaVersion: 1 });
  write(path.join(project, "template-project.json"), {
    projectName: "demo",
    schemaVersion: 1,
    render: { templateClass: "com.example.Demo" },
  });
  write(path.join(revision, "revision.json"), { id: "revision-001", status: "DRAFT", schemaVersion: 1 });
  if (reviewed) {
    write(path.join(revision, "visual-review.json"), { schemaVersion: 1, verdict: "REVISE", mismatches: [] });
  }
  return { root, project, revision };
}

/**
 * Call runRender and report how it ended.
 *
 * A subprocess, because the guard calls `abort`, which exits the process. What
 * matters is that it refuses BEFORE anything expensive — no Maven, no JVM — so
 * the test needs neither.
 */
function render(projectDir, env = {}) {
  const script =
    "import { runRender } from " +
    JSON.stringify(`file:///${path.join(repoRoot, "scripts", "lib", "render-runtime.mjs").replace(/\\/g, "/")}`) +
    ";\n" +
    "runRender({ repoRoot: process.argv[2], projectId: 'demo', revisionId: 'revision-001', projectDir: process.argv[3] });\n";
  const file = path.join(tempDir("driver"), "drive.mjs");
  write(file, script);
  const spawned = spawnSync(process.execPath, [file, repoRoot, projectDir], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return { status: spawned.status, output: `${spawned.stdout ?? ""}${spawned.stderr ?? ""}` };
}

test("rendering into a revision that has already been reviewed is refused", () => {
  const s = scenario("reviewed", { reviewed: true });
  const { status, output } = render(s.project);

  assert.notEqual(status, 0, "it rendered over the render the review was written about");
  assert.match(output, /already has a visual-review\.json/);
  assert.match(output, /new-revision/, "the command that should have been run is not named");
  assert.match(output, /RENDER_SAME_REVISION=1/, "there is no way through for someone who means it");
});

test("the refusal happens before anything expensive is started", () => {
  // The guard is worth nothing if it fires after a Maven build. These projects
  // have no runner pom and no template, so reaching either would fail with a
  // different message entirely.
  const s = scenario("early", { reviewed: true });
  const { output } = render(s.project);

  assert.ok(!/mvn|maven|BUILD FAILURE/i.test(output), `a build was started first: ${output}`);
  assert.ok(!/classpath/i.test(output), `it got as far as resolving a classpath: ${output}`);
});

test("a revision with no review yet renders — a fixed compile is not a new pass", () => {
  // The ordinary within-pass case: the template did not build, it was fixed,
  // and it renders again. Nothing has judged it, so nothing is overwritten.
  const s = scenario("unreviewed", { reviewed: false });
  const { output } = render(s.project);

  assert.ok(
    !/already has a visual-review/.test(output),
    "an unreviewed revision was treated as a second pass",
  );
});

test("RENDER_SAME_REVISION=1 says so out loud rather than passing in silence", () => {
  const s = scenario("escape", { reviewed: true });
  const { output } = render(s.project, { RENDER_SAME_REVISION: "1" });

  assert.match(output, /re-rendering revision-001, which already has a review/);
});

test("the skills tell the reader what the refusal means", () => {
  const revise = fs.readFileSync(
    path.join(repoRoot, "skills", "workflows", "revise-template", "SKILL.md"),
    "utf8",
  );
  assert.match(
    revise,
    /new-revision/,
    "the revise workflow never names the command that opens a revision",
  );
});
