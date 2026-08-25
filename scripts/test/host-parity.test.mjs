#!/usr/bin/env node
/**
 * scripts/test/host-parity.test.mjs — one workflow, two packagings.
 *
 * Claude Code installs the harness as a plugin, which is the whole repository;
 * Codex installs a copy of a named subset. Packaging may differ. Semantics may
 * not: the same skill text runs in both, so a command the skills tell an agent
 * to run has to exist in both, and a path they name has to mean the same thing
 * in both.
 *
 * The failure this catches is quiet. A new script lands, a skill starts calling
 * it, and everything works in the repository — while the Codex install, which
 * ships a list, does not have the file. The first sign is an agent in the other
 * host reporting a command that does not exist, halfway through a run.
 *
 * The Codex runtime manifest is read out of the installer's source rather than
 * imported, because the installer is a CLI that acts when it loads. A contract
 * test may read a declaration; it should not have to run an installer.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKILLS = path.join(repoRoot, "skills", "workflows");
const INSTALLER = path.join(repoRoot, "adapters", "codex", "install.mjs");

/** The `from:` paths the Codex installer copies. */
function codexRuntimePaths() {
  const source = fs.readFileSync(INSTALLER, "utf8");
  const block = source.slice(source.indexOf("const RUNTIME = ["), source.indexOf("];", source.indexOf("const RUNTIME = [")));
  const paths = [...block.matchAll(/from:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(paths.length > 5, "could not read the Codex runtime manifest out of the installer");
  return paths;
}

function markdownFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...markdownFiles(full));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

/** Every `node <path>` a workflow skill tells an agent to run. */
function commandsNamedInSkills() {
  const commands = new Map();
  for (const file of markdownFiles(SKILLS)) {
    const text = fs.readFileSync(file, "utf8");
    for (const [, invoked] of text.matchAll(/\bnode\s+((?:scripts|tools)\/[\w./-]+\.mjs)\b/g)) {
      if (!commands.has(invoked)) commands.set(invoked, []);
      commands.get(invoked).push(path.relative(repoRoot, file));
    }
  }
  return commands;
}

const runtime = codexRuntimePaths();
const commands = commandsNamedInSkills();

const shippedToCodex = (relPath) =>
  runtime.some((entry) => relPath === entry || relPath.startsWith(`${entry}/`));

test("the skills name commands at all", () => {
  assert.ok(commands.size >= 8, `only ${commands.size} commands found — the scan is probably broken`);
});

test("every command a skill names exists in this repository", () => {
  for (const [command, sources] of commands) {
    assert.ok(
      fs.existsSync(path.join(repoRoot, command)),
      `${command} is named in ${sources.join(", ")} but does not exist`,
    );
  }
});

test("every command a skill names is shipped to Codex", () => {
  const missing = [...commands.keys()].filter((command) => !shippedToCodex(command));
  assert.deepEqual(
    missing,
    [],
    `the skills tell an agent to run these, and the Codex install does not carry them: ${missing.join(", ")}`,
  );
});

test("every reference file a skill links to is shipped to Codex", () => {
  // A skill that reaches a reference through a relative link is only complete
  // where that reference was copied.
  const missing = [];
  for (const file of markdownFiles(SKILLS)) {
    const text = fs.readFileSync(file, "utf8");
    for (const [, link] of text.matchAll(/\]\((\.\.?\/[^)#]+\.md)/g)) {
      const target = path.resolve(path.dirname(file), link);
      const relative = path.relative(repoRoot, target).split(path.sep).join("/");
      if (!fs.existsSync(target)) {
        missing.push(`${relative} (broken link from ${path.relative(repoRoot, file)})`);
      } else if (!shippedToCodex(relative)) {
        missing.push(`${relative} (not in the Codex runtime)`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test("the canonical workspace layout is stated once and both hosts get it", () => {
  const layout = path.join(SKILLS, "references", "workspace-layout.md");
  assert.ok(fs.existsSync(layout), "there is no single statement of the workspace layout");
  assert.ok(shippedToCodex("skills/workflows/references/workspace-layout.md"));

  const text = fs.readFileSync(layout, "utf8");
  // The three things that were actually got wrong in practice.
  assert.match(text, /install is not the workspace/i);
  assert.match(text, /Do not copy the harness into the output/i);
  assert.match(text, /import-reference/);
});

test("the layout's own commands exist and ship", () => {
  const text = fs.readFileSync(path.join(SKILLS, "references", "workspace-layout.md"), "utf8");
  const named = [...text.matchAll(/\bnode\s+((?:scripts|tools)\/[\w./-]+\.mjs)\b/g)].map((m) => m[1]);
  assert.ok(named.length >= 3, "the layout page names no commands, so nothing enforces it");
  for (const command of named) {
    assert.ok(fs.existsSync(path.join(repoRoot, command)), `${command} does not exist`);
    assert.ok(shippedToCodex(command), `${command} is not shipped to Codex`);
  }
});

test("no workflow skill branches on which host is running", () => {
  // Host-specific packaging is fine. Host-specific behaviour is the thing that
  // makes one acceptance run stop predicting the other.
  for (const file of markdownFiles(SKILLS)) {
    const text = fs.readFileSync(file, "utf8");
    for (const forbidden of [/\bif you are (?:running in |in )?Codex\b/i, /\bClaude Code only\b/i, /\bCodex only\b/i]) {
      // Match first, then assert: an eagerly built message dereferenced a null
      // match on every file that passed.
      const hit = text.match(forbidden);
      assert.ok(
        hit === null,
        hit ? `${path.relative(repoRoot, file)} branches on the host: ${hit[0]}` : "",
      );
    }
  }
});

test("the four workflow skills are the same set on both sides", () => {
  const workflows = fs
    .readdirSync(SKILLS, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "references")
    .map((e) => e.name)
    .sort();
  assert.deepEqual(workflows, ["approve-template", "create-template", "review-template", "revise-template"]);

  for (const workflow of workflows) {
    assert.ok(
      shippedToCodex(`skills/workflows/${workflow}/SKILL.md`),
      `${workflow} has no route into the Codex install`,
    );
  }
});
