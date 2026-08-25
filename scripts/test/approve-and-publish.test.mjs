#!/usr/bin/env node
/**
 * scripts/test/approve-and-publish.test.mjs — the whole approval is one
 * command, and it refuses the same things the long way refused.
 *
 * The composite exists to cut eleven model turns to two, but a shortcut that
 * skips a guard is a regression wearing a perf improvement's clothes. So the
 * assertions mirror the contract the approve skill states: DRAFT-only, never
 * quietly over BLOCKED, the human's call over REVISE — and the parts the
 * telemetry showed being done by hand: the README's generated half, with
 * hand-written prose surviving a republish.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(repoRoot, "scripts", "approve-and-publish.mjs");

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcaap-${label}-`));
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

/**
 * A workspace with one project holding a DRAFT revision shaped like the real
 * serif run's: template, spec, provider, data naming an asset, that asset.
 */
function scenario({ status = "DRAFT", verdict = "READY_FOR_APPROVAL", priorApproved = false, label = "ws" } = {}) {
  const host = tempDir(label);
  const root = path.join(host, "graphcompose-flow");
  const project = path.join(root, "projects", "serif-cv");
  const revision = path.join(project, "revisions", "revision-002");

  write(path.join(root, "flow.config.json"), { schemaVersion: 1 });
  write(path.join(project, "template-project.json"), {
    projectName: "serif-cv",
    displayName: "Serif CV",
    targetGraphComposeVersion: "2.2.0",
    skillPack: "skills/versions/graphcompose-2.2",
    currentApprovedRevisionId: priorApproved ? "revision-001" : null,
    currentDraftRevisionId: status === "DRAFT" ? "revision-002" : null,
    docKind: "cv",
    specClass: "com.demchaav.cv.SerifCvSpec",
    specProviderClass: "com.demchaav.cv.SerifCvSpecProvider",
    render: { templateClass: "com.demchaav.cv.GeneratedCvTemplate" },
    schemaVersion: 1,
  });

  if (priorApproved) {
    const first = path.join(project, "revisions", "revision-001");
    write(path.join(first, "revision.json"), {
      id: "revision-001", parentRevisionId: null, status: "APPROVED",
      userRequest: "first", targetGraphComposeVersion: "2.2.0",
      skillPack: "skills/versions/graphcompose-2.2",
      createdAt: "2026-08-24T00:00:00.000Z",
      artifacts: { userRequest: "user-request.md" }, schemaVersion: 1,
    });
  }

  write(path.join(revision, "revision.json"), {
    id: "revision-002", parentRevisionId: priorApproved ? "revision-001" : null,
    status, userRequest: "the cv",
    targetGraphComposeVersion: "2.2.0", skillPack: "skills/versions/graphcompose-2.2",
    createdAt: "2026-08-24T01:00:00.000Z",
    artifacts: { userRequest: "user-request.md" }, schemaVersion: 1,
  });
  if (verdict !== null) {
    write(path.join(revision, "visual-review.json"), {
      schemaVersion: 1, verdict, mismatches: [],
      ...(verdict === "BLOCKED" ? { failureCategory: "VISUAL_MISMATCH" } : {}),
    });
  }
  write(
    path.join(revision, "generated-template.java"),
    "package com.demchaav.cv;\npublic final class GeneratedCvTemplate {}\n",
  );
  write(path.join(revision, "cv-data.json"), { avatarImage: "assets/avatar.png" });
  write(path.join(revision, "assets", "avatar.png"), "PNG");

  const runner = path.join(project, "render-runner");
  write(
    path.join(runner, "src", "main", "java", "com", "demchaav", "cv", "SerifCvSpec.java"),
    "package com.demchaav.cv;\npublic record SerifCvSpec() {}\n",
  );
  write(
    path.join(runner, "src", "main", "java", "com", "demchaav", "cv", "SerifCvSpecProvider.java"),
    "package com.demchaav.cv;\npublic final class SerifCvSpecProvider {}\n",
  );
  write(
    path.join(runner, "pom.xml"),
    "<project><properties><graphcompose.version>2.2.0</graphcompose.version></properties>" +
      "<dependencies><dependency><groupId>io.github.demchaav</groupId>" +
      "<artifactId>graph-compose</artifactId><version>${graphcompose.version}</version>" +
      "</dependency></dependencies></project>",
  );

  return { root, project, revision, bundle: path.join(root, "templates", "serif-cv") };
}

