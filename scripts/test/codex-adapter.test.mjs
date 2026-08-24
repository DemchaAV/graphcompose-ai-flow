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

test("each stub names its directory and points at the canonical file", () => {
  const dest = tempDir("points");
  run(["--dest", dest]);

  for (const name of sourceSkills) {
    const installedName = `graphcompose-${name}`;
    const file = path.join(dest, installedName, "SKILL.md");
    const body = fs.readFileSync(file, "utf8");

    assert.equal(
      field(frontmatter(file), "name"),
      installedName,
      `${installedName}: frontmatter name must match the directory, as every other ~/.codex skill does`,
    );

    const canonical = path.join(workflowsDir, name, "SKILL.md");
    assert.ok(
      body.includes(canonical),
      `${installedName} does not point at ${canonical}`,
    );
  }
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
