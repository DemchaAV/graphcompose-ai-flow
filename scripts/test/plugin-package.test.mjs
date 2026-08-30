#!/usr/bin/env node
/**
 * scripts/test/plugin-package.test.mjs — structural validation of the Claude
 * Code plugin packaging.
 *
 * `claude plugin validate <path>` is the official checker and should be run
 * before publishing (see docs/plugin-installation.md). It needs the Claude Code
 * CLI, which CI does not have, so these tests assert the parts that can be
 * checked from the filesystem: the manifests parse and carry their required
 * fields, the declared skills directory actually contains the skills, every
 * skill and command has the frontmatter its kind requires, and the commands
 * point at skills that exist.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(repoRoot, rel), "utf8"));

/** Split a Markdown file into its YAML frontmatter block and body. */
function frontmatter(file) {
  const source = fs.readFileSync(file, "utf8");
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  return match ? { raw: match[1], body: source.slice(match[0].length) } : null;
}

const field = (block, name) => {
  const hit = new RegExp(`^${name}:\\s*(.+)$`, "m").exec(block);
  return hit ? hit[1].trim() : null;
};

/**
 * Parse the frontmatter the way a YAML loader would, for the subset a skill or
 * command file uses: one `key: value` per line, values either quoted or plain.
 *
 * The line-splitting `field()` above accepted anything. It let two skills ship
 * whose unquoted description contained `: "` — which YAML rejects as a nested
 * mapping ("mapping values are not allowed in this context") — so Claude Code
 * silently dropped `create-template` and `revise-template` from the plugin
 * while the repo's own check stayed green. This parser throws where YAML would.
 *
 * @returns {Record<string, string>}
 */
function parseFrontmatter(raw, file) {
  const out = {};
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const m = /^([A-Za-z_][\w-]*):(?:\s+(.*))?$/.exec(line);
    if (!m) throw new Error(`${file}: line ${i + 1} is not a \`key: value\` pair: ${line}`);
    const key = m[1];
    const value = (m[2] ?? "").trim();
    if (value === "") {
      // A block scalar (`|` / `>`) or a nested mapping would start here; the
      // files under test use neither, and admitting them would mean
      // implementing YAML. Refuse rather than guess.
      throw new Error(`${file}: ${key} has no inline value (block scalars are not used in this repo)`);
    }
    if (value.startsWith("'")) {
      const closed = /^'((?:[^']|'')*)'\s*$/.exec(value);
      if (!closed) throw new Error(`${file}: ${key} opens a single-quoted scalar and never closes it`);
      out[key] = closed[1].replace(/''/g, "'");
    } else if (value.startsWith('"')) {
      const closed = /^"((?:[^"\\]|\\.)*)"\s*$/.exec(value);
      if (!closed) throw new Error(`${file}: ${key} opens a double-quoted scalar and never closes it`);
      out[key] = closed[1].replace(/\\(.)/g, "$1");
    } else {
      // A plain scalar. YAML ends it at `: ` (a mapping) or ` #` (a comment),
      // and refuses indicators at the start.
      if (/:\s/.test(value) || value.endsWith(":")) {
        throw new Error(
          `${file}: ${key} is an unquoted scalar containing ': ' — YAML reads that as a nested ` +
            "mapping and the loader drops the whole file. Quote the value",
        );
      }
      if (/\s#/.test(value)) {
        throw new Error(`${file}: ${key} is an unquoted scalar containing ' #', which YAML treats as a comment`);
      }
      if (/^[-?:,[\]{}#&*!|>%@`]/.test(value)) {
        throw new Error(`${file}: ${key} starts with a YAML indicator (${value[0]}); quote the value`);
      }
      out[key] = value;
    }
  }
  return out;
}

test("plugin.json parses and carries the fields a plugin needs", () => {
  const plugin = readJson(".claude-plugin/plugin.json");
  assert.match(plugin.name, /^[a-z0-9]+(-[a-z0-9]+)*$/, "plugin name must be kebab-case");
  assert.ok(plugin.description && plugin.description.length > 40, "plugin description is too thin");
  assert.match(plugin.version, /^\d+\.\d+\.\d+/, "plugin version must be semver");
  assert.ok(plugin.author?.name, "plugin.author.name is missing");
});

test("the manifest does not re-declare the hooks file the loader already loads", () => {
  // `hooks/hooks.json` is loaded automatically. Naming it again in
  // `manifest.hooks` makes the loader refuse it as a duplicate — and the refusal
  // is for the whole file, so the plugin shows a red error on every load while
  // the hooks themselves work. It shipped in 0.11.0 and a user read the error
  // before any test did.
  //
  // `manifest.hooks` is for ADDITIONAL hook files. There are none.
  const plugin = readJson(".claude-plugin/plugin.json");
  const standard = "hooks/hooks.json";
  assert.ok(
    fs.existsSync(path.join(repoRoot, standard)),
    "the standard hooks file is gone — this contract needs rewriting, not deleting",
  );

  const declared = plugin.hooks;
  if (declared === undefined) return; // nothing declared, which is correct

  const named = (Array.isArray(declared) ? declared : [declared]).map((entry) =>
    String(entry).replace(/^\.\//, "").replace(/\\/g, "/"),
  );
  assert.ok(
    !named.includes(standard),
    `manifest.hooks names ${standard}, which the loader loads on its own — ` +
      "it is for additional hook files only",
  );
});

test("the declared skills directory is where the skills actually are", () => {
  const plugin = readJson(".claude-plugin/plugin.json");
  const declared = Array.isArray(plugin.skills) ? plugin.skills : [plugin.skills];
  assert.ok(declared.length > 0, "plugin.json declares no skills directory");

  for (const dir of declared) {
    const resolved = path.join(repoRoot, dir);
    assert.ok(fs.existsSync(resolved), `plugin.json skills path does not exist: ${dir}`);

    const found = fs
      .readdirSync(resolved, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => fs.existsSync(path.join(resolved, entry.name, "SKILL.md")));
    assert.ok(found.length > 0, `no SKILL.md found under the declared skills path ${dir}`);
  }
});

test("every skill's frontmatter name matches its directory, so invocation is predictable", () => {
  const plugin = readJson(".claude-plugin/plugin.json");
  const skillsDir = path.join(repoRoot, Array.isArray(plugin.skills) ? plugin.skills[0] : plugin.skills);

  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(skillsDir, entry.name, "SKILL.md");
    if (!fs.existsSync(file)) continue;

    const fm = frontmatter(file);
    assert.ok(fm, `${entry.name}/SKILL.md has no frontmatter`);
    assert.equal(
      field(fm.raw, "name"),
      entry.name,
      `${entry.name}/SKILL.md declares a name that differs from its directory; ` +
        "invocation uses the directory, so the two disagreeing is a trap",
    );
    const description = field(fm.raw, "description");
    assert.ok(description && description.length > 80, `${entry.name} description is too thin to trigger on`);
  }
});

