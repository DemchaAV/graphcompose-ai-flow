#!/usr/bin/env node
/**
 * adapters/agensi/build-bundle.mjs — package the harness as one skill zip for a
 * skill marketplace (Agensi): SKILL.md at the root, the runtime beside it.
 *
 *   npm run setup                         # once: the bundle ships prebuilt
 *   node adapters/agensi/build-bundle.mjs [--out <dir>] [--no-zip]
 *
 * A marketplace installs one skill directory into whichever agent the buyer
 * uses, and runs nothing. So the zip carries the same runtime the Codex and
 * Gemini adapters copy (adapters/lib/runtime.mjs decides what that is), plus
 * a root SKILL.md that routes to the four workflows and an install/ folder
 * whose bootstrap finishes the job on first use: toolchain, npm dependencies,
 * GraphCompose in ~/.m2, and the workflow skills registered with the host.
 *
 * Output: <out>/graphcompose-ai-flow/ (the staged tree) and
 *         <out>/graphcompose-ai-flow-<version>.zip
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { copyInto, copyRuntime, directorySizeKb, harnessVersion, missingBuilds, repoRoot } from "../lib/runtime.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const MAX_BYTES = 50 * 1024 * 1024; // Agensi's listing limit
const NAME = "graphcompose-ai-flow";

const argv = process.argv.slice(2);
const outIndex = argv.indexOf("--out");
const outDir = path.resolve(outIndex >= 0 ? argv[outIndex + 1] : path.join(repoRoot, "dist", "agensi"));
const makeZip = !argv.includes("--no-zip");

const unbuilt = missingBuilds();
if (unbuilt.length) {
  process.stderr.write(
    `[agensi] the harness is not built:\n${unbuilt.map((r) => `  missing ${r}\n`).join("")}\nRun npm run setup first.\n`,
  );
  process.exit(69);
}

const version = harnessVersion();
const stage = path.join(outDir, NAME);

// --- stage -----------------------------------------------------------------------
let files = copyRuntime(stage);
// The contributor test suite is not runtime; nothing a skill names lives there.
fs.rmSync(path.join(stage, "scripts", "test"), { recursive: true, force: true });

files += copyInto(path.join(repoRoot, "adapters", "lib", "runtime.mjs"), path.join(stage, "adapters", "lib", "runtime.mjs"));
files += copyInto(path.join(here, "bundle", "install"), path.join(stage, "install"));
// A checkout with core.autocrlf turns the shell wrapper into CRLF, which bash
// refuses to run. The bundle is built on Windows too, so normalise it here.
const wrapper = path.join(stage, "install", "bootstrap.sh");
fs.writeFileSync(wrapper, fs.readFileSync(wrapper, "utf8").replace(/\r\n/g, "\n"), { mode: 0o755 });
files += copyInto(path.join(repoRoot, "LICENSE"), path.join(stage, "LICENSE"));

const skill = fs.readFileSync(path.join(here, "bundle", "SKILL.md"), "utf8").replaceAll("{{VERSION}}", version);
fs.writeFileSync(path.join(stage, "SKILL.md"), skill);
files += 1;

console.log(`[agensi] staged ${files} files, ${directorySizeKb(stage)} KB → ${stage}`);
if (!makeZip) process.exit(0);

// --- zip -------------------------------------------------------------------------
const zip = path.join(outDir, `${NAME}-${version}.zip`);
fs.rmSync(zip, { force: true });
const entries = fs.readdirSync(stage);

// zip(1) where it exists; otherwise bsdtar, which writes zip with -a. GNU tar
// also accepts -a and silently writes a plain tar under the .zip name, so the
// result is checked for the zip signature rather than trusted.
const isZip = () => fs.existsSync(zip) && fs.readFileSync(zip).subarray(0, 2).toString() === "PK";
const bsdtar = process.platform === "win32" ? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";
let r = spawnSync("zip", ["-q", "-r", "-X", zip, ...entries], { cwd: stage, stdio: "pipe" });
if (r.status !== 0 || !isZip()) {
  fs.rmSync(zip, { force: true });
  r = spawnSync(bsdtar, ["-a", "-cf", zip, "-C", stage, ...entries], { stdio: "pipe" });
}
if (r.status !== 0 || !isZip()) {
  fs.rmSync(zip, { force: true });
  process.stderr.write(`[agensi] could not create the zip: ${(r.stderr ?? "").toString().trim()}\n`);
  process.exit(1);
}

const size = fs.statSync(zip).size;
console.log(`[agensi] ${zip}  (${(size / 1024 / 1024).toFixed(1)} MB)`);
if (size > MAX_BYTES) {
  process.stderr.write(`[agensi] over the 50 MB listing limit\n`);
  process.exit(1);
}
