#!/usr/bin/env node
/**
 * scripts/test/gemini-adapter.test.mjs — the Gemini extension is the same
 * harness, packaged the way Gemini CLI loads things.
 *
 * Two failures are worth catching here, and only one of them is obvious.
 *
 * The obvious one is drift: a command's description paraphrased on the way into
 * TOML fires on different words than the Claude command it was generated from.
 *
 * The other is Gemini-specific and silent. A tool may only read inside the
 * workspace, and activating a skill adds exactly one directory to it — the one
 * its `SKILL.md` sits in. An extension whose skill points at a runtime stored
 * somewhere else installs cleanly, lists cleanly, activates cleanly, and then
 * refuses every file the skill told the agent to open. So the tests assert the
 * property that prevents it: the runtime *is* the skill directory.
 *
 * `gemini extensions validate <path>` is the official checker and is what the
 * README tells a maintainer to run; it needs the Gemini CLI, which CI does not
 * have, so what is checked here is everything that can be checked from the
 * filesystem.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const installer = path.join(repoRoot, "adapters", "gemini", "install.mjs");
const workflowsDir = path.join(repoRoot, "skills", "workflows");
const commandsDir = path.join(repoRoot, "commands");
const EXTENSION = "graphcompose-flow";

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcgemini-${label}-`));
  process.on("exit", () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
  return dir;
}

/**
 * Run the installer, always sandboxed. Tests must never touch the real
 * ~/.gemini, and must not need the build outputs or the network.
 */
const run = (args) => {
  const flags = args.includes("--link") ? [] : ["--skip-build-check", "--skip-deps"];
  return execFileSync(process.execPath, [installer, ...args, ...flags], {
    encoding: "utf8",
    stdio: "pipe",
  });
};

function frontmatter(file) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(fs.readFileSync(file, "utf8"));
  return match ? match[1] : null;
}

const field = (block, name) => {
  const hit = new RegExp(`^${name}:\\s*(.+)$`, "m").exec(block);
  return hit ? hit[1].trim() : null;
};

/** The generated TOML, far enough parsed to assert on. */
function readCommandToml(file) {
  const source = fs.readFileSync(file, "utf8");
  const description = /^description = "((?:[^"\\]|\\.)*)"$/m.exec(source);
  const prompt = /^prompt = '''\r?\n([\s\S]*?)\r?\n'''\r?\n?$/m.exec(source);
  assert.ok(description, `${path.basename(file)} has no parseable description`);
  assert.ok(prompt, `${path.basename(file)} has no parseable prompt`);
  return { description: JSON.parse(`"${description[1]}"`), prompt: prompt[1], source };
}

const sourceSkills = fs
  .readdirSync(workflowsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(path.join(workflowsDir, e.name, "SKILL.md")))
  .map((e) => e.name)
  .sort();

const sourceCommands = fs
  .readdirSync(commandsDir)
  .filter((f) => f.endsWith(".md"))
  .map((f) => path.basename(f, ".md"))
  .sort();

const version = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")).version;

// One install, shared by the tests that only read it. The copy is ~9 MB, and
// re-running it per assertion buys nothing.
const dest = tempDir("install");
run(["--dest", dest]);
const extensionDir = path.join(dest, EXTENSION);
const skillDir = path.join(extensionDir, "skills", EXTENSION);

test("the installer writes the layout Gemini CLI loads", () => {
  for (const relative of [
    "gemini-extension.json",
    "GEMINI.md",
    "hooks/hooks.json",
    `skills/${EXTENSION}/SKILL.md`,
    ...sourceCommands.map((name) => `commands/${name}.toml`),
  ]) {
    assert.ok(fs.existsSync(path.join(extensionDir, ...relative.split("/"))), `missing ${relative}`);
  }
});

test("the manifest names the directory it is in, at this harness version", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionDir, "gemini-extension.json"), "utf8"));
  // Gemini expects the manifest name to match the directory; a mismatch shows
  // up as an extension the user cannot refer to by the name they installed.
  assert.equal(manifest.name, path.basename(extensionDir));
  assert.match(manifest.name, /^[a-z0-9]+(-[a-z0-9]+)*$/, "extension name must be kebab-case");
  assert.equal(manifest.version, version);
  assert.ok(manifest.description.length > 40, "extension description is too thin");
  assert.equal(manifest.contextFileName, "GEMINI.md");
  assert.ok(fs.existsSync(path.join(extensionDir, manifest.contextFileName)), "the declared context file is absent");
});

