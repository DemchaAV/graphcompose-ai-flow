#!/usr/bin/env node
/**
 * scripts/observations.mjs — what we have learned about a GraphCompose line,
 * and whether it is still true.
 *
 *   node scripts/observations.mjs list [--version 2.2] [--json]
 *   node scripts/observations.mjs show <id>
 *   node scripts/observations.mjs verify [--id <id>] [--version 2.2]
 *   node scripts/observations.mjs promote <id> --into <pack-file>
 *
 * The first acceptance run established three real behaviours of GraphCompose
 * 2.2 — a shape container painting its margin above its box, top-clamping an
 * over-tall child, a row refusing to nest in a row cell — and recorded them in
 * one CV's README. The next run would have paid for them again.
 *
 * An observation is evidence, deliberately NOT a skill. The skill packs are the
 * allow-list an agent authors against, and a behaviour seen once in one
 * document is not that. The path is: record it, let a probe re-confirm it, then
 * promote it on purpose. `verify` is what keeps the middle step honest — it
 * re-runs the probe and compares against the numbers recorded, so a library fix
 * retires an observation instead of leaving it to mislead.
 *
 * Exit codes: 0 fine, 1 an observation no longer holds, 2 usage.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { installRoot } from "./lib/workspace.mjs";

const repoRoot = installRoot();
const ROOT = path.join(repoRoot, "observations");

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/observations.mjs <command> [options]\n\n" +
      "  list [--version <line>] [--json]   what is on record\n" +
      "  show <id>                          one observation in full\n" +
      "  verify [--id <id>]                 re-run the probes and compare\n" +
      "  promote <id> --into <file>         fold a confirmed observation into a skill pack\n",
  );
  process.exit(code);
}

const argv = process.argv.slice(2);
if (argv.length === 0) usage(2);

const command = argv[0];
const args = { id: null, version: null, json: false, into: null, positional: null };
for (let i = 1; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === "--help" || a === "-h") usage(0);
  else if (a === "--json") args.json = true;
  else if (a === "--id") args.id = argv[++i];
  else if (a === "--version" || a === "-v") args.version = argv[++i];
  else if (a === "--into") args.into = argv[++i];
  else if (a.startsWith("--")) {
    process.stderr.write(`[observations] unknown argument: ${a}\n`);
    usage(2);
  } else args.positional = a;
}

/** Every observation on disk, newest line first. */
function load(version = null) {
  if (!fs.existsSync(ROOT)) return [];
  const lines = fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith("graphcompose-"))
    .map((e) => e.name.replace("graphcompose-", ""))
    .filter((l) => !version || l === version);

  const out = [];
  for (const line of lines) {
    const dir = path.join(ROOT, `graphcompose-${line}`);
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      try {
        out.push({ line, file: path.join(dir, file), body: JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) });
      } catch (cause) {
        process.stderr.write(`[observations] ${file} is not valid JSON: ${cause.message}\n`);
        process.exit(1);
      }
    }
  }
  return out.sort((a, b) => a.body.id.localeCompare(b.body.id));
}

if (command === "list") {
  const all = load(args.version);
  if (args.json) {
    process.stdout.write(`${JSON.stringify(all.map((o) => o.body), null, 2)}\n`);
    process.exit(0);
  }
  if (all.length === 0) {
    process.stdout.write("[observations] nothing on record\n");
    process.exit(0);
  }
  for (const { body } of all) {
    const state = body.promotedTo ? `promoted -> ${body.promotedTo}` : body.confidence;
    process.stdout.write(`  ${body.id}\n    ${body.graphComposeVersion} · ${state}\n`);
    process.stdout.write(`    ${body.observedBehaviour.split(". ")[0]}.\n\n`);
  }
  process.exit(0);
}

if (command === "show") {
  const id = args.positional ?? args.id;
  if (!id) usage(2);
  const found = load().find((o) => o.body.id === id);
  if (!found) {
    process.stderr.write(`[observations] no observation with id "${id}"\n`);
    process.exit(1);
  }
  process.stdout.write(`${JSON.stringify(found.body, null, 2)}\n`);
  process.exit(0);
}

