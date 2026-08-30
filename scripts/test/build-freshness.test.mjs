#!/usr/bin/env node
/**
 * scripts/test/build-freshness.test.mjs — a compiled tool that is behind its
 * sources must say so, not run.
 *
 * ## Why this file exists
 *
 * `revision-manager` and `visual-diff` ship as TypeScript and run from a
 * gitignored `dist/`. Every guard in the tree asked whether that directory
 * existed; none asked whether it was current. The difference is the difference
 * between a loud failure and a silent one:
 *
 * - missing `dist/`: the bin exits 69 and names the fix.
 * - stale `dist/`: the old CLI loads and runs. `pass.mjs --open` exited 1 with
 *   an empty screen because commander answered `error: unknown option
 *   '--report'` on a stream the test discarded, and `pass.mjs --open --json`
 *   was worse — it exited 0 having carried no sources forward, because the
 *   compiled `new-revision` predated carrying them.
 *
 * `dist/` being gitignored is what made it survive: stashing every local change
 * and re-running the suite reproduced the same two failures on what looked like
 * a pristine tree.
 *
 * ## Why every bin, not the two obvious ones
 *
 * `visual-diff` has four entry points into one `dist/`, and the first version of
 * this guard reached only the one named after the package. `region-diff.mjs` —
 * the bin `render-and-diff.mjs` actually spawns to rank regions — was two lines
 * with no check at all, and `render-and-diff` swallows its failure into
 * `not measured:`, so a stale ranking would have been reported as a measured
 * one. Each bin is driven here for real, in a temp install with mtimes set by
 * hand, because what is worth pinning is the exit code and the message.
 *
 * Run with the built-in runner (no dependencies):
 *
 *   node --test scripts/test/
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { isBuildStale, newestMtimeMs } from "../lib/build-freshness.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Every bin that reaches a gitignored dist/, with the file under it it loads. */
const BINS = [
  { tool: "revision-manager", bin: "graphcompose-flow.mjs", entry: "cli.js" },
  { tool: "visual-diff", bin: "visual-diff.mjs", entry: "cli.js" },
  { tool: "visual-diff", bin: "region-diff.mjs", entry: "region-diff-cli.js" },
  { tool: "visual-diff", bin: "mask-regions.mjs", entry: "mask-regions-cli.js" },
  { tool: "visual-diff", bin: "crop-region.mjs", entry: "crop-region-cli.js" },
];

