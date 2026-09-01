#!/usr/bin/env node
/**
 * adapters/lib/runtime.mjs — what an installed harness consists of, declared
 * once for every host that installs one.
 *
 * Codex wants flat skill directories; Gemini CLI wants an extension directory.
 * Neither difference is about *what* the harness is: both copy the same runtime
 * and read the same four workflow skills. When that list lived inside the Codex
 * installer, the second adapter had two options — import a CLI that acts when
 * it loads, or restate the list — and a restated list is a fork of the payload
 * that drifts the first time a script is added.
 *
 * So the payload lives here, inert: no argument parsing, no side effects, and
 * nothing that writes. Installers compose it; `scripts/test/host-parity.test.mjs`
 * imports it to check that every command the skills name is actually shipped.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Where the four workflow skills live in the source tree. */
export const WORKFLOWS_DIR = path.join(repoRoot, "skills", "workflows");

/**
 * What the workflow skills actually reach for at run time. Everything else in
 * the repository — the site, published templates, the docs — is not part of the
 * runtime and is deliberately absent.
 */
export const RUNTIME = [
  { from: "config" },
  { from: "schemas" },
  { from: "scripts" },
  { from: "skills" },
  { from: "AGENTS.md" },
  { from: "package.json" },
  // What previous runs learned, and the probes that re-confirm it. Without
  // these an installed agent rediscovers the same library behaviours the hard
  // way, which is the cost this layer exists to remove.
  { from: "observations" },
  { from: "tools/diagnostics", skip: ["target"] },
  // The bundled template seed, and only the files the seeder actually reads.
  // Copying examples/invoice-reference wholesale would bring 1.5 MB of revision
  // artifacts for 52 KB of use. Without these, `init --template` fails in an
  // installed copy while working in the plugin — which is a full clone — and
  // the two packagings quietly stop behaving the same.
  { from: "examples/invoice-reference/template-project.json" },
  { from: "examples/invoice-reference/reference/reference.md" },
  { from: "examples/invoice-reference/revisions/revision-001/revision.json" },
  { from: "examples/invoice-reference/revisions/revision-001/generated-template.java" },
  { from: "examples/invoice-reference/revisions/revision-001/generated-test.java" },
  { from: "examples/invoice-reference/revisions/revision-001/user-request.md" },
  { from: "examples/invoice-reference/render-runner", skip: ["target"] },
  { from: "tools/asset-resolver", skip: ["node_modules"] },
  // The validator the runtime barriers use. Shipped rather than left in
  // .github, which no install carries: a barrier that cannot validate holds
  // every artifact, which is how the analysis gate refused healthy runs.
  { from: "tools/schema-validate", skip: ["node_modules"] },
  // The TypeScript CLIs ship as their build output plus the manifests needed to
  // install runtime dependencies; their source and dev toolchain stay behind.
  { from: "tools/revision-manager/bin" },
  { from: "tools/revision-manager/dist" },
  { from: "tools/revision-manager/package.json" },
  { from: "tools/revision-manager/package-lock.json", optional: true },
  { from: "tools/visual-diff/bin" },
  { from: "tools/visual-diff/dist" },
  { from: "tools/visual-diff/package.json" },
  { from: "tools/visual-diff/package-lock.json", optional: true },
  { from: "tools/preview-renderer/pom.xml" },
  { from: "tools/preview-renderer/target/preview-renderer.jar" },
];

/** Packages whose runtime dependencies are installed inside the copy. */
export const NPM_PACKAGES = ["tools/revision-manager", "tools/visual-diff", "tools/schema-validate"];

/** Built outputs the source tree must already have. */
export const REQUIRED_BUILDS = [
  "tools/revision-manager/dist/cli.js",
  "tools/visual-diff/dist/cli.js",
  "tools/preview-renderer/target/preview-renderer.jar",
];

/** Invariants worth restating where a host's entry point is generated. */
export const ALWAYS = [
  "Never invent GraphCompose API — the pinned pack's `00-api-surface.md` is a closed set.",
  "Every change opens a new revision; never overwrite an APPROVED one.",
  "Resolve the GraphCompose version from the user's build file, never by asking.",
  "Work goes in the user's workspace (`graphcompose-flow/`), not in the harness install.",
];

