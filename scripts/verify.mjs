#!/usr/bin/env node
/**
 * scripts/verify.mjs — run what CI runs, locally, in the order that fails
 * fastest.
 *
 *   npm run verify [--quick] [--list]
 *
 * The cheap contract checks come first: if the config and the schemas disagree,
 * there is no point spending four minutes on Maven to find out. --quick stops
 * before anything that needs Java or the network.
 *
 * This is not a second definition of the gates. Every step here is a command CI
 * also runs; scripts/test/contracts.test.mjs asserts they stay in step.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** kind: "fast" runs always; "slow" needs Java, Maven or the network. */
const STEPS = [
  {
    name: "harness contracts",
    kind: "fast",
    why: "config, schemas, skills and docs agree",
    cmd: process.execPath,
    // Through the runner, not `--test <glob>`: the glob form needs Node 22 and
    // CI pins 20. See scripts/run-tests.mjs.
    args: ["scripts/run-tests.mjs", "scripts/test"],
  },
  {
    name: "repository contract",
    kind: "fast",
    why: "the skill manifest matches what is on disk",
    cmd: process.execPath,
    args: [".github/scripts/repository-contract.mjs"],
  },
  {
    name: "schema validation",
    kind: "fast",
    why: "every on-disk artifact validates",
    cmd: process.execPath,
    args: [".github/scripts/validate-schemas.mjs"],
    requires: ".github/scripts/node_modules",
  },
  {
    name: "artifact schema tests",
    kind: "fast",
    why: "the schemas accept what they should and reject what they should not",
    cmd: process.execPath,
    args: ["../../scripts/run-tests.mjs", "test"],
    cwd: ".github/scripts",
    requires: ".github/scripts/node_modules",
  },
  {
    name: "revision-manager",
    kind: "fast",
    why: "the revision lifecycle",
    cmd: "npx",
    args: ["vitest", "run"],
    cwd: "tools/revision-manager",
    requires: "tools/revision-manager/node_modules",
  },
  {
    name: "visual-diff",
    kind: "fast",
    why: "the parity gate's arithmetic",
    cmd: "npx",
    args: ["vitest", "run"],
    cwd: "tools/visual-diff",
    requires: "tools/visual-diff/node_modules",
  },
  {
    name: "asset-resolver",
    kind: "fast",
    why: "icon and font resolution",
    cmd: "npm",
    args: ["test"],
    cwd: "tools/asset-resolver",
  },
  {
    name: "skill fixtures",
    kind: "slow",
    why: "the documented API calls resolve against the real library",
    cmd: process.execPath,
    args: ["scripts/validate-skills.mjs"],
  },
];

const args = process.argv.slice(2);
const quick = args.includes("--quick");

if (args.includes("--list")) {
  for (const step of STEPS) console.log(`${step.kind.padEnd(5)} ${step.name.padEnd(24)} ${step.why}`);
  process.exit(0);
}

const isWin = process.platform === "win32";
const results = [];
let failed = 0;

for (const step of STEPS) {
  if (quick && step.kind === "slow") {
    results.push({ step, status: "skipped", note: "--quick" });
    continue;
  }
  if (step.requires) {
    const { existsSync } = await import("node:fs");
    if (!existsSync(path.join(repoRoot, step.requires))) {
      results.push({ step, status: "skipped", note: `${step.requires} missing — run npm run setup` });
      continue;
    }
  }

  process.stdout.write(`\n[1m▶ ${step.name}[0m  (${step.why})\n`);
  const started = Date.now();
  const res = spawnSync(step.cmd, step.args, {
    cwd: path.join(repoRoot, step.cwd ?? "."),
    stdio: "inherit",
    shell: isWin && step.cmd !== process.execPath,
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  if (res.status === 0) {
    results.push({ step, status: "passed", note: `${seconds}s` });
  } else {
    results.push({ step, status: "FAILED", note: `exit ${res.status ?? "signal"}` });
    failed += 1;
  }
}

console.log("\n[1mverify[0m");
for (const { step, status, note } of results) {
  const mark = status === "passed" ? "✓" : status === "skipped" ? "-" : "✗";
  console.log(`  ${mark} ${step.name.padEnd(24)} ${status.padEnd(8)} ${note}`);
}

const skipped = results.filter((r) => r.status === "skipped").length;
if (skipped > 0) {
  console.log(
    `\n  ${skipped} step(s) skipped — a green run with skips is not the same as a green CI.`,
  );
}
if (results.some((r) => r.status === "FAILED" && r.step.name === "schema validation")) {
  console.log(
    "\n  Note: schema validation walks the whole working tree, including files git\n" +
      "  does not track. If the violations are all under an uncommitted example,\n" +
      "  CI will not see them — check with:\n" +
      "      git ls-files --error-unmatch <the reported file>",
  );
}
console.log("");
process.exit(failed > 0 ? 1 : 0);