// One listener for every temp directory, not one each: this file makes two dozen
// of them, and a listener apiece trips Node's default limit of ten and prints a
// MaxListenersExceededWarning into a suite whose output is read for gate results.
const temps = [];
process.on("exit", () => {
  for (const dir of temps) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcfresh-${label}-`));
  temps.push(dir);
  return dir;
}

function write(file, text, mtimeSeconds) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
  if (mtimeSeconds !== undefined) fs.utimesSync(file, mtimeSeconds, mtimeSeconds);
}

/**
 * A package's real bin/ in a temp install. The stub under dist/ only announces
 * that it ran, so an assertion can tell "the guard let it through" from "the
 * guard fired" without needing the compiled CLI.
 *
 * @param {{tool: string, bin: string, entry: string}} target
 * @param {{src?: boolean, srcNewer?: boolean, dist?: boolean}} shape
 */
function fakeInstall(label, target, { src = true, srcNewer = false, dist = true } = {}) {
  const pkg = tempDir(label);
  const BUILT_AT = 1_700_000_000; // any fixed instant; only the ordering matters
  // The whole bin/, not the one file: the guard lives in a sibling module the
  // bins import, and copying one of them would test an install nobody ships.
  fs.cpSync(path.join(repoRoot, "tools", target.tool, "bin"), path.join(pkg, "bin"), { recursive: true });
  if (src) write(path.join(pkg, "src", "cli.ts"), "export {};\n", srcNewer ? BUILT_AT + 60 : BUILT_AT - 60);
  if (dist) write(path.join(pkg, "dist", target.entry), 'console.log("RAN");', BUILT_AT);
  return path.join(pkg, "bin", target.bin);
}

const run = (entry) => spawnSync(process.execPath, [entry], { encoding: "utf8" });

// ----------------------------------------------------------------- the lib ---

test("newestMtimeMs reports the newest file below a directory, and 0 for nothing", () => {
  const dir = tempDir("newest");
  assert.equal(newestMtimeMs(path.join(dir, "absent")), 0, "an absent directory is not an error");
  fs.mkdirSync(path.join(dir, "empty"), { recursive: true });
  assert.equal(newestMtimeMs(path.join(dir, "empty")), 0, "an empty directory has no newest file");

  write(path.join(dir, "tree", "old.ts"), "a\n", 1_700_000_000);
  write(path.join(dir, "tree", "nested", "new.ts"), "b\n", 1_700_000_500);
  assert.equal(
    newestMtimeMs(path.join(dir, "tree")),
    1_700_000_500 * 1000,
    "the walk did not descend, or did not take the maximum",
  );
});

test("a single build artifact answers with its own mtime, not zero", () => {
  // preflight compares against one: tools/preview-renderer/target/preview-renderer.jar.
  // Answering 0 for a file would make any sibling src/ permanently newer, and no
  // rebuild could ever clear it.
  const dir = tempDir("artifact");
  const jar = path.join(dir, "out.jar");
  write(jar, "x\n", 1_700_000_000);
  assert.equal(newestMtimeMs(jar), 1_700_000_000 * 1000);

  write(path.join(dir, "src", "Main.java"), "y\n", 1_699_999_000);
  assert.equal(isBuildStale(jar, path.join(dir, "src")), false, "a jar newer than its sources is current");
  write(path.join(dir, "src", "Main.java"), "y\n", 1_700_000_500);
  assert.equal(isBuildStale(jar, path.join(dir, "src")), true, "a jar older than its sources is stale");
});

test("a build is stale only when its sources moved after it", () => {
  const dir = tempDir("stale");
  const out = path.join(dir, "dist");
  const src = path.join(dir, "src");
  write(path.join(out, "cli.js"), "x\n", 1_700_000_000);

  write(path.join(src, "cli.ts"), "y\n", 1_700_000_000 - 60);
  assert.equal(isBuildStale(out, src), false, "a build newer than its sources is current");

  write(path.join(src, "cli.ts"), "y\n", 1_700_000_000 + 60);
  assert.equal(isBuildStale(out, src), true, "a source edited after the build is stale");
});

test("a missing half is never called stale", () => {
  const dir = tempDir("halves");
  const out = path.join(dir, "dist");
  const src = path.join(dir, "src");
  write(path.join(out, "cli.js"), "x\n", 1_700_000_000);
  write(path.join(src, "cli.ts"), "y\n", 1_700_000_500);

  // A missing dist/ is the bin's other guard, which has its own message.
  assert.equal(isBuildStale(path.join(dir, "gone"), src), false);
  // A published package ships bin/ and dist/ and no src/ — nothing to be behind.
  assert.equal(isBuildStale(out, path.join(dir, "gone")), false);
});

// ---------------------------------------------------------------- the bins ---

for (const target of BINS) {
  const label = `${target.tool}/${target.bin}`;
  const slug = `${target.tool}-${target.bin.replace(/\W+/g, "-")}`;

  test(`${label}: a stale dist exits 69 and names the rebuild`, () => {
    const result = run(fakeInstall(`${slug}-stale`, target, { srcNewer: true }));

    assert.equal(result.status, 69, `expected EX_UNAVAILABLE, got ${result.status}: ${result.stdout}${result.stderr}`);
    assert.doesNotMatch(result.stdout, /RAN/, "the stale build was loaded anyway");
    assert.match(result.stderr, /stale/, "the message does not say what is wrong");
    assert.match(result.stderr, new RegExp(`tools/${target.tool}/src`), "the message does not say which sources moved");
    assert.match(
      result.stderr,
      new RegExp(`npm run build --prefix tools/${target.tool}`),
      "the message does not name the cheap rebuild",
    );
    assert.match(result.stderr, /npm run setup/, "the message does not name the whole-tree fallback");
  });

  test(`${label}: a build newer than its sources runs`, () => {
    const result = run(fakeInstall(`${slug}-fresh`, target, { srcNewer: false }));

    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /RAN/, "a current build was refused");
  });

  test(`${label}: a published package with no src is taken as current`, () => {
    // `files` ships bin/ and dist/ only, and adapters/lib/runtime.mjs copies the
    // same pair, so there is nothing to compare against. Guessing "stale" here
    // would brick every install that is not a checkout.
    const result = run(fakeInstall(`${slug}-published`, target, { src: false }));

    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /RAN/, "an install with no sources was refused");
  });

  test(`${label}: a missing dist exits 69 with the setup instruction`, () => {
    const result = run(fakeInstall(`${slug}-unbuilt`, target, { dist: false }));

    assert.equal(result.status, 69, `expected EX_UNAVAILABLE, got ${result.status}: ${result.stdout}${result.stderr}`);
    assert.doesNotMatch(result.stderr, /Cannot find module|ERR_MODULE_NOT_FOUND/, "a stack trace, not an instruction");
    assert.match(result.stderr, /not built yet/);
    assert.match(result.stderr, /npm run setup/);
  });
}
