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
import { fileURLToPath, pathToFileURL } from "node:url";

import { describeSeal, sealState } from "../lib/revision-seal.mjs";

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
    JSON.stringify(pathToFileURL(path.join(repoRoot, "scripts", "lib", "render-runtime.mjs")).href) +
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

test("the revise skill explains the refusal, not just the command", () => {
  // The first version of this asserted only that `new-revision` appears — which
  // it did before this change too, so it pinned nothing. What has to survive is
  // the explanation: that the render refuses, that the escape hatch is not the
  // answer, and what skipping the rule actually costs.
  const revise = fs.readFileSync(
    path.join(repoRoot, "skills", "workflows", "revise-template", "SKILL.md"),
    "utf8",
  );
  assert.match(revise, /new-revision/, "the command that opens a revision is not named");
  assert.match(revise, /visual-review\.json/, "nothing says which state makes the render refuse");
  assert.match(revise, /RENDER_SAME_REVISION/, "the escape hatch is never mentioned");
  assert.match(revise, /iterate-status/, "the cost to the loop bounds is not stated");
});

// --- the seal on the revision, not just on the render ---------------------------

/** Write a file with an mtime `seconds` after now. */
function writeAged(file, contents, seconds) {
  write(file, contents);
  const at = new Date(Date.now() + seconds * 1000);
  fs.utimesSync(file, at, at);
}

test("a source file edited after the review breaks the seal", () => {
  // The gate stops the second RENDER; the edit happens before it. Measured on a
  // real run: a template rewritten 714 seconds after the review that judged it,
  // leaving a revision whose source was never rendered and never reviewed —
  // which is exactly what a rollback target must not be.
  const s = scenario("sealbroken", { reviewed: true });
  writeAged(path.join(s.revision, "GeneratedTemplate.java"), "class T {}", 700);

  const state = sealState(s.revision);
  assert.equal(state.reviewed, true);
  assert.equal(state.broken, true);
  assert.equal(state.edited.length, 1);
  assert.match(describeSeal(state), /GeneratedTemplate\.java was modified 70\ds after the review/);
  assert.match(describeSeal(state), /not a state you can roll back to/);
});

test("a source file written just before its review does not break it", () => {
  // The review is written moments after the source it judges. Two files in the
  // same second are not evidence of anything.
  const s = scenario("sealok", { reviewed: true });
  write(path.join(s.revision, "GeneratedTemplate.java"), "class T {}");

  assert.equal(sealState(s.revision).broken, false);
  assert.equal(describeSeal(sealState(s.revision)), null);
});

test("a revision nothing has judged has no seal to break", () => {
  // new-revision copies the body forward, so every file in a fresh revision is
  // newer than the parent's review. Without a review of its own there is
  // nothing to compare against, and reporting one would fire on every pass.
  const s = scenario("sealnone", { reviewed: false });
  writeAged(path.join(s.revision, "GeneratedTemplate.java"), "class T {}", 700);

  const state = sealState(s.revision);
  assert.equal(state.reviewed, false);
  assert.equal(state.broken, false);
});

test("a generated test edited after the review is not a broken seal", () => {
  // The review judged the RENDER. A test exercises the template; it does not
  // compose the document, so editing it changes nothing the review looked at.
  // Counting it fired the seal on an ordinary act — every example in this
  // repository carries a generated test beside its template.
  const s = scenario("sealtest", { reviewed: true });
  writeAged(path.join(s.revision, "generated-test.java"), "class T {}", 700);
  assert.equal(sealState(s.revision).broken, false);

  writeAged(path.join(s.revision, "GeneratedTemplate.java"), "class T {}", 700);
  assert.equal(sealState(s.revision).broken, true, "the template still counts");
});

test("only the files the review was about count", () => {
  // A note, a log or a preview written afterwards says nothing about whether
  // the rendered source changed.
  const s = scenario("sealscope", { reviewed: true });
  for (const name of ["render.log", "notes.md", "output.png", "visual-analysis.json"]) {
    writeAged(path.join(s.revision, name), "later", 700);
  }
  assert.equal(sealState(s.revision).broken, false);

  writeAged(path.join(s.revision, "proposal-data.json"), "{}", 700);
  assert.equal(sealState(s.revision).broken, true, "the data file is part of what was rendered");
});

test("the refusal names an edit that has already happened", () => {
  const s = scenario("sealrefusal", { reviewed: true });
  writeAged(path.join(s.revision, "GeneratedTemplate.java"), "class T {}", 700);

  const { status, output } = render(s.project);
  assert.notEqual(status, 0);
  assert.match(output, /Already edited:/, "the refusal does not say the seal is already broken");
  assert.match(output, /copies the body forward/, "it does not say the edit will be carried over");
});