if (command === "verify") {
  const subjects = load(args.version).filter((o) => !args.id || o.body.id === args.id);
  if (subjects.length === 0) {
    process.stderr.write("[observations] nothing to verify\n");
    process.exit(args.id ? 1 : 0);
  }

  let stale = 0;
  for (const { body, file } of subjects) {
    const probe = body.minimalReproduction?.probe;
    if (!probe) {
      // An observation with no probe cannot be re-confirmed. That is a real
      // gap, not a pass.
      console.error(`  FAIL ${body.id}: no probe, so nothing can re-confirm it`);
      stale += 1;
      continue;
    }
    const line = body.graphComposeVersion.split(".").slice(0, 2).join(".");
    const run = spawnSync(
      process.execPath,
      [path.join(repoRoot, "scripts", "probe.mjs"), probe, "--version", line, "--json"],
      { encoding: "utf8" },
    );
    if (run.status !== 0) {
      console.error(`  FAIL ${body.id}: probe "${probe}" did not run`);
      stale += 1;
      continue;
    }

    let result;
    try {
      result = JSON.parse(run.stdout);
    } catch {
      console.error(`  FAIL ${body.id}: probe "${probe}" printed something unparseable`);
      stale += 1;
      continue;
    }

    const differences = compare(body.probeResult ?? {}, result);
    if (differences.length === 0) {
      console.log(`  ok   ${body.id} (${probe})`);
    } else {
      stale += 1;
      console.error(`  FAIL ${body.id}: the probe no longer agrees with what was recorded`);
      for (const d of differences) console.error(`         ${d}`);
      console.error(`         If the library changed, set confidence to "retired" in ${path.basename(file)}`);
    }
  }

  console.log(
    stale === 0
      ? `[observations] ${subjects.length} observation(s) still hold`
      : `[observations] ${stale} of ${subjects.length} no longer hold`,
  );
  process.exit(stale === 0 ? 0 : 1);
}

if (command === "promote") {
  const id = args.positional ?? args.id;
  if (!id || !args.into) usage(2);
  const found = load().find((o) => o.body.id === id);
  if (!found) {
    process.stderr.write(`[observations] no observation with id "${id}"\n`);
    process.exit(1);
  }
  // Promotion is the step that turns evidence into something an agent will
  // treat as the API contract, so it is gated on the probe agreeing right now,
  // not on what was recorded when someone was confident.
  if (found.body.confidence !== "confirmed") {
    process.stderr.write(
      `[observations] "${id}" is ${found.body.confidence}, not confirmed. ` +
        "Only a confirmed observation may be promoted — run verify first.\n",
    );
    process.exit(1);
  }
  const verify = spawnSync(
    process.execPath,
    [path.join(repoRoot, "scripts", "observations.mjs"), "verify", "--id", id],
    { encoding: "utf8", stdio: "inherit" },
  );
  if (verify.status !== 0) {
    process.stderr.write(`[observations] verify failed; "${id}" was not promoted\n`);
    process.exit(1);
  }

  const target = path.isAbsolute(args.into) ? args.into : path.join(repoRoot, args.into);
  if (!fs.existsSync(target)) {
    process.stderr.write(`[observations] no such skill file: ${target}\n`);
    process.exit(1);
  }

  const block = renderForSkill(found.body);
  fs.appendFileSync(target, block, "utf8");
  found.body.promotedTo = path.relative(repoRoot, target).split(path.sep).join("/");
  fs.writeFileSync(found.file, `${JSON.stringify(found.body, null, 2)}\n`, "utf8");

  console.log(`[observations] appended "${id}" to ${found.body.promotedTo}`);
  console.log("[observations] read what was written — a generated paragraph is a draft, not a skill.");
  process.exit(0);
}

process.stderr.write(`[observations] unknown command: ${command}\n`);
usage(2);

// ----------------------------------------------------------------- helpers ---

/**
 * Compare recorded numbers against a fresh probe run. Only keys the observation
 * actually recorded are checked: a probe growing a new field is not a
 * regression, and a probe losing one is.
 */
function compare(recorded, fresh) {
  const differences = [];
  for (const [key, expected] of Object.entries(recorded)) {
    const actual = findKey(fresh, key);
    if (actual === undefined) {
      differences.push(`${key}: recorded ${JSON.stringify(expected)}, the probe no longer reports it`);
    } else if (!equal(expected, actual)) {
      differences.push(`${key}: recorded ${JSON.stringify(expected)}, probe says ${JSON.stringify(actual)}`);
    }
  }
  return differences;
}

/** Probe output nests; an observation records the leaf it cares about. */
function findKey(node, key) {
  if (node === null || typeof node !== "object") return undefined;
  if (Object.hasOwn(node, key)) return node[key];
  for (const value of Object.values(node)) {
    const hit = findKey(value, key);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

function equal(expected, actual) {
  if (typeof expected === "number" && typeof actual === "number") {
    // Measurements, not identities: a hundredth of a point is not a change.
    return Math.abs(expected - actual) <= 0.05;
  }
  if (typeof expected === "string" && typeof actual === "string") {
    return actual.includes(expected) || expected.includes(actual);
  }
  return expected === actual;
}

function renderForSkill(observation) {
  const lines = [
    "",
    `### ${observation.id}`,
    "",
    observation.observedBehaviour,
    "",
    `Confirmed against GraphCompose ${observation.graphComposeVersion} by the ` +
      `\`${observation.minimalReproduction.probe}\` probe:`,
    "",
    "```bash",
    observation.minimalReproduction.command ??
      `node scripts/probe.mjs ${observation.minimalReproduction.probe}`,
    "```",
    "",
  ];
  if (observation.workaround) lines.push(`**What to do instead.** ${observation.workaround}`, "");
  return lines.join("\n");
}
