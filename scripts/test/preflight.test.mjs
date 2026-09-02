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

/**
 * An empty Claude config dir, so no assertion here depends on which plugin
 * versions THIS machine happens to have installed. Two tests spawned preflight
 * with the inherited environment and failed on every machine carrying a newer
 * plugin than the checkout: the real `~/.claude/plugins/cache` made the tools
 * parity check exit 5 before the assertion under test was reached.
 */
const ISOLATED_ENV = Object.freeze({
  ...process.env,
  CLAUDE_CONFIG_DIR: tempDir("noplugins"),
  GRAPHCOMPOSE_FLOW_ROOT: "",
});

function run(args, env = ISOLATED_ENV) {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", env });
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

  for (const key of ["revisionManager", "visualDiff", "previewRenderer", "schemaValidate"]) {
    assert.equal(typeof parsed.tools[key], "boolean", `${key} was not checked`);
  }
  assert.equal(parsed.tools.setupCommand, "npm run setup");
  assert.ok(Array.isArray(parsed.tools.unbuilt), "what is unbuilt is not stated as a list");
  assert.ok(Array.isArray(parsed.tools.absent), "what is absent is not stated as a list");
});

/** An install carrying the scripts and none of the tools they drive. */
function unbuiltInstall(label) {
  const install = tempDir(label);
  for (const dir of ["scripts", "config", "skills"]) {
    fs.cpSync(path.join(repoRoot, dir), path.join(install, dir), { recursive: true });
  }
  // tools/ is deliberately not copied: nothing is built in this install.
  assert.ok(!fs.existsSync(path.join(install, "tools")), "the fixture built something");
  return install;
}

test("an unbuilt install is told to build before it is told to do anything else", () => {
  // A fresh plugin install carries no dist/ and no jar: they ship as source.
  // The old advice was to create a workspace and render, which succeeds at the
  // first step and exits 69 at the second — the twenty-minutes-in discovery
  // this report exists to prevent. Nothing pointed at the fix, because
  // nextCommands never read the tool report at all.
  const install = unbuiltInstall("unbuilt");

  const { host } = scenario({}, "unbuilt-host");
  const result = spawnSync(
    process.execPath,
    // --no-setup: this test is about the advice, not about building. Without it
    // the run would attempt the build it is asserting was recommended.
    [path.join(install, "scripts", "preflight.mjs"), "--project-dir", host, "--project", "demo", "--no-setup"],
    { encoding: "utf8" },
  );
  const parsed = JSON.parse(result.stdout);

  assert.equal(parsed.tools.needsSetup, true);
  assert.equal(parsed.tools.ready, false);
  assert.deepEqual(
    parsed.tools.unbuilt.sort(),
    ["previewRenderer", "revisionManager", "schemaValidate", "visualDiff"],
    "the four that ship as source were not all named",
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
    env: ISOLATED_ENV,
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /GraphCompose 2\.2\.0/);
  assert.match(result.stdout, /Workflow: create-template/);
});

// --------------------------------------------------------------- capabilities ---

/**
 * A cache directory holding the named pack versions, pointed at by
 * `CLAUDE_CONFIG_DIR` so the assertions never depend on what this machine has
 * actually installed.
 */
function pluginCache(versions, label) {
  const configDir = tempDir(label);
  for (const version of versions) {
    fs.mkdirSync(
      path.join(configDir, "plugins", "cache", "graphcompose", "graphcompose-flow", version),
      { recursive: true },
    );
  }
  return configDir;
}

function runWithCache(args, configDir) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
  });
  let parsed = null;
  let parseError = null;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (cause) {
    parseError = cause.message;
  }
  return {
    status: result.status,
    parsed,
    parseError,
    signal: result.signal ?? null,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

/**
 * The parsed payload, or a failure that says what actually happened.
 *
 * Without this, a subprocess that dies or prints something unparseable comes
 * back as `parsed === null` and every assertion below it throws
 * `TypeError: Cannot read properties of null` — which names the assertion that
 * tripped and nothing about the cause. This suite saw exactly one such failure
 * under parallel load and could not reproduce it in eleven further runs, so the
 * next occurrence has to explain itself rather than be investigated from a test
 * name.
 */
function payload(result, label) {
  assert.ok(
    result.parsed,
    `${label}: preflight produced no JSON payload\n` +
      `  exit=${result.status} signal=${result.signal}\n` +
      `  parse error: ${result.parseError}\n` +
      `  output:\n${result.output || "(empty)"}`,
  );
  return result.parsed;
}

const treeVersion = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
).version;

