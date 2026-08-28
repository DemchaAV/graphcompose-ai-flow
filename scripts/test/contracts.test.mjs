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

/** Directories no documentation or source check should descend into. */
const IMAGE = /!\[[^\]]*\]\(([^)]+)\)/g;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "target", "coverage", "private"]);
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
    // Not a scope: the user named a template that already exists and wants new
    // content in it, so no revision is opened and there is nothing to approve.
    if (entry.scope === "reuse") {
      assert.equal(
        entry.expectsNoRevision,
        true,
        `${entry.gesture}: a reuse opens no revision, and the fixture must say so`,
      );
      continue;
    }
    assert.ok(
      Object.hasOwn(config.scopes, entry.scope),
      `${entry.gesture}: scope "${entry.scope}" is not in config/pipeline.json`,
    );
  }
});

test("reuse and revise are both exercised, because naming a template does not decide it", () => {
  const fixtures = readJson("tests/routing-fixtures.json");
  const reuse = fixtures.cases.filter((c) => c.scope === "reuse");
  assert.ok(reuse.length >= 2, "too few reuse fixtures to pin the cheaper route");

  // The case that makes the rule non-obvious: a gesture that names a published
  // template and asks for a layout change is a revision, not a reuse.
  const namesTemplateAndRevises = fixtures.cases.filter(
    (c) => c.expectsNoRevision === false && /northline|mint-editorial/.test(c.gesture),
  );
  assert.ok(
    namesTemplateAndRevises.length >= 1,
    "no fixture covers naming a template while asking for a layout change",
  );
});