test("the runtime IS the skill directory, because that is all activation grants", () => {
  // The property this packaging exists for. Everything the skill tells the
  // agent to read has to be under the directory holding its SKILL.md.
  for (const needed of [
    "AGENTS.md",
    "config/pipeline.json",
    "scripts/preflight.mjs",
    "scripts/telemetry/gemini-hook.mjs",
    "skills/skill-manifest.json",
    "skills/versions/graphcompose-2.2/00-loading-map.md",
    "skills/workflows/references/workspace-layout.md",
    ...sourceSkills.map((name) => `skills/workflows/${name}/SKILL.md`),
  ]) {
    assert.ok(fs.existsSync(path.join(skillDir, ...needed.split("/"))), `the skill directory is missing ${needed}`);
  }

  // And nothing the skill names may sit outside it.
  const body = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf8");
  const posixSkillDir = skillDir.split(path.sep).join("/");
  for (const [, named] of body.matchAll(/`([A-Za-z]:\/[^`"]+|\/[^`"]+)`/g)) {
    assert.ok(
      named.startsWith(posixSkillDir),
      `the router names ${named}, which activation does not grant read access to`,
    );
  }
});

test("Gemini's own skill discovery finds exactly one skill", () => {
  // Discovery globs SKILL.md and */SKILL.md under the extension's skills/
  // directory — one level. The harness carries its own skills/ tree inside the
  // runtime, and it must stay invisible to that glob rather than registering
  // four half-configured skills.
  const skillsRoot = path.join(extensionDir, "skills");
  const discovered = fs
    .readdirSync(skillsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(skillsRoot, e.name, "SKILL.md")))
    .map((e) => e.name);
  assert.deepEqual(discovered, [EXTENSION]);
  assert.ok(!fs.existsSync(path.join(skillsRoot, "SKILL.md")), "a SKILL.md at the skills/ root would shadow the skill");
});

test("the router's frontmatter name matches its directory and names every workflow", () => {
  const fm = frontmatter(path.join(skillDir, "SKILL.md"));
  assert.ok(fm, "the router has no frontmatter");
  assert.equal(field(fm, "name"), EXTENSION, "the skill name must match its directory");

  const description = field(fm, "description");
  assert.ok(description.length > 200, "the description is the whole trigger surface; this one is too thin");
  for (const skill of sourceSkills) {
    assert.ok(
      description.includes(skill),
      `the router description does not mention ${skill}, so nothing routes to it`,
    );
  }
});

test("the router carries no copy of the workflow instructions", () => {
  const router = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf8");
  const sources = sourceSkills.reduce(
    (total, name) => total + fs.readFileSync(path.join(workflowsDir, name, "SKILL.md"), "utf8").length,
    0,
  );
  assert.ok(
    router.length < sources / 8,
    `the router is no longer a router (${router.length} vs ${sources} chars of source)`,
  );
  assert.ok(router.includes("AGENTS.md"), "the router does not send the agent to the dispatcher");
});

test("each command's description is the source description, verbatim", () => {
  for (const name of sourceCommands) {
    const source = field(frontmatter(path.join(commandsDir, `${name}.md`)), "description");
    const { description } = readCommandToml(path.join(extensionDir, "commands", `${name}.toml`));
    assert.equal(
      description,
      source,
      `${name}: the Gemini description differs from the source, so the command reads differently in the two hosts`,
    );
  }
});

test("each command is runnable from the user's project", () => {
  const posixSkillDir = skillDir.split(path.sep).join("/");
  for (const name of sourceCommands) {
    const { prompt } = readCommandToml(path.join(extensionDir, "commands", `${name}.toml`));

    // Gemini's placeholder, not Claude's.
    assert.ok(!prompt.includes("$ARGUMENTS"), `${name} still uses Claude's $ARGUMENTS placeholder`);
    assert.ok(prompt.includes("{{args}}"), `${name} lost its argument placeholder`);

    // Activation first, or every path in the prompt is unreadable.
    assert.match(prompt, /[Aa]ctivate the `graphcompose-flow` skill/, `${name} does not activate the skill`);

    // A harness path left relative resolves against the user's project, where
    // it does not exist.
    for (const [, relative] of prompt.matchAll(/(?<![\w/.-])((?:scripts|skills|tools|config|schemas)\/[\w./-]+)/g)) {
      assert.fail(`${name} names ${relative} relatively; in Gemini the working directory is the user's project`);
    }

    // Every command that is actually run is absolute and quoted — a home
    // directory with a space in it is otherwise two arguments.
    for (const [, invoked] of prompt.matchAll(/\bnode\s+(\S+)/g)) {
      assert.ok(
        invoked.startsWith(`"${posixSkillDir}/`),
        `${name} runs ${invoked}, which is neither absolute nor quoted`,
      );
    }
  }
});