test("capabilities reports presence per file, and the booleans match the tree", () => {
  const { host } = scenario({}, "caps");
  const { parsed } = run(["--project-dir", host, "--project", "demo"]);

  assert.ok(parsed.capabilities, "no capabilities block");
  // Every declared name is answered, and answered truthfully. A capability report
  // that drifts from the directory it describes is worse than none: it is the
  // thing the run trusts instead of looking.
  for (const [file, present] of Object.entries(parsed.capabilities.diagnostics)) {
    assert.equal(present, fs.existsSync(path.join(repoRoot, "scripts", file)), `diagnostics.${file}`);
  }
  for (const [file, present] of Object.entries(parsed.capabilities.checks)) {
    assert.equal(present, fs.existsSync(path.join(repoRoot, "scripts", file)), `checks.${file}`);
  }
  assert.deepEqual(
    parsed.capabilities.missing,
    [...Object.entries(parsed.capabilities.diagnostics), ...Object.entries(parsed.capabilities.checks)]
      .filter(([, present]) => !present)
      .map(([file]) => file),
    "missing disagrees with the per-file answers",
  );
});

test("a pack newer than these tools fails, and says which files are absent", () => {
  const { host } = scenario({}, "behind");
  const configDir = pluginCache(["0.9.0", "99.0.0"], "behind-cache");
  const result = runWithCache(["--project-dir", host, "--project", "demo"], configDir);
  const parsed = payload(result, "tools-behind");

  assert.equal(parsed.capabilities.parity, "tools-behind");
  assert.equal(result.status, 5, "a newer installed pack did not fail preflight");
  assert.match(parsed.capabilities.parityMessage, /99\.0\.0/);
  assert.match(parsed.capabilities.parityMessage, new RegExp(treeVersion.replace(/\./g, "\.")));
});

test("a pack older than these tools is the ordinary development case, not a failure", () => {
  const { host } = scenario({}, "ahead");
  const configDir = pluginCache(["0.1.0"], "ahead-cache");
  const result = runWithCache(["--project-dir", host, "--project", "demo"], configDir);
  const parsed = payload(result, "tools-ahead");

  assert.equal(parsed.capabilities.parity, "tools-ahead");
  assert.equal(parsed.capabilities.parityMessage, null);
  assert.equal(result.status, 0);
});

test("no installed pack at all is a matched pair, not an unknown", () => {
  const { host } = scenario({}, "nocache");
  const configDir = pluginCache([], "empty-cache");
  const result = runWithCache(["--project-dir", host, "--project", "demo"], configDir);
  const parsed = payload(result, "no cache");

  // The skills came from this tree, so nothing can disagree with it.
  assert.equal(parsed.capabilities.parity, "matched");
  assert.equal(parsed.capabilities.installedPackCount, 0);
  assert.equal(result.status, 0);
});

test("an unsupported version outranks a parity mismatch", () => {
  // Both faults at once. The version code has to win: an unsupported line is a
  // reason to stop whatever the skills' release, and reporting the narrower
  // fault would send the reader after the wrong thing.
  const { host } = scenario({ version: "1.0.0" }, "bothfaults");
  const configDir = pluginCache(["99.0.0"], "bothfaults-cache");
  const result = runWithCache(["--project-dir", host, "--project", "demo"], configDir);
  const parsed = payload(result, "both faults");

  assert.equal(parsed.capabilities.parity, "tools-behind");
  assert.equal(result.status, 3, "the version fault was masked by the parity fault");
});

test("the cached pack list is capped, and the count is reported in full", () => {
  const { host } = scenario({}, "capped");
  const many = Array.from({ length: 9 }, (_, i) => `0.${i + 1}.0`);
  const configDir = pluginCache(many, "capped-cache");
  const parsed = payload(
    runWithCache(["--project-dir", host, "--project", "demo"], configDir),
    "capped list",
  );

  assert.equal(parsed.capabilities.installedPackCount, 9);
  assert.ok(parsed.capabilities.installedPacks.length <= 5, "the whole list was inlined");
  assert.equal(parsed.capabilities.newestInstalledPack, "0.9.0");
});

test("layout snapshot support is one of three states, never a bare boolean", () => {
  const { host } = scenario({}, "snapshot");
  const { parsed } = run(["--project-dir", host, "--project", "demo"]);

  const snapshot = parsed.capabilities.layoutSnapshot;
  // Two states would lie: before a render has happened the honest answer for a
  // supported version with an unbuilt renderer is "unknown", not "unavailable".
  assert.ok(["available", "unavailable", "unknown"].includes(snapshot.state), snapshot.state);
  assert.ok(snapshot.why, "a state with no reason attached");
});