test("every skill's and command's frontmatter is YAML a loader will accept", () => {
  // The regression this guards: v0.19.1 shipped create-template and
  // revise-template with an unquoted description containing `: "…"`. Claude Code
  // parsed the frontmatter as YAML, failed, and registered neither skill — the
  // two that do the work — while `field()` above read them fine.
  const plugin = readJson(".claude-plugin/plugin.json");
  const skillsDir = path.join(repoRoot, Array.isArray(plugin.skills) ? plugin.skills[0] : plugin.skills);
  const files = [];
  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(skillsDir, entry.name, "SKILL.md");
    if (fs.existsSync(file)) files.push(file);
  }
  for (const name of fs.readdirSync(path.join(repoRoot, "commands"))) {
    if (name.endsWith(".md")) files.push(path.join(repoRoot, "commands", name));
  }
  assert.ok(files.length >= 8, `expected four skills and four commands, found ${files.length} files`);

  for (const file of files) {
    const fm = frontmatter(file);
    assert.ok(fm, `${path.relative(repoRoot, file)} has no frontmatter`);
    const parsed = parseFrontmatter(fm.raw, path.relative(repoRoot, file));
    assert.ok(parsed.description, `${path.relative(repoRoot, file)} has no description`);
    if (path.basename(file) === "SKILL.md") {
      assert.equal(parsed.name, path.basename(path.dirname(file)));
    }
  }

  // And the parser itself refuses what YAML refuses, so a green run means
  // something.
  assert.throws(
    () => parseFrontmatter('name: x\ndescription: Use when asked: "do it"', "fixture"),
    /containing ': '/,
  );
  assert.doesNotThrow(() => parseFrontmatter("name: x\ndescription: 'Use when asked: \"do it\"'", "fixture"));
});

test("every command has a description and points at a skill that exists", () => {
  const commandsDir = path.join(repoRoot, "commands");
  const files = fs.readdirSync(commandsDir).filter((f) => f.endsWith(".md"));
  assert.equal(files.length, 4, "expected one command per workflow skill");

  for (const name of files) {
    const file = path.join(commandsDir, name);
    const fm = frontmatter(file);
    assert.ok(fm, `commands/${name} has no frontmatter`);

    const description = field(fm.raw, "description");
    assert.ok(description && description.length > 40, `commands/${name} description is too thin`);

    // Each command delegates to a skill; that skill must exist.
    const referenced = /skills\/workflows\/([a-z-]+)\/SKILL\.md/.exec(fm.body);
    assert.ok(referenced, `commands/${name} does not name the skill it follows`);
    assert.ok(
      fs.existsSync(path.join(repoRoot, "skills", "workflows", referenced[1], "SKILL.md")),
      `commands/${name} points at a missing skill: ${referenced[1]}`,
    );
  }
});

test("the marketplace manifest describes this repository as the plugin source", () => {
  const marketplace = readJson(".claude-plugin/marketplace.json");
  assert.match(marketplace.name, /^[a-z0-9]+(-[a-z0-9]+)*$/, "marketplace name must be kebab-case");
  assert.ok(marketplace.owner?.name, "marketplace.owner.name is missing");
  assert.ok(Array.isArray(marketplace.plugins) && marketplace.plugins.length > 0);

  const plugin = readJson(".claude-plugin/plugin.json");
  const entry = marketplace.plugins.find((p) => p.name === plugin.name);
  assert.ok(entry, `marketplace.json lists no plugin named ${plugin.name}`);
  assert.ok(typeof entry.source === "string" || entry.source?.source, "plugin entry has no source");

  if (typeof entry.source === "string" && entry.source.startsWith(".")) {
    assert.ok(
      fs.existsSync(path.join(repoRoot, entry.source, ".claude-plugin", "plugin.json")),
      `marketplace source ${entry.source} has no .claude-plugin/plugin.json`,
    );
  }
});

test("the install documentation names the setup step the tools require", () => {
  const doc = fs.readFileSync(path.join(repoRoot, "docs/plugin-installation.md"), "utf8");
  assert.match(doc, /npm run setup/, "install docs never mention the required build step");
  assert.match(doc, /plugin marketplace add/, "install docs never show how to add the marketplace");
  assert.match(doc, /plugin install/, "install docs never show how to install the plugin");
});