function runCli(root, extra = []) {
  const spawned = spawnSync(
    process.execPath,
    [CLI, "--project", "serif-cv", "--root", root, ...extra],
    { encoding: "utf8" },
  );
  let parsed = null;
  try {
    parsed = JSON.parse(spawned.stdout);
  } catch {
    /* text mode or failure */
  }
  return { status: spawned.status, parsed, output: `${spawned.stdout ?? ""}${spawned.stderr ?? ""}` };
}

const revisionOf = (s) =>
  JSON.parse(fs.readFileSync(path.join(s.revision, "revision.json"), "utf8"));

test("one command approves, publishes, writes the README and verifies", () => {
  const s = scenario({ priorApproved: true, label: "happy" });
  const { status, parsed } = runCli(s.root, ["--json"]);

  assert.equal(status, 0, JSON.stringify(parsed?.steps));
  assert.equal(parsed.approved, "revision-002");
  assert.deepEqual(parsed.superseded, ["revision-001"]);
  assert.equal(parsed.verdictAtApproval, "READY_FOR_APPROVAL");
  assert.ok(parsed.steps.every((x) => x.ok), "a step failed on the happy path");

  // The state machine actually moved — this is not a report about intentions.
  assert.equal(revisionOf(s).status, "APPROVED");
  assert.ok(fs.existsSync(path.join(s.bundle, "template.json")), "no bundle was published");
  assert.ok(fs.existsSync(path.join(s.bundle, "assets", "avatar.png")), "assets did not reach the bundle");
  assert.equal(parsed.verify.verified, true, "the bundle did not verify");
});