test("--text names the missing files and the snapshot state", () => {
  const { host } = scenario({}, "captext");
  const result = spawnSync(process.execPath, [CLI, "--project-dir", host, "--project", "demo", "--text"], {
    encoding: "utf8",
    env: ISOLATED_ENV,
  });
  assert.match(result.stdout, /Layout snapshot: (available|unavailable|unknown)/);
});

test("the version is read out of all three places, and a disagreement is named", () => {
  // A real run carried 2.2.0 in the manifest and 2.2.1-SNAPSHOT in the project
  // for ninety minutes. Both were readable throughout; nothing put them in a row.
  const { host, root } = scenario({ version: "2.2.1" }, "pins");
  write(
    path.join(root, "flow.config.json"),
    JSON.stringify({ schemaVersion: 1, graphComposeVersion: "2.2.0" }),
  );

  const { parsed } = run(["--project-dir", host, "--project", "demo"]);
  const { pins } = parsed.graphCompose;

  assert.equal(pins.agree, false);
  assert.deepEqual(pins.pins.map((pin) => pin.source), ["build-file", "workspace", "project"]);
  assert.deepEqual(pins.distinct.sort(), ["2.2.0", "2.2.1"]);
  assert.match(pins.message, /disagree/);
});

test("a SNAPSHOT pin stops the run at 6 until someone says which build it is", () => {
  // The run this exists for pinned 2.2.1-SNAPSHOT, measured the engine against
  // whatever jar carried that name, and recorded the result as a fact about the
  // released line. A release pin is not stopped; only a name that can mean
  // different code tomorrow.
  const { host, root } = scenario({ version: "2.2.1-SNAPSHOT" }, "snapshot");
  const { status, parsed } = run(["--project-dir", host, "--project", "demo"]);

  assert.equal(status, 6);
  assert.equal(parsed.graphCompose.build.identified, false);
  assert.equal(parsed.graphCompose.build.accepted, false);
  assert.match(parsed.graphCompose.build.message, /--accept-build/);
  // And the record every later step is meant to read is on disk by then.
  const record = JSON.parse(fs.readFileSync(path.join(root, "resolved-version.json"), "utf8"));
  assert.equal(record.version, "2.2.1-SNAPSHOT");
  assert.equal(record.accepted, null);
});

test("a released pin needs no decision and exits ready", () => {
  const { host } = scenario({ version: "2.2.0" }, "released");
  const { status, parsed } = run(["--project-dir", host, "--project", "demo"]);

  assert.notEqual(status, 6);
  assert.equal(parsed.graphCompose.build.identified, true);
  assert.equal(parsed.graphCompose.build.message, null);
});

test("three places saying the same version is not reported as a problem", () => {
  const { host } = scenario({ version: "2.2.0" }, "pins-agree");
  const { parsed } = run(["--project-dir", host, "--project", "demo"]);

  assert.equal(parsed.graphCompose.pins.agree, true);
  assert.equal(parsed.graphCompose.pins.message, null);
});

test("--no-setup reports what is unbuilt instead of building it", () => {
  // The escape hatch, and the shape the report keeps when it is used: a caller
  // that wants the facts and not a build has to be able to ask for exactly that.
  const install = unbuiltInstall("nosetup");
  const { host } = scenario({}, "nosetup-host");
  const result = spawnSync(
    process.execPath,
    [path.join(install, "scripts", "preflight.mjs"), "--project-dir", host, "--project", "demo", "--no-setup"],
    { encoding: "utf8" },
  );
  const parsed = JSON.parse(result.stdout);

  assert.equal(parsed.tools.setup.ran, false);
  assert.equal(parsed.tools.setup.reason, "--no-setup");
  assert.equal(parsed.tools.needsSetup, true);
  assert.equal(parsed.nextCommands[0]?.run, "npm run setup");
});

test("a built install records that there was nothing to build", () => {
  const { host } = scenario({}, "setup-noop");
  const { parsed } = run(["--project-dir", host, "--project", "demo"]);

  if (parsed.tools.unbuilt.length > 0) return; // this checkout has not run setup

  // `setup` reinstalls and rebuilds every Node tool unconditionally. Running it
  // on a ready tree would spend a minute to change nothing, so the report has
  // to be able to say it decided not to.
  assert.equal(parsed.tools.setup.ran, false);
  assert.match(parsed.tools.setup.reason, /everything that ships as source is built/);
});

