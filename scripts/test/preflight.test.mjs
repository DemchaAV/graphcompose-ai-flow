#!/usr/bin/env node
/**
 * scripts/test/preflight.test.mjs — one call, and every fact in it is right.
 *
 * Preflight replaces a dozen shell calls at the start of a run, which means a
 * wrong answer here is worse than no answer: it is trusted without being
 * re-derived. So the assertions are about correctness of the facts, not about
 * the shape of the payload — the workspace it names, the version it resolves,
 * the scope it routes to, and the files it says the pack recommends.
 *
 * The last of those has already caught a real defect: the loading map's worked
 * starting point for a CV is followed by a sentence beginning "Not `tables`
 * unless...", and reading backticks past the list added the one file the pack
 * had just told you to leave out.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(repoRoot, "scripts", "preflight.mjs");

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcpre-${label}-`));
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
  fs.writeFileSync(file, contents, "utf8");
}

function run(args) {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    /* left null */
  }
  return { status: result.status, parsed, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

/** A Java project with a workspace and one project in it. */
function scenario({ version = "2.2.0", docKind = "cv", revisions = [] } = {}, label = "ws") {
  const host = tempDir(label);
  write(
    path.join(host, "pom.xml"),
    `<project><dependencies><dependency><groupId>io.github.demchaav</groupId>` +
      `<artifactId>graph-compose</artifactId><version>${version}</version>` +
      `</dependency></dependencies></project>\n`,
  );
  const root = path.join(host, "graphcompose-flow");
  write(path.join(root, "flow.config.json"), JSON.stringify({ schemaVersion: 1 }));

  const project = path.join(root, "projects", "demo");
  write(
    path.join(project, "template-project.json"),
    JSON.stringify({ projectName: "demo", docKind, targetGraphComposeVersion: version }),
  );
  for (const [id, body] of revisions) {
    write(path.join(project, "revisions", id, "revision.json"), JSON.stringify(body));
  }
  return { host, root, project };
}

test("the workspace reported is the user's project, not the harness install", () => {
  const { host, root } = scenario({}, "workspace");
  const { parsed } = run(["--project-dir", host, "--project", "demo"]);

  assert.equal(parsed.workspace.root, root);
  assert.equal(parsed.workspace.mode, "discovered");
  assert.match(parsed.workspace.banner, /discovered/);
});

test("the version comes from the project's own pin", () => {
  const { host } = scenario({ version: "2.2.0" }, "version");
  const { status, parsed } = run(["--project-dir", host, "--project", "demo"]);

  assert.equal(status, 0);
  assert.equal(parsed.graphCompose.status, "supported");
  assert.equal(parsed.graphCompose.version, "2.2.0");
  assert.equal(parsed.graphCompose.line, "2.2");
});

test("an unsupported line exits 3 and says which packs exist", () => {
  // Same code as resolve-version, so a caller branches identically on either.
  const { host } = scenario({ version: "9.9.0" }, "unsupported");
  const { status, parsed } = run(["--project-dir", host, "--project", "demo"]);

  assert.equal(status, 3);
  assert.equal(parsed.graphCompose.status, "unsupported");
  assert.ok(parsed.graphCompose.availablePacks.length > 0);
});

test("a project with no build file exits 4", () => {
  const bare = tempDir("nogc");
  const { status, parsed } = run(["--project-dir", bare]);
  assert.equal(status, 4);
  assert.equal(parsed.graphCompose.status, "unknown");
});

test("a first generation routes to create-template on the new scope", () => {
  const { host } = scenario({}, "new");
  const { parsed } = run(["--project-dir", host, "--project", "demo"]);

  assert.equal(parsed.routing.scope, "new");
  assert.equal(parsed.routing.workflow, "create-template");
  assert.equal(parsed.routing.revision, "revision-001");
  assert.ok(parsed.routing.stages.length > 0);
  assert.ok(parsed.routing.stages.every((s) => s.id && s.kind && s.label));
});

test("an existing revision routes by the scope it records", () => {
  const { host } = scenario(
    {
      revisions: [
        ["revision-001", { id: "revision-001", status: "APPROVED", parentRevisionId: null }],
        ["revision-002", { id: "revision-002", status: "DRAFT", parentRevisionId: "revision-001", scope: "refactor-only" }],
      ],
    },
    "scoped",
  );
  const { parsed } = run(["--project-dir", host, "--project", "demo"]);

  assert.equal(parsed.routing.revision, "revision-002");
  assert.equal(parsed.routing.scope, "refactor-only");
  assert.equal(parsed.routing.revisionStatus, "DRAFT");
});

test("the loop bounds come along, so nothing has to re-read the config", () => {
  const { host } = scenario({}, "limits");
  const { parsed } = run(["--project-dir", host, "--project", "demo"]);

  for (const key of ["maxIterations", "maxConsecutiveBuildFailures", "maxSameMismatchAttempts"]) {
    assert.ok(Number.isInteger(parsed.routing.limits[key]), `${key} is missing`);
  }
});

test("the CV starting point excludes the file the pack says to leave out", () => {
  const { host } = scenario({ docKind: "cv" }, "startingpoint");
  const { parsed } = run(["--project-dir", host, "--project", "demo"]);

  const files = parsed.skills.startingPoint.files;
  assert.ok(files.includes("00-api-surface.md"), "the always-load file is missing");
  assert.ok(files.includes("shapes-and-containers.md"));
  // "Not `tables` unless the CV has genuinely tabular content" follows the
  // list; reading past the blank line inverts that advice.
  assert.ok(!files.includes("tables.md"), `tables.md leaked in: ${files.join(", ")}`);
});

test("the loading map's tables come through as data rather than prose", () => {
  const { host } = scenario({}, "loadingmap");
  const { parsed } = run(["--project-dir", host, "--project", "demo"]);

  assert.ok(parsed.skills.always.includes("00-api-surface.md"));
  assert.ok(parsed.skills.byTask.length > 0);
  assert.ok(parsed.skills.byFeature.length > 0);
  for (const row of [...parsed.skills.byTask, ...parsed.skills.byFeature]) {
    assert.ok(row.when && row.files.length > 0, `a malformed row: ${JSON.stringify(row)}`);
  }
});

test("what previous runs learned is offered before the work starts", () => {
  const { host } = scenario({}, "knowledge");
  const { parsed } = run(["--project-dir", host, "--project", "demo"]);

  assert.ok(parsed.knowledge.observations.length > 0, "no observations surfaced for 2.2");
  assert.ok(parsed.knowledge.probes.includes("anchor-alignment"), `probes: ${parsed.knowledge.probes}`);
});

test("tool readiness is reported now rather than at the first render", () => {
  const { host } = scenario({}, "tools");
  const { parsed } = run(["--project-dir", host, "--project", "demo"]);

  for (const key of ["revisionManager", "visualDiff", "previewRenderer"]) {
    assert.equal(typeof parsed.tools[key], "boolean", `${key} was not checked`);
  }
  assert.equal(parsed.tools.setupCommand, "npm run setup");
  assert.ok(Array.isArray(parsed.tools.unbuilt), "what is unbuilt is not stated as a list");
  assert.ok(Array.isArray(parsed.tools.absent), "what is absent is not stated as a list");
});

test("an unbuilt install is told to build before it is told to do anything else", () => {
  // A fresh plugin install carries no dist/ and no jar: they ship as source.
  // The old advice was to create a workspace and render, which succeeds at the
  // first step and exits 69 at the second — the twenty-minutes-in discovery
  // this report exists to prevent. Nothing pointed at the fix, because
  // nextCommands never read the tool report at all.
  const install = tempDir("unbuilt");
  for (const dir of ["scripts", "config", "skills"]) {
    fs.cpSync(path.join(repoRoot, dir), path.join(install, dir), { recursive: true });
  }
  // tools/ is deliberately not copied: nothing is built in this install.
  assert.ok(!fs.existsSync(path.join(install, "tools")), "the fixture built something");

  const { host } = scenario({}, "unbuilt-host");
  const result = spawnSync(
    process.execPath,
    [path.join(install, "scripts", "preflight.mjs"), "--project-dir", host, "--project", "demo"],
    { encoding: "utf8" },
  );
  const parsed = JSON.parse(result.stdout);

  assert.equal(parsed.tools.needsSetup, true);
  assert.equal(parsed.tools.ready, false);
  assert.deepEqual(
    parsed.tools.unbuilt.sort(),
    ["previewRenderer", "revisionManager", "visualDiff"],
    "the three that ship as source were not all named",
  );
  assert.equal(
    parsed.nextCommands[0]?.run,
    "npm run setup",
    `the first thing to run was ${parsed.nextCommands[0]?.run ?? "nothing"}`,
  );
  assert.match(parsed.nextCommands[0].why, /69/, "the why does not say what happens without it");
});

test("a built install is not told to build, and says so as a single flag", () => {
  // The other direction: `setupCommand` used to be a constant that appeared
  // whether or not it was needed, so its presence meant nothing either way.
  const { host } = scenario({}, "built");
  const { parsed } = run(["--project-dir", host, "--project", "demo"]);

  if (parsed.tools.unbuilt.length > 0) return; // this checkout has not run setup
  assert.equal(parsed.tools.needsSetup, false);
  assert.ok(
    !parsed.nextCommands.some((c) => c.run === "npm run setup"),
    "a built install was still told to build",
  );
});

test("a project with no workspace is told to create one first", () => {
  const bare = tempDir("noworkspace");
  write(
    path.join(bare, "pom.xml"),
    "<project><dependencies><dependency><groupId>io.github.demchaav</groupId>" +
      "<artifactId>graph-compose</artifactId><version>2.2.0</version></dependency></dependencies></project>",
  );
  const { parsed } = run(["--project-dir", bare]);

  assert.equal(parsed.workspace.mode, "install");
  assert.ok(
    parsed.nextCommands.some((c) => c.run.includes("init-workspace")),
    "the first thing to do was not named",
  );
});

test("an unknown project is reported as absent, not invented", () => {
  const { host } = scenario({}, "missing");
  const { parsed } = run(["--project-dir", host, "--project", "no-such-project"]);
  assert.equal(parsed.project.exists, false);
});

test("--text prints a summary a person can read", () => {
  const { host } = scenario({}, "text");
  const result = spawnSync(process.execPath, [CLI, "--project-dir", host, "--project", "demo", "--text"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /GraphCompose 2\.2\.0/);
  assert.match(result.stdout, /Workflow: create-template/);
});