/** True when `relPath` is inside something the runtime copies. */
export function shipped(relPath) {
  return RUNTIME.some((entry) => relPath === entry.from || relPath.startsWith(`${entry.from}/`));
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** The version every install is labelled with. */
export function harnessVersion() {
  return readJson(path.join(repoRoot, "package.json")).version;
}

/** Frontmatter of a source SKILL.md — the description is the trigger surface. */
export function readSkill(dir) {
  const file = path.join(WORKFLOWS_DIR, dir, "SKILL.md");
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(fs.readFileSync(file, "utf8"));
  if (!match) throw new Error(`${file} has no frontmatter`);
  const field = (name) => {
    const hit = new RegExp(`^${name}:\\s*(.+)$`, "m").exec(match[1]);
    return hit ? hit[1].trim() : null;
  };
  const description = field("description");
  if (!description) throw new Error(`${file} has no description`);
  return { dir, name: field("name") ?? dir, description };
}

export function discoverSkills() {
  return fs
    .readdirSync(WORKFLOWS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => fs.existsSync(path.join(WORKFLOWS_DIR, entry.name, "SKILL.md")))
    .map((entry) => readSkill(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Which required build outputs this checkout is missing. */
export function missingBuilds() {
  return REQUIRED_BUILDS.filter((rel) => !fs.existsSync(path.join(repoRoot, rel)));
}

/** Copy a file or directory, skipping named children. */
export function copyInto(source, target, skip = []) {
  const stat = fs.statSync(source);
  if (stat.isFile()) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    return 1;
  }
  let copied = 0;
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (skip.includes(entry.name)) continue;
    copied += copyInto(path.join(source, entry.name), path.join(target, entry.name), skip);
  }
  return copied;
}

/**
 * Copy the runtime into `target`, replacing whatever was there.
 *
 * A half-copied version is worse than none, so the destination is removed
 * first rather than merged into.
 *
 * @param {string} target
 * @param {{ tolerateMissing?: boolean }} [options] tolerateMissing skips paths
 *   this checkout has not built, for CI and packaging.
 * @returns {number} files copied
 */
export function copyRuntime(target, { tolerateMissing = false } = {}) {
  fs.rmSync(target, { recursive: true, force: true });
  let files = 0;
  for (const item of RUNTIME) {
    const source = path.join(repoRoot, item.from);
    if (!fs.existsSync(source)) {
      if (item.optional || tolerateMissing) continue;
      throw new Error(`missing ${item.from}`);
    }
    files += copyInto(source, path.join(target, item.from), item.skip ?? []);
  }
  return files;
}

export function directorySizeKb(dir) {
  let bytes = 0;
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else bytes += fs.statSync(full).size;
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return Math.round(bytes / 1024);
}

/**
 * Install runtime dependencies inside a copied runtime.
 *
 * Reports rather than throws: a failed npm leaves an otherwise complete
 * install, and telling someone to finish it by hand beats unwinding the copy.
 *
 * @param {string} runtimeRoot
 * @param {(message: string) => void} log
 * @returns {Array<{ pkg: string, error: string }>} packages that failed
 */
export function installRuntimeDeps(runtimeRoot, log = () => {}) {
  const failures = [];
  for (const pkg of NPM_PACKAGES) {
    const cwd = path.join(runtimeRoot, pkg);
    const lock = fs.existsSync(path.join(cwd, "package-lock.json"));
    log(`installing runtime dependencies in ${pkg} … `);
    try {
      // Windows: Node refuses to spawn .cmd without a shell (CVE-2024-27980)
      // and warns when args go through shell:true unescaped, so go through
      // cmd.exe explicitly — the same idiom scripts/validate-skills.mjs uses
      // for mvn.
      const npmArgs = [lock ? "ci" : "install", "--omit=dev", "--no-audit", "--no-fund"];
      const [command, commandArgs] =
        process.platform === "win32"
          ? ["cmd.exe", ["/d", "/s", "/c", "npm", ...npmArgs]]
          : ["npm", npmArgs];
      execFileSync(command, commandArgs, { cwd, stdio: "pipe" });
      log("ok\n");
    } catch (err) {
      log("failed\n");
      failures.push({ pkg, error: (err.stderr ?? "").toString().split("\n").slice(0, 3).join("\n") });
    }
  }
  return failures;
}