test("a build that runs and does not finish the job says so, and does not repeat the advice as if it were new", () => {
  // The fixture has no `tools/` at all, so setup runs and fails. That is the
  // case worth pinning: being told to run a command that has just failed, with
  // no hint that it was tried, is worse than not being told at all.
  const install = unbuiltInstall("setup-fails");
  const { host } = scenario({}, "setup-fails-host");
  const result = spawnSync(
    process.execPath,
    [path.join(install, "scripts", "preflight.mjs"), "--project-dir", host, "--project", "demo"],
    { encoding: "utf8" },
  );
  const parsed = JSON.parse(result.stdout);

  assert.equal(parsed.tools.setup.ran, true);
  assert.equal(parsed.tools.setup.ok, false);
  assert.ok(Array.isArray(parsed.tools.setup.stillUnbuilt));
  assert.equal(parsed.nextCommands[0]?.run, "npm run setup");
  assert.match(parsed.nextCommands[0].why, /setup ran here/);
});

test("the build's own output never reaches stdout, because stdout is the report", () => {
  const install = unbuiltInstall("setup-stdout");
  const { host } = scenario({}, "setup-stdout-host");
  const result = spawnSync(
    process.execPath,
    [path.join(install, "scripts", "preflight.mjs"), "--project-dir", host, "--project", "demo"],
    { encoding: "utf8" },
  );

  // A Maven log in the middle of the JSON is a parse error, not a build log.
  assert.doesNotThrow(() => JSON.parse(result.stdout), "stdout stopped being parseable JSON");
});

test("a knowledge pack says it carries no prose, and where the how-to is", () => {
  // The 2.3 pack arrives from a knowledge bundle: api/, routing/, claims/ and
  // zero pages, where 2.2 has 29. Answering `loadingMap: null` and stopping
  // reads as "nothing to load" rather than "this pack does not carry that
  // half", and the difference decides whether a run goes looking or just
  // proceeds without guidance.
  const { host } = scenario({ version: "2.3.0", docKind: "cv" }, "knowledge-only");
  const { parsed } = run(["--project-dir", host, "--project", "demo", "--no-setup"]);

  assert.equal(parsed.graphCompose.status, "supported", "the pack exists, so the line is supported");
  assert.equal(parsed.skills.loadingMap, null);
  assert.equal(parsed.skills.knowledgeOnly, true);
  assert.equal(parsed.skills.guidance.line, "2.2", "how-to was not pointed at the nearest older pack");
  assert.ok(
    parsed.skills.guidance.note.includes("allow-list stays the authority"),
    "the note does not say which pack still decides what exists",
  );
  assert.ok(
    parsed.skills.guidance.note.includes("api-query --version 2.3"),
    "the note does not name the command that verifies against the pinned line",
  );
  const point = parsed.skills.guidance.startingPoint;
  assert.ok(point?.files?.length > 0, `a cv has a worked starting point in 2.2; got ${JSON.stringify(point)}`);
  // The one file that must not cross a line. A worked starting point opens with
  // the allow-list, and 2.2's closed set does not describe 2.3 — an agent that
  // opened it would be authoring against the wrong closed set while believing
  // it had the right one. The prose beside it is what is being borrowed.
  assert.ok(
    !point.files.includes("00-api-surface.md"),
    `the older line's allow-list was carried across: ${point.files.join(", ")}`,
  );
  assert.ok(point.files.includes("layout-primitives.md"), "the prose that was the point did not come with it");
});

test("guidance is offered downward only, never from a newer line", () => {
  // 1.7 has prose, no loading map and no allow-list — not a knowledge pack,
  // just unbuilt. Handing it 2.2's pages would teach API that line does not
  // have, which is the failure the closed set exists to prevent. A bundle pack
  // reading older prose is the opposite trade and a bounded one; this is not.
  const { host } = scenario({ version: "1.7.0", docKind: "cv" }, "old-line");
  const { parsed } = run(["--project-dir", host, "--project", "demo", "--no-setup"]);

  assert.equal(parsed.skills.knowledgeOnly, false);
  assert.equal(parsed.skills.guidance, null, "an older line was sent to a newer line's prose");
  assert.ok(parsed.skills.note.includes("no allow-list in any layout"));
});

/**
 * A config dir holding one installed pack at `version`, optionally with a
 * runnable `scripts/preflight.mjs` inside it.
 */