test("the reuse rule is where an agent will actually meet it", () => {
  // A rule only in a reference nobody opens is a rule that does not exist. It
  // has to be in the dispatch file, in the routing reference it points at, and
  // in the skill that would otherwise start reconstructing.
  const anchor = "#template-reuse-first--before-any-scope";
  const routing = read("skills/workflows/references/scope-routing.md");
  assert.match(routing, /## Template Reuse First/, "scope-routing.md does not state the rule");
  assert.match(routing, /use-template opens no revision|opens no revision/i);

  for (const file of ["AGENTS.md", "skills/workflows/revise-template/SKILL.md"]) {
    assert.ok(read(file).includes(anchor), `${file} does not link to the reuse rule`);
  }

  const create = read("skills/workflows/create-template/SKILL.md");
  assert.match(
    create,
    /node scripts\/templates\.mjs --json/,
    "create-template does not check the catalog before reconstructing",
  );
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
    "adapters/gemini/README.md",
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

test("the eleven-prompt chain is gone, and nothing live still sends a reader to it", () => {
  assert.ok(!fs.existsSync(path.join(repoRoot, "prompts")), "prompts/ is back");

  // docs/agents.md described the same chain in doc form and linked into it
  // twenty times over; a page of dead links kept "for the record" is the
  // documentation-that-lies failure this migration exists to remove.
  assert.ok(
    !fs.existsSync(path.join(repoRoot, "docs", "agents.md")),
    "docs/agents.md is back, describing an architecture the project no longer has",
  );

  // Live guidance must not link into the removed directory.
  for (const file of [
    "README.md",
    "AGENTS.md",
    "docs/quickstart.md",
    "docs/workflow.md",
    "docs/architecture.md",
    "config/pipeline.json",
    "skills/workflows/README.md",
  ]) {
    assert.ok(
      !/\bprompts\/[a-z]/.test(read(file)),
      `${file} still points at a file under prompts/, which no longer exists`,
    );
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
  // A README that shows finished templates and omits the half still unproven is
  // the kind of claim this project's own gates exist to prevent. What is
  // outstanding changes, so this tracks the substance rather than a sentence:
  // Codex firing the skill from a plain sentence has now been observed, and
  // what has NOT been recorded there is a run carried through to an approved
  // published bundle. The previous version of this assertion pinned the exact
  // words "Codex acceptance is still outstanding" while its own comment claimed
  // to track the fact — so when the fact changed, the test defended the stale
  // sentence.
  const readme = read("README.md");
  // The bullet about Codex, from its start to the next bullet. Split on lines
  // rather than matched with one multiline regex: the section is prose someone
  // will reword, and a brittle pattern here is the same mistake again.
  const lines = readme.split(/\r?\n/);
  const start = lines.findIndex((line) => /^- \*\*Codex/i.test(line));
  const end = lines.findIndex((line, i) => i > start && /^- \*\*/.test(line));
  const codexSection = start === -1 ? "" : lines.slice(start, end === -1 ? undefined : end).join("\n");
  assert.ok(codexSection, "the README says nothing about Codex at all");
  assert.match(
    codexSection,
    /\bnot\b[\s\S]{0,80}\brecorded\b/i,
    "the README no longer says what about Codex is still unrecorded",
  );
  assert.match(
    codexSection,
    /approved published bundle/i,
    "the README does not name the thing still missing on Codex: a run carried to a published bundle",
  );
  assert.match(readme, /needs-validation/, "the README hides the fixture/validation gap");
});

test("every image the documentation shows is an image that is there", () => {
  // The examples are the first thing anyone judges, and a broken image reads
  // as a broken project. This used to cover only the README; the paths are
  // relative and the same mistake is available in every other page, so it
  // covers all of them and resolves each path against the document that
  // prints it rather than against the repository root.
  const docs = [];
  const collect = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) collect(full);
      else if (entry.name.endsWith(".md")) docs.push(full);
    }
  };
  collect(repoRoot);

  const missing = [];
  let shown = 0;
  for (const doc of docs) {
    for (const [, target] of fs.readFileSync(doc, "utf8").matchAll(IMAGE)) {
      // `![alt](path "title")` — the title is not part of the path.
      const link = target.split(/\s+/)[0];
      if (/^(https?:|data:|#)/.test(link)) continue;
      shown += 1;
      const resolved = link.startsWith("/")
        ? path.join(repoRoot, link.slice(1))
        : path.join(path.dirname(doc), link);
      if (!fs.existsSync(resolved)) missing.push(`${path.relative(repoRoot, doc)} -> ${link}`);
    }
  }

  assert.ok(shown > 0, "no document shows a local image at all");
  assert.deepEqual(missing, [], `documentation points at images that are not there:\n  ${missing.join("\n  ")}`);
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

test("the site and the README report the same runs", () => {
  // Two places holding the same numbers is how they drift. The site's run data
  // is hand-written because the runs happened in a user's own Java project —
  // which is where the harness is meant to work, so there is no artifact here
  // to derive them from — and this is what keeps the two honest.
  const runs = JSON.parse(read("site/src/data/runs.json")).runs;
  const readme = read("README.md");

  assert.ok(runs.length >= 2, "the site shows fewer runs than the README describes");

  // The README spells small counts out — "Five revisions on its own" reads
  // better than "5 revisions" — so this accepts either rather than dictating
  // the prose.
  const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  const numeral = (n) => (WORDS[n] ? `(?:${n}|${WORDS[n]})` : String(n));

  for (const run of runs) {
    assert.match(
      readme,
      new RegExp(`${numeral(run.autonomousRevisions)}\\s+revisions?`, "i"),
      `${run.id}: the README does not mention ${run.autonomousRevisions} unattended revisions`,
    );
    assert.match(
      readme,
      new RegExp(`After ${run.corrections} correction`, "i"),
      `${run.id}: the README does not show the ${run.corrections}-correction column`,
    );
    for (const image of Object.values(run.images)) {
      // The site serves these from public/previews; the files themselves are
      // the ones the README uses, synced by site/scripts/sync-assets.mjs.
      const source = path.join(repoRoot, "assets", "readme", "v0.5", path.basename(image));
      assert.ok(fs.existsSync(source), `${run.id}: missing shared image ${path.basename(image)}`);
    }
  }

  const cycles = runs.flatMap((r) => r.cycles ?? []);
  for (const cycle of cycles) {
    assert.match(
      readme,
      new RegExp(`${cycle.minutes} min`),
      `the README does not carry the "${cycle.label}" timing`,
    );
  }
});

test("the site and the README report the same revision flows", () => {
  // Same rule as the runs above, for the recordings the landing page plays.
  // These are hand-written for the same reason — the runs happened in a user's
  // own Java project — so the README is what keeps them honest.
  const flows = JSON.parse(read("site/src/data/runs.json")).flows.items;
  const readme = read("README.md");

  assert.ok(flows.length >= 2, "the site plays fewer flows than the README describes");

  for (const flow of flows) {
    assert.match(
      readme,
      new RegExp(`${flow.revisions}\\s+revisions?`, "i"),
      `${flow.id}: the README does not mention ${flow.revisions} revisions`,
    );
    assert.match(
      readme,
      new RegExp(`\`${flow.approvedAt}\``),
      `${flow.id}: the README does not say it was approved at ${flow.approvedAt}`,
    );
    if (flow.minutes !== undefined) {
      assert.match(
        readme,
        new RegExp(`${flow.minutes} minutes`),
        `${flow.id}: the README does not carry the ${flow.minutes}-minute figure`,
      );
    }
    // The GIF is what the README renders; the MP4 beside it is what the page
    // plays. Both come out of one recording, so both must exist.
    const gif = path.join(repoRoot, flow.gif);
    assert.ok(fs.existsSync(gif), `${flow.id}: missing ${flow.gif}`);
    assert.match(readme, new RegExp(flow.gif.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `${flow.id}: the README does not show ${flow.gif}`);
    for (const asset of [flow.video, flow.poster]) {
      const source = path.join(repoRoot, "assets", "readme", "v0.6", path.basename(asset));
      assert.ok(fs.existsSync(source), `${flow.id}: missing shared asset ${path.basename(asset)}`);
    }
  }
});

test("every repository link the site makes still resolves", () => {
  // The landing page linked to prompts/visual-review-agent.md for three
  // releases after that file was deleted. Nothing was checking, and a dead
  // link on the public page is worse than a dead link in a doc: it is the
  // first thing a visitor clicks.
  const componentsDir = path.join(repoRoot, "site", "src", "components");
  if (!fs.existsSync(componentsDir)) return;

  const dead = [];
  for (const file of fs.readdirSync(componentsDir).filter((f) => f.endsWith(".astro"))) {
    const text = fs.readFileSync(path.join(componentsDir, file), "utf8");
    for (const [, target] of text.matchAll(/(?:tree|blob)\/main\/([^`'"\s)]+)/g)) {
      // Skip interpolated hrefs — their value is only known at build time.
      if (target.includes("${")) continue;
      if (!fs.existsSync(path.join(repoRoot, target))) dead.push(`${file} → ${target}`);
    }
  }

  assert.deepEqual(dead, [], `the site links to paths that no longer exist:\n  ${dead.join("\n  ")}`);
});

test("no source file carries a control character where an escape was meant", () => {
  // Two assertions in this repository silently tested nothing because a
  // backslash was eaten before the file was written: `/\\blive\\./` became
  // `/<0x08>live\\./` and matched no input ever. Both tests passed, and both
  // pinned nothing. The damage is invisible in a diff and invisible in a test
  // run — the only thing that makes it visible is looking for the byte.
  //
  // ESC (0x1b) is exempt: it is how the terminal output is coloured.
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(mjs|js|ts|json|md)$/.test(entry.name)) continue;
      const text = fs.readFileSync(full, "utf8");
      for (let i = 0; i < text.length; i += 1) {
        const code = text.charCodeAt(i);
        if (code < 32 && code !== 9 && code !== 10 && code !== 13 && code !== 27) {
          offenders.push(`${path.relative(repoRoot, full)}: 0x${code.toString(16)} at offset ${i}`);
          break;
        }
      }
    }
  };
  walk(repoRoot);

  assert.deepEqual(offenders, [], `an escape was mangled into a literal control character:\n  ${offenders.join("\n  ")}`);
});

test("every command the documentation prints is a command that exists", () => {
  // The README once claimed a state the harness had already left, and the user
  // caught it before any test did. Prose drifts from code silently; a flag that
  // was renamed leaves a copy-pasteable line that fails on the reader's machine
  // and looks like their mistake. Both halves are mechanical to check.
  const docs = [];
  const collect = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) collect(full);
      else if (entry.name.endsWith(".md")) docs.push(full);
    }
  };
  collect(repoRoot);

  const CALL = /node[ ]+(scripts\/[A-Za-z0-9_.-]+\.mjs)((?:[ ]+--?[A-Za-z0-9-]+(?:[ ]+[^ `|\n]+)?)*)/g;
  const problems = [];
  for (const doc of docs) {
    const text = fs.readFileSync(doc, "utf8");
    for (const [, script, tail] of text.matchAll(CALL)) {
      const file = path.join(repoRoot, script);
      const where = path.relative(repoRoot, doc);
      if (!fs.existsSync(file)) {
        problems.push(`${where}: names a script that does not exist - ${script}`);
        continue;
      }
      const source = fs.readFileSync(file, "utf8");
      for (const flag of tail.match(/--[A-Za-z0-9-]+/g) ?? []) {
        if (!source.includes(`"${flag}"`) && !source.includes(`'${flag}'`)) {
          problems.push(`${where}: \`node ${script} ${flag}\` - the script never reads ${flag}`);
        }
      }
    }
  }

  assert.deepEqual(problems, [], `documented commands that would fail:\n  ${problems.join("\n  ")}`);
});

test("the aspect tolerance is one number, wherever it is enforced", () => {
  // The page size is decided at import (scripts/lib/page-geometry.mjs) and the
  // diff warns when it was ignored anyway (tools/visual-diff/src/aspect.ts).
  // visual-diff builds and ships as its own package, so it cannot import a
  // harness script and carries its own copy of the constant — which is exactly
  // the shape of drift this file exists to catch.
  const harness = read("scripts/lib/page-geometry.mjs");
  const tool = read("tools/visual-diff/src/aspect.ts");

  const of = (text, source) => {
    const match = text.match(/ASPECT_TOLERANCE_PERCENT\s*(?::\s*number\s*)?=\s*([\d.]+)/);
    assert.ok(match, `${source} no longer declares ASPECT_TOLERANCE_PERCENT`);
    return Number(match[1]);
  };

  assert.equal(
    of(harness, "scripts/lib/page-geometry.mjs"),
    of(tool, "tools/visual-diff/src/aspect.ts"),
    "the import decides the page size and the diff polices it — at two different " +
      "tolerances they would disagree about the same page",
  );

  // And each says where the other one is, so the next person to change one is
  // told about the other rather than having to find it.
  assert.match(harness, /tools\/visual-diff\/src\/aspect\.ts/);
  assert.match(tool, /scripts\/lib\/page-geometry\.mjs/);
});

test("every schema is bound to the file it pins, or it validates nothing", () => {
  // A schema is enforced by `.github/scripts/validate-schemas.mjs`, which
  // matches artifacts to schemas by name. Adding one to schemas/ without adding
  // its binding produces a file that reads like a contract, is documented in
  // schemas/README.md as enforced in CI, and is never matched against anything.
  // resolved-version.schema.json shipped that way and nothing noticed.
  const validator = fs.readFileSync(
    path.join(repoRoot, ".github", "scripts", "validate-schemas.mjs"),
    "utf8",
  );
  const schemas = fs
    .readdirSync(path.join(repoRoot, "schemas"))
    .filter((name) => name.endsWith(".schema.json"));

  assert.ok(schemas.length > 0, "no schemas found");
  const unbound = schemas.filter((name) => !validator.includes(name));
  assert.deepEqual(
    unbound,
    [],
    `schemas with no binding in validate-schemas.mjs: ${unbound.join(", ")}`,
  );
});