test("the README's generated half is written, and marks its hand-written half", () => {
  const s = scenario({ label: "readme" });
  runCli(s.root, ["--json"]);

  const readme = fs.readFileSync(path.join(s.bundle, "README.md"), "utf8");
  assert.match(readme, /# Serif CV/);
  assert.match(readme, /graph-compose.*2\.2\.0/s, "dependencies are missing");
  // The published class, not the revision-local one: the publisher renames
  // GeneratedCvTemplate to <DisplayName>Template, and the README must follow.
  assert.match(readme, /new SerifCvTemplate\(\)\.compose/, "the usage snippet is missing");
  assert.match(readme, /Hand-written sections below/, "no marker — regeneration would clobber prose");
  assert.match(readme, /## Design notes/);
});

test("a republish regenerates above the marker and keeps everything below it", () => {
  const s = scenario({ label: "republish" });
  runCli(s.root, ["--json"]);

  const readmePath = path.join(s.bundle, "README.md");
  const filled = fs
    .readFileSync(readmePath, "utf8")
    .replace(/_Not written yet[^_]*_/, "The headline derives from measured cap height.");
  fs.writeFileSync(readmePath, filled, "utf8");

  // New draft, approve again.
  const meta = JSON.parse(fs.readFileSync(path.join(s.project, "template-project.json"), "utf8"));
  meta.currentDraftRevisionId = "revision-003";
  fs.writeFileSync(path.join(s.project, "template-project.json"), JSON.stringify(meta, null, 2));
  const again = path.join(s.project, "revisions", "revision-003");
  fs.cpSync(s.revision, again, { recursive: true });
  const r = JSON.parse(fs.readFileSync(path.join(again, "revision.json"), "utf8"));
  r.id = "revision-003";
  r.status = "DRAFT";
  r.parentRevisionId = "revision-002";
  fs.writeFileSync(path.join(again, "revision.json"), JSON.stringify(r, null, 2));

  const { status, parsed } = runCli(s.root, ["--json"]);
  assert.equal(status, 0, JSON.stringify(parsed?.steps));

  const readme = fs.readFileSync(readmePath, "utf8");
  assert.match(readme, /measured cap height/, "a republish ate the hand-written prose");
  assert.match(readme, /revision-003/, "the generated half was not regenerated");
});

test("a README without the marker is left alone", () => {
  // A fully hand-written README is someone's work. Silently rewriting it is
  // the publisher-clobbers-content bug wearing a new hat.
  const s = scenario({ label: "legacy" });
  fs.mkdirSync(s.bundle, { recursive: true });
  fs.writeFileSync(path.join(s.bundle, "README.md"), "# My own README\n\nWritten by hand.\n", "utf8");

  const { status, parsed } = runCli(s.root, ["--json"]);
  assert.equal(status, 0, JSON.stringify(parsed?.steps));
  assert.match(parsed.readme.state, /left alone/);
  assert.equal(
    fs.readFileSync(path.join(s.bundle, "README.md"), "utf8"),
    "# My own README\n\nWritten by hand.\n",
  );
});

test("no draft means a named refusal, not a guess", () => {
  const s = scenario({ status: "APPROVED", label: "nodraft" });
  const { status, parsed } = runCli(s.root, ["--json"]);

  assert.equal(status, 1);
  assert.equal(parsed.steps[0].name, "resolve the draft");
  assert.match(parsed.steps[0].error, /no current draft/);
  assert.equal(parsed.approved, null, "something was approved anyway");
});

test("an explicitly named non-DRAFT revision is refused", () => {
  const s = scenario({ status: "APPROVED", label: "notdraft" });
  const { status, parsed } = runCli(s.root, ["--revision", "revision-002", "--json"]);

  assert.equal(status, 1);
  assert.match(parsed.steps[0].error, /is APPROVED, not DRAFT/);
});

test("a BLOCKED verdict stops the fast path before anything changes", () => {
  const s = scenario({ verdict: "BLOCKED", label: "blocked" });
  const { status, parsed } = runCli(s.root, ["--json"]);

  assert.equal(status, 1);
  assert.match(parsed.steps[1].error, /BLOCKED/);
  // Crucially: the refusal happened before the state machine moved.
  assert.equal(revisionOf(s).status, "DRAFT", "the revision was approved despite BLOCKED");
  assert.ok(!fs.existsSync(s.bundle), "a bundle was published despite BLOCKED");
});

test("a REVISE verdict does not block — the human approving IS the decision — but is recorded", () => {
  const s = scenario({ verdict: "REVISE", label: "revise" });
  const { status, parsed } = runCli(s.root, ["--json"]);

  assert.equal(status, 0, JSON.stringify(parsed?.steps));
  assert.equal(parsed.verdictAtApproval, "REVISE");
  assert.equal(revisionOf(s).status, "APPROVED");
});

test("an unreviewed render approves, and says it was unreviewed", () => {
  const s = scenario({ verdict: null, label: "unreviewed" });
  const { status, parsed } = runCli(s.root, ["--json"]);

  assert.equal(status, 0);
  assert.equal(parsed.verdictAtApproval, "NO_REVIEW");
});

test("a verify failure exits 1 while reporting the completed approve and publish", () => {
  // By verify time the approve and the publish have happened. The honest
  // report is "done, and broken", not a rollback pretence.
  const s = scenario({ label: "verifyfail" });
  fs.rmSync(path.join(s.revision, "assets", "avatar.png"));

  const { status, parsed } = runCli(s.root, ["--json"]);
  assert.equal(status, 1);
  assert.equal(parsed.approved, "revision-002", "the completed approve was hidden");
  assert.equal(revisionOf(s).status, "APPROVED");
  const verifyStep = parsed.steps.find((x) => x.name.startsWith("verify"));
  assert.match(verifyStep.error, /avatar\.png/);
});

test("--verify none skips verification and says so by omission", () => {
  const s = scenario({ label: "noverify" });
  const { status, parsed } = runCli(s.root, ["--verify", "none", "--json"]);

  assert.equal(status, 0);
  assert.equal(parsed.verify, null);
  assert.ok(!parsed.steps.some((x) => x.name.startsWith("verify")));
});

test("usage errors are usage errors", () => {
  const bad = spawnSync(process.execPath, [CLI, "--verify", "static"], { encoding: "utf8" });
  assert.equal(bad.status, 2);
  const badTier = spawnSync(process.execPath, [CLI, "--project", "x", "--verify", "loudly"], {
    encoding: "utf8",
  });
  assert.equal(badTier.status, 2);
});