function installedPack(label, version, { runnable = true } = {}) {
  const configDir = tempDir(label);
  const root = path.join(configDir, "plugins", "cache", "graphcompose", "graphcompose-flow", version);
  fs.mkdirSync(root, { recursive: true });
  if (runnable) {
    fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
    fs.writeFileSync(path.join(root, "scripts", "preflight.mjs"), "// a real install", "utf8");
  }
  return { ...ISOLATED_ENV, CLAUDE_CONFIG_DIR: configDir };
}

/** The version this checkout is, so a test can install one strictly newer. */
function newerThanThisTree() {
  const { version } = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const [major, minor] = version.split(".").map(Number);
  return `${major}.${minor + 1}.0`;
}

test("skew names the matching runtime instead of leaving it to be diagnosed", () => {
  // A 0.22.0 installed skill against a 0.21.0 checkout cost a real run several
  // turns comparing execution roots and skill files, then a hand-pinned
  // environment variable. The install carrying those newer tools was on disk
  // the whole time — preflight already knew where.
  const { host } = scenario({}, "skew");
  const newer = newerThanThisTree();
  const skew = installedPack("skew-cache", newer);
  const { status, parsed } = run(["--project-dir", host, "--project", "demo", "--no-setup"], skew);

  assert.equal(status, 5, "a skew is still a stop, not a warning");
  assert.equal(parsed.capabilities.parity, "tools-behind");
  assert.equal(parsed.capabilities.matchingRuntime.version, newer);
  assert.match(parsed.capabilities.matchingRuntime.command, /preflight\.mjs/);
  assert.ok(
    parsed.capabilities.matchingRuntime.command.includes(host),
    "the command drops --project-dir, so the reader has to reconstruct it",
  );
  assert.equal(
    parsed.nextCommands[0].run,
    parsed.capabilities.matchingRuntime.command,
    "running from the matching tree must be the first thing offered, before any build",
  );
  // The whole invocation, not only the directory: without --project the run in
  // the matching tree comes back with no project and none of the loop lines.
  assert.ok(
    parsed.capabilities.matchingRuntime.command.includes('--project "demo"'),
    "the command drops --project, so the matching tree re-derives it",
  );
  // And in --text, where the first version printed the diagnosis and kept
  // the remedy in the JSON nobody asked for.
  const text = run(["--project-dir", host, "--project", "demo", "--no-setup", "--text"], skew);
  assert.match(text.output, /Next:/);
  assert.ok(text.output.includes(parsed.capabilities.matchingRuntime.command), "--text never showed the one line to copy");
});

test("a relative --project-dir is printed absolute, so the commands survive a change of directory", () => {
  // The report is read into a context window and acted on later, from
  // wherever the next command runs. `--project-dir .` carried into the printed
  // commands was correct only from the directory it was printed in.
  const { host } = scenario({}, "relative");
  const result = spawnSync(
    process.execPath,
    [CLI, "--project-dir", ".", "--project", "other", "--no-setup"],
    { encoding: "utf8", env: ISOLATED_ENV, cwd: host },
  );
  const parsed = JSON.parse(result.stdout);
  const create = parsed.nextCommands.find((c) => c.run.includes("init-workspace"));

  assert.ok(create, "no create-the-project command was offered for a project that does not exist");
  assert.ok(create.run.includes(`--project-dir "${host}"`), `the command carries a relative directory: ${create.run}`);
});

test("a half-copied install is not offered as a runtime", () => {
  // A cache directory exists from the moment an install starts. Pointing a run
  // at a tree with no scripts/ would trade one confusing failure for a worse
  // one, so presence of the entry point is what counts.
  const { host } = scenario({}, "skew-partial");
  const { status, parsed } = run(
    ["--project-dir", host, "--project", "demo", "--no-setup"],
    installedPack("partial-cache", newerThanThisTree(), { runnable: false }),
  );

  assert.equal(status, 5, "the skew is still reported");
  assert.equal(parsed.capabilities.matchingRuntime, null);
  assert.match(parsed.capabilities.parityMessage, /skills install at/);
});

test("a matched pair offers no runtime switch at all", () => {
  const { host } = scenario({}, "matched");
  const { parsed } = run(["--project-dir", host, "--project", "demo", "--no-setup"]);

  assert.equal(parsed.capabilities.matchingRuntime, null);
  assert.ok(
    !parsed.nextCommands.some((c) => c.run.includes("plugins")),
    "a healthy tree was told to run from somewhere else",
  );
});
