#!/usr/bin/env node
/**
 * scripts/test/codex-adapter.test.mjs — the Codex adapter installs the same
 * skills, not a fork of them.
 *
 * The whole risk of having two packagings is that they drift. These tests
 * install into a temp directory and assert that what Codex would see matches
 * what the source says — in particular the description, which is the trigger
 * surface: a paraphrase there means the skill fires on different words in the
 * two hosts.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const installer = path.join(repoRoot, "adapters", "codex", "install.mjs");
const workflowsDir = path.join(repoRoot, "skills", "workflows");

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gccodex-${label}-`));
  process.on("exit", () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
  return dir;
}

const run = (args) =>
  execFileSync(process.execPath, [installer, ...args], { encoding: "utf8", stdio: "pipe" });

function frontmatter(file) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(fs.readFileSync(file, "utf8"));
  return match ? match[1] : null;
}

const field = (block, name) => {
  const hit = new RegExp(`^${name}:\\s*(.+)$`, "m").exec(block);
  return hit ? hit[1].trim() : null;
};

const sourceSkills = fs
  .readdirSync(workflowsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(path.join(workflowsDir, e.name, "SKILL.md")))
  .map((e) => e.name);

test("the installer writes one flat directory per workflow skill", () => {
  const dest = tempDir("install");
  run(["--dest", dest]);

  const installed = fs.readdirSync(dest).sort();
  assert.deepEqual(
    installed,
    sourceSkills.map((name) => `graphcompose-${name}`).sort(),
    "installed skills do not match the workflow skills in the repository",
  );
  for (const dir of installed) {
    assert.ok(fs.existsSync(path.join(dest, dir, "SKILL.md")), `${dir} has no SKILL.md`);
  }
});

test("each stub's description is the source description, verbatim", () => {
  const dest = tempDir("verbatim");
  run(["--dest", dest]);

  for (const name of sourceSkills) {
    const source = field(frontmatter(path.join(workflowsDir, name, "SKILL.md")), "description");
    const stub = field(frontmatter(path.join(dest, `graphcompose-${name}`, "SKILL.md")), "description");
    assert.equal(
      stub,
      source,
      `${name}: the Codex description differs from the source, so the skill would trigger on different words`,
    );
  }
});

test("each stub names its directory and points into the installed runtime", () => {
  const home = tempDir("home");
  const dest = tempDir("points");
  run(["--home", home, "--dest", dest, "--skip-deps"]);

  const version = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")).version;
  const runtimeRoot = path.join(home, version);

  for (const name of sourceSkills) {
    const installedName = `graphcompose-${name}`;
    const file = path.join(dest, installedName, "SKILL.md");
    const body = fs.readFileSync(file, "utf8");

    assert.equal(
      field(frontmatter(file), "name"),
      installedName,
      `${installedName}: frontmatter name must match the directory, as every other ~/.codex skill does`,
    );

    // The whole point of the copy: the stub must point into the install, not
    // at a checkout that can move, be renamed, or be deleted after install.
    const installed = path.join(runtimeRoot, "skills", "workflows", name, "SKILL.md");
    assert.ok(body.includes(installed), `${installedName} does not point at ${installed}`);
    assert.ok(
      !body.includes(path.join(repoRoot, "skills", "workflows", name)),
      `${installedName} points back at the source checkout`,
    );
    assert.ok(fs.existsSync(installed), `the installed runtime is missing ${installed}`);
  }
});

test("the installed runtime carries what the skills reach for, and nothing else", () => {
  const home = tempDir("runtime");
  run(["--home", home, "--dest", tempDir("runtime-skills"), "--skip-deps"]);
  const version = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")).version;
  const root = path.join(home, version);

  for (const needed of [
    "config/pipeline.json",
    "schemas/visual-review.schema.json",
    "scripts/resolve-version.mjs",
    "scripts/run-pipeline.mjs",
    "scripts/lib/workspace.mjs",
    "skills/skill-manifest.json",
    "skills/versions/graphcompose-2.2/00-api-surface.md",
    "tools/revision-manager/bin/graphcompose-flow.mjs",
    "tools/revision-manager/dist/cli.js",
    "tools/visual-diff/dist/cli.js",
    "tools/preview-renderer/target/preview-renderer.jar",
  ]) {
    assert.ok(fs.existsSync(path.join(root, needed)), `the install is missing ${needed}`);
  }

  // Not runtime: shipping these would make the "self-contained" copy a mirror
  // of the repository, including the chain this harness replaced.
  for (const absent of ["examples", "templates", "prompts", "site", "docs", ".git"]) {
    assert.ok(!fs.existsSync(path.join(root, absent)), `the install carries ${absent}, which is not runtime`);
  }
});

test("--link keeps the contributor workflow pointing at the checkout", () => {
  const dest = tempDir("linked");
  const out = run(["--dest", dest, "--link"]);
  assert.match(out, /linked checkout/i);

  const body = fs.readFileSync(path.join(dest, `graphcompose-${sourceSkills[0]}`, "SKILL.md"), "utf8");
  assert.ok(
    body.includes(path.join(repoRoot, "skills", "workflows", sourceSkills[0], "SKILL.md")),
    "--link did not point at this checkout",
  );
  assert.match(body, /tracks your working tree/, "--link does not warn that it is checkout-bound");
});

test("the stubs carry no copy of the instructions", () => {
  const dest = tempDir("nocopy");
  run(["--dest", dest]);

  for (const name of sourceSkills) {
    const stub = fs.readFileSync(path.join(dest, `graphcompose-${name}`, "SKILL.md"), "utf8");
    const source = fs.readFileSync(path.join(workflowsDir, name, "SKILL.md"), "utf8");
    // A stub that grew into a copy is the drift this design avoids.
    assert.ok(
      stub.length < source.length / 2,
      `${name}: the stub is no longer a stub (${stub.length} vs ${source.length} chars)`,
    );
    assert.ok(!stub.includes("## Steps"), `${name}: the stub copied the steps`);
  }
});

test("--dry-run writes nothing, --uninstall removes what was written", () => {
  const dest = tempDir("lifecycle");

  const dry = run(["--dest", dest, "--dry-run"]);
  assert.match(dry, /would write/);
  assert.ok(!fs.existsSync(path.join(dest, `graphcompose-${sourceSkills[0]}`)), "dry run wrote files");

  run(["--dest", dest]);
  assert.ok(fs.existsSync(path.join(dest, `graphcompose-${sourceSkills[0]}`)));

  run(["--dest", dest, "--uninstall"]);
  for (const name of sourceSkills) {
    assert.ok(
      !fs.existsSync(path.join(dest, `graphcompose-${name}`)),
      `${name} survived --uninstall`,
    );
  }
});

test("the skills document no shell-specific syntax, so Codex on Windows can run them", () => {
  // Codex's global AGENTS.md asks for PowerShell-compatible commands and warns
  // off bash-only constructs. Line continuations are the easy mistake: a
  // trailing backslash is a continuation in bash and a literal in PowerShell.
  const files = [
    ...sourceSkills.map((name) => path.join(workflowsDir, name, "SKILL.md")),
    ...fs
      .readdirSync(path.join(workflowsDir, "references"))
      .map((name) => path.join(workflowsDir, "references", name)),
  ];

  for (const file of files) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    let inFence = false;
    lines.forEach((line, index) => {
      if (/^```/.test(line)) inFence = !inFence;
      if (!inFence) return;
      assert.ok(
        !/\\$/.test(line),
        `${path.relative(repoRoot, file)}:${index + 1} ends a command with a backslash continuation, ` +
          "which PowerShell reads as a literal",
      );
      for (const construct of [/\bexport\s+\w+=/, /\brm\s+-rf\b/, /<<'?EOF/, /\$\(/]) {
        assert.ok(
          !construct.test(line),
          `${path.relative(repoRoot, file)}:${index + 1} uses a bash-only construct: ${line.trim()}`,
        );
      }
    });
  }
});
