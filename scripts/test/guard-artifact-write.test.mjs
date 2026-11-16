#!/usr/bin/env node
/**
 * scripts/test/guard-artifact-write.test.mjs — the convention is enforced, not
 * remembered.
 *
 * Three discovery workers each write one artifact. Asking three prompts to
 * route their write through a tool is the same shape of instruction that
 * `guard-bash.mjs` exists because nobody followed: measured over 23 sessions,
 * 450 shell reads of a template the pages asked to read through `source.mjs`.
 * So the write is refused at the moment it is reached, with the command that
 * should have been run in the refusal.
 *
 * The cases that matter are the ones where it must NOT fire: the harness's own
 * schemas and fixtures carry these filenames and are edited as source.
 *
 *   node --test scripts/test/
 */

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { GUARDED, judgeWrite } from "../hooks/guard-artifact-write.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOK = path.join(repoRoot, "scripts", "hooks", "guard-artifact-write.mjs");

const REV = "C:/Dev/projects/TestHarness/graphcompose-flow/projects/demo/revisions/revision-003";

test("every canonical discovery artifact is refused", () => {
  for (const name of GUARDED) {
    const verdict = judgeWrite(`${REV}/${name}`);
    assert.equal(verdict.block, true, `${name} was allowed to be written in place`);
  }
});

test("the data artifact is refused whatever the document kind names it", () => {
  for (const name of ["cv-data.json", "invoice-data.json", "cover-letter-data.json"]) {
    assert.equal(judgeWrite(`${REV}/${name}`).block, true, `${name} was allowed`);
  }
});

test("the refusal names the command that should have been run", () => {
  const verdict = judgeWrite(`${REV}/visual-analysis.json`);
  assert.match(verdict.message, /write-artifact\.mjs/);
  assert.match(verdict.message, /--artifact visual-analysis\.json/);
  assert.match(verdict.message, /GRAPHCOMPOSE_GUARD=off/, "the off switch is not named");
});

test("the handoff is written by its own tool, not by hand", () => {
  const verdict = judgeWrite(`${REV}/handoff.json`);
  assert.equal(verdict.block, true);
  assert.match(verdict.message, /handoff\.mjs write/);
  assert.ok(!/write-artifact/.test(verdict.message), "the handoff was pointed at the wrong tool");
});

test("Windows separators are judged the same as POSIX ones", () => {
  const win = String.raw`C:\Dev\projects\TestHarness\graphcompose-flow\projects\demo\revisions\revision-003\asset-request.json`;
  assert.equal(judgeWrite(win).block, true);
});

// ------------------------------------------------------- where it must not fire ---

test("the harness's own schemas and fixtures are source, not artifacts", () => {
  // These carry the same names and are edited as code. A guard that refused
  // them would block work that has nothing to do with the fan-out.
  for (const p of [
    "schemas/visual-analysis.schema.json",
    "scripts/test/fixtures/visual-analysis.json",
    "docs/handoff.json",
    // Same shape as a workspace revision, and maintained by hand — the
    // `projects/` segment is what tells the two apart.
    "examples/cv-reference/revisions/revision-003/architecture-plan.json",
    "examples/cv-reference/revisions/revision-001/cv-data.json",
  ]) {
    assert.equal(judgeWrite(p).block, false, `${p} was refused`);
  }
});

test("a workspace revision is recognised on either separator", () => {
  const posix = "/home/u/proj/graphcompose-flow/projects/demo/revisions/revision-002/visual-analysis.json";
  const win = String.raw`C:\Dev\proj\graphcompose-flow\projects\demo\revisions\revision-002\visual-analysis.json`;
  assert.equal(judgeWrite(posix).block, true, "a POSIX workspace path was let through");
  assert.equal(judgeWrite(win).block, true, "a Windows workspace path was let through");
});

test("an overflow fixture is a second dataset, not the artifact the barrier reads", () => {
  assert.equal(judgeWrite(`${REV}/invoice-data.overflow.json`).block, false);
});

test("anything else inside a revision is left alone", () => {
  for (const name of ["generated-template.java", "visual-review.json", "notes.md", "layout-snapshot.json"]) {
    assert.equal(judgeWrite(`${REV}/${name}`).block, false, `${name} was refused`);
  }
});

test("an empty or absent path is not a refusal", () => {
  assert.equal(judgeWrite("").block, false);
  assert.equal(judgeWrite(undefined).block, false);
});

// -------------------------------------------------------------- the hook itself ---

function hook(event, env = {}) {
  const run = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(event),
    encoding: "utf8",
    env: { ...process.env, GRAPHCOMPOSE_GUARD: "", ...env },
  });
  return { status: run.status, err: run.stderr ?? "" };
}

test("exit 2 blocks a canonical write and hands the model the reason", () => {
  const { status, err } = hook({ tool_name: "Write", tool_input: { file_path: `${REV}/visual-analysis.json` } });
  assert.equal(status, 2);
  assert.match(err, /write-artifact\.mjs/);
});

test("Edit is left alone, deliberately", () => {
  // A targeted change during the render loop, where there is one writer and no
  // concurrent reader. Forcing it through a whole-file rewrite would cost more
  // output tokens than the race costs anything.
  const { status } = hook({ tool_name: "Edit", tool_input: { file_path: `${REV}/cv-data.json` } });
  assert.equal(status, 0);
});

test("the off switch bypasses the hook", () => {
  const { status } = hook(
    { tool_name: "Write", tool_input: { file_path: `${REV}/visual-analysis.json` } },
    { GRAPHCOMPOSE_GUARD: "off" },
  );
  assert.equal(status, 0);
});

test("a hook that cannot parse its input never blocks", () => {
  const run = spawnSync(process.execPath, [HOOK], { input: "not json", encoding: "utf8" });
  assert.equal(run.status, 0, "a guard that fails by breaking would be worse than no guard");
});