test("the hooks are Gemini's events, on Gemini's clock, pointing at a script that exists", () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(extensionDir, "hooks", "hooks.json"), "utf8"));
  assert.ok(hooks.hooks && typeof hooks.hooks === "object", "the loader requires a `hooks` object");

  // Claude's names would load without error and never fire.
  const events = Object.keys(hooks.hooks).sort();
  assert.deepEqual(events, ["AfterAgent", "BeforeAgent", "SessionEnd", "SessionStart"]);

  const translated = fs.readFileSync(path.join(repoRoot, "scripts", "telemetry", "gemini-hook.mjs"), "utf8");
  for (const event of events) {
    const entry = hooks.hooks[event][0].hooks[0];
    // Milliseconds, not Claude's seconds: a 10 here would be a 10 ms budget.
    assert.ok(entry.timeout >= 1000, `${event} has a ${entry.timeout} ms timeout, which reads as Claude's seconds`);
    assert.match(entry.command, /gemini-hook\.mjs/, `${event} does not call the Gemini checkpoint writer`);
    assert.match(entry.command, /\$\{extensionPath\}/, `${event} hardcodes a path instead of using \${extensionPath}`);
    assert.ok(
      new RegExp(`\\b${event}\\s*:`).test(translated),
      `hooks.json registers ${event} and gemini-hook.mjs does not translate it, so it would record nothing`,
    );
  }

  // The path inside ${extensionPath} has to resolve in the install.
  const relative = /\$\{extensionPath\}\/([^"]+)/.exec(hooks.hooks.SessionStart[0].hooks[0].command)[1];
  assert.ok(fs.existsSync(path.join(extensionDir, ...relative.split("/"))), `the hook names ${relative}, which is absent`);
});

test("--dry-run writes nothing, --uninstall removes what was written", () => {
  const lifecycle = tempDir("lifecycle");

  const dry = run(["--dest", lifecycle, "--dry-run"]);
  assert.match(dry, /would write/);
  assert.ok(!fs.existsSync(path.join(lifecycle, EXTENSION)), "dry run wrote files");

  run(["--dest", lifecycle]);
  assert.ok(fs.existsSync(path.join(lifecycle, EXTENSION, "gemini-extension.json")));

  run(["--dest", lifecycle, "--uninstall"]);
  assert.ok(!fs.existsSync(path.join(lifecycle, EXTENSION)), "the extension survived --uninstall");
});

test("--link keeps the contributor workflow pointing at the checkout, and says what that costs", () => {
  const linked = tempDir("linked");
  const out = run(["--dest", linked, "--link"]);
  assert.match(out, /linked checkout/i);

  const router = fs.readFileSync(path.join(linked, EXTENSION, "skills", EXTENSION, "SKILL.md"), "utf8");
  assert.ok(router.includes(repoRoot.split(path.sep).join("/")), "--link did not point at this checkout");
  assert.match(router, /tracks your working tree/, "--link does not warn that it is checkout-bound");
  // The read restriction is the whole reason --link is the contributor path.
  assert.match(router, /workspace directory|\/directory add/, "--link does not say how Gemini is allowed to read it");

  // A linked install has no runtime under the extension, so ${extensionPath}
  // would name a script that is not there.
  const hooks = JSON.parse(fs.readFileSync(path.join(linked, EXTENSION, "hooks", "hooks.json"), "utf8"));
  const command = hooks.hooks.SessionStart[0].hooks[0].command;
  assert.ok(!command.includes("${extensionPath}"), "a linked install points its hooks into an empty extension");
  assert.ok(command.includes(repoRoot.split(path.sep).join("/")), "a linked install does not call the checkout's hook");
});

test("--name renames the extension, its skill and its manifest together", () => {
  // The three have to agree: Gemini matches the manifest name to the directory,
  // and the router's frontmatter name to its own.
  const renamed = tempDir("renamed");
  run(["--dest", renamed, "--name", "gc-flow-test"]);

  const manifest = JSON.parse(fs.readFileSync(path.join(renamed, "gc-flow-test", "gemini-extension.json"), "utf8"));
  assert.equal(manifest.name, "gc-flow-test");
  const fm = frontmatter(path.join(renamed, "gc-flow-test", "skills", "gc-flow-test", "SKILL.md"));
  assert.equal(field(fm, "name"), "gc-flow-test");
});
