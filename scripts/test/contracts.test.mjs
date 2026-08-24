#!/usr/bin/env node
/**
 * scripts/test/contracts.test.mjs — the cross-cutting checks that keep the
 * documentation from disagreeing with the code again.
 *
 * The migration started because three files each described the scope routing
 * and had drifted apart, while docs/agents.md said "Nine agents" and AGENTS.md
 * said eleven. Nothing prevented either. These tests do: they assert the
 * routing fixtures are well formed, that a phase's claims match what is on
 * disk, and that stale figures do not come back.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadPipelineConfig } from "../lib/pipeline-config.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const config = loadPipelineConfig({ repoRoot });
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");
const readJson = (rel) => JSON.parse(read(rel));

test("every routing fixture names a scope the config declares", () => {
  const fixtures = readJson("tests/routing-fixtures.json");
  assert.ok(fixtures.cases.length >= 10, "too few routing fixtures to be worth having");

  const seen = new Set();
  for (const entry of fixtures.cases) {
    assert.ok(entry.gesture && entry.gesture.length > 5, "a fixture has no gesture");
    assert.ok(entry.why && entry.why.length > 20, `${entry.gesture}: a fixture without a reason is a guess`);
    assert.ok(!seen.has(entry.gesture), `duplicate fixture: ${entry.gesture}`);
    seen.add(entry.gesture);

    if (entry.scope === "ambiguous") {
      assert.equal(
        entry.expectsClarification,
        true,
        `${entry.gesture}: an ambiguous gesture must expect a clarifying question`,
      );
      continue;
    }
    assert.ok(
      Object.hasOwn(config.scopes, entry.scope),
      `${entry.gesture}: scope "${entry.scope}" is not in config/pipeline.json`,
    );
  }
});

test("the fixtures cover every revision scope, so none is left unspecified", () => {
  const fixtures = readJson("tests/routing-fixtures.json");
  const covered = new Set(fixtures.cases.map((c) => c.scope));
  for (const scope of Object.keys(config.scopes)) {
    // "new" is inferred for a first revision, not chosen from a gesture.
    if (scope === "new") continue;
    assert.ok(covered.has(scope), `no routing fixture exercises the "${scope}" scope`);
  }
  assert.ok(covered.has("ambiguous"), "no fixture covers the ask-one-question case");
});

test("the scope-routing reference agrees with the config about gates", () => {
  const reference = read("skills/workflows/references/scope-routing.md");
  for (const [scopeName, scope] of Object.entries(config.scopes)) {
    if (scopeName === "new") continue;
    const row = new RegExp(`\`${scopeName}\`[^\\n]*`, "g");
    const mentions = reference.match(row) ?? [];
    assert.ok(mentions.length > 0, `scope-routing.md never mentions the "${scopeName}" scope`);
    assert.ok(
      mentions.some((line) => line.includes(scope.gate)) || reference.includes(`| \`${scopeName}\` | \`${scope.gate}\``),
      `scope-routing.md does not show "${scopeName}" ending on the "${scope.gate}" gate`,
    );
  }
});

test("no live document still claims the old agent-chain figures", () => {
  // docs/agents.md said nine, AGENTS.md said eleven, and both were wrong by the
  // time anyone noticed. Anything describing the current workflow must not
  // resurrect a count; historical notes may, as long as they say so.
  const live = [
    "skills/workflows/README.md",
    "skills/workflows/create-template/SKILL.md",
    "skills/workflows/revise-template/SKILL.md",
    "skills/workflows/review-template/SKILL.md",
    "skills/workflows/approve-template/SKILL.md",
    "docs/plugin-installation.md",
    "adapters/codex/README.md",
  ];
  for (const file of live) {
    const source = read(file);
    for (const stale of [/\bnine agents\b/i, /\beleven agents\b/i, /\b11-agent chain\b/i]) {
      assert.ok(
        !stale.test(source),
        `${file} still describes the old agent chain (${stale}) — it was replaced by four workflow skills`,
      );
    }
  }
});

test("documents that point at prompts/ acknowledge that it is superseded", () => {
  // prompts/ survives until the acceptance runs are green. Anything sending a
  // reader there must say so, or it reads as current guidance. docs/agents.md
  // is the twin of the master prompt and was found still describing the chain
  // as the way the work is done.
  for (const file of ["prompts/master-prompt.md", "docs/agents.md"]) {
    const source = read(file);
    assert.match(source, /[Ss]uperseded by/, `${file} lost its superseded banner`);
    assert.match(source, /skills\/workflows/, `${file}'s banner does not name the replacement`);
  }
});

test("the contributor quickstart does not hand out the old prompt chain", () => {
  // It used to end "fill the revision artifacts by following the prompt chain
  // in prompts/", which teaches the superseded model to the one reader most
  // likely to follow it literally.
  const quickstart = read("docs/quickstart.md");
  assert.doesNotMatch(
    quickstart,
    /following the prompt chain/,
    "quickstart still instructs the reader to follow prompts/",
  );
  assert.match(quickstart, /skills\/workflows\/create-template/, "quickstart names no skill");
  assert.match(
    quickstart,
    /plugin-installation/,
    "quickstart does not tell a user who only wants to USE the harness where to go",
  );
});

test("the workspace layout is described identically wherever it appears", () => {
  // Three documents draw this tree; they must agree on the directory name, or a
  // user follows one and the tools look somewhere else.
  for (const file of [
    "docs/architecture.md",
    "docs/plugin-installation.md",
    "skills/workflows/references/workspace.md",
  ]) {
    const source = read(file);
    assert.match(source, /graphcompose-flow\//, `${file} does not name the workspace directory`);
    assert.match(source, /flow\.config\.json/, `${file} does not name the workspace manifest`);
    assert.ok(
      !/\.graphcompose\//.test(source),
      `${file} mentions .graphcompose/, which was rejected in favour of a visible directory`,
    );
  }
});

test("the tools the skills tell an agent to run all exist", () => {
  // A skill that names a script which was renamed is worse than no skill: the
  // agent follows it, the command fails, and the failure looks like the user's.
  const skillFiles = [
    ...fs
      .readdirSync(path.join(repoRoot, "skills", "workflows"), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => path.join("skills", "workflows", e.name, "SKILL.md"))
      .filter((rel) => fs.existsSync(path.join(repoRoot, rel))),
    ...fs
      .readdirSync(path.join(repoRoot, "skills", "workflows", "references"))
      .map((name) => path.join("skills", "workflows", "references", name)),
  ];

  for (const rel of skillFiles) {
    const source = read(rel);
    for (const [, script] of source.matchAll(/\bnode\s+((?:scripts|tools)\/[\w./-]+\.mjs)/g)) {
      assert.ok(
        fs.existsSync(path.join(repoRoot, script)),
        `${rel} tells the agent to run ${script}, which does not exist`,
      );
    }
  }
});

test("CI runs the harness gates, and the local aggregator runs the same ones", () => {
  // Two ways to run the gates is two chances for them to diverge. This does not
  // parse YAML — it asserts the commands appear in both places, which is the
  // part that goes stale.
  const ci = read(".github/workflows/ci.yml");
  const verify = read("scripts/verify.mjs");

  for (const command of [
    "repository-contract.mjs",
    "validate-schemas.mjs",
    "validate-skills.mjs",
  ]) {
    assert.ok(ci.includes(command), `.github/workflows/ci.yml no longer runs ${command}`);
    assert.ok(verify.includes(command), `scripts/verify.mjs no longer runs ${command}`);
  }

  assert.match(
    ci,
    /harness-contracts:/,
    "ci.yml lost the harness-contracts job, so the root contract suite would stop running in CI",
  );
  assert.match(ci, /^\s+- name: contract, workspace, loop, plugin and adapter tests\s*$/m);
  assert.match(verify, /harness contracts/, "verify.mjs lost the harness contract step");
});

test("nothing runs node --test with a glob, which needs a newer Node than CI pins", () => {
  // This shipped a red CI: `node --test "dir/**/*.test.mjs"` works on the Node
  // installed locally (25) and not on the Node CI pins (20), where glob support
  // does not exist. scripts/run-tests.mjs enumerates the files instead.
  const engines = readJson("package.json").engines.node;
  assert.match(engines, /20/, "the supported Node floor moved; revisit the runner");

  for (const file of [
    "package.json",
    ".github/scripts/package.json",
    "scripts/verify.mjs",
    ".github/workflows/ci.yml",
  ]) {
    const source = read(file);
    assert.ok(
      !/--test[^\n"']*\*/.test(source),
      `${file} passes a glob to node --test, which Node ${engines} cannot expand`,
    );
  }

  assert.match(read("package.json"), /run-tests\.mjs/, "the root test script bypasses the runner");
  assert.match(
    read(".github/scripts/package.json"),
    /run-tests\.mjs/,
    "the schema test script bypasses the runner",
  );
});

test("the test runner refuses to pass when it finds nothing", () => {
  // Silently succeeding on an empty directory would let a rename delete the
  // whole suite without anything turning red.
  const runner = read("scripts/run-tests.mjs");
  assert.match(runner, /no \$\{SUFFIX\} files under|files\.length === 0/);
  assert.match(runner, /process\.exit\(2\)/);
});

test("verify declares which steps need more than Node, so a green --quick is not oversold", () => {
  const verify = read("scripts/verify.mjs");
  assert.match(verify, /kind:\s*"slow"/, "no step is marked slow, so --quick would skip nothing");
  assert.match(
    verify,
    /a green run with skips is not the same as a green CI/,
    "verify no longer warns that skipped steps leave gaps",
  );
});

test("the package and the plugin report the same version", () => {
  // Two manifests, one release. A user reading /plugin details and a
  // contributor reading package.json must not see different numbers.
  assert.equal(
    readJson(".claude-plugin/plugin.json").version,
    readJson("package.json").version,
    ".claude-plugin/plugin.json and package.json disagree about the version",
  );
});

test("the entry documents link only to files that exist", () => {
  // README and AGENTS.md are the two front doors; a dead link there is the
  // first thing a new reader hits.
  for (const rel of ["README.md", "AGENTS.md", "docs/demo.md"]) {
    const source = read(rel);
    const base = path.dirname(path.join(repoRoot, rel));
    for (const [, target] of source.matchAll(/\]\((?!https?:)([^)#]+)\)/g)) {
      assert.ok(
        fs.existsSync(path.resolve(base, target)),
        `${rel} links to a missing path: ${target}`,
      );
    }
  }
});

test("the README does not oversell what has not been verified", () => {
  // The acceptance runs and the fixture port are outstanding; a README that
  // omits them is the kind of claim this project's own gates exist to prevent.
  const readme = read("README.md");
  assert.match(readme, /acceptance runs are outstanding/i, "the README hides the outstanding acceptance runs");
  assert.match(readme, /needs-validation/, "the README hides the fixture/validation gap");
});

test("the roadmap does not report a phase as done while its acceptance is outstanding", () => {
  const roadmap = read("docs/roadmap.md");
  const rows = roadmap.split("\n").filter((line) => /^\| \d+ —/.test(line));
  assert.ok(rows.length >= 10, "the harness migration table lost its rows");

  for (const row of rows) {
    const [, phase, , status] = row.split("|").map((cell) => cell.trim());
    if (!/acceptance/i.test(row)) continue;
    assert.ok(
      !/^done$/i.test(status),
      `roadmap phase "${phase}" is marked done although its row mentions an outstanding acceptance`,
    );
  }
});
