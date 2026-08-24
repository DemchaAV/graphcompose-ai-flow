#!/usr/bin/env node
/**
 * scripts/run-tests.mjs — run the node:test files under a directory, on any
 * supported Node.
 *
 *   node scripts/run-tests.mjs [dir] [-- <extra node --test args>]
 *
 * Why this exists rather than `node --test <pattern>`: there is no argument
 * form that works across the versions this project supports.
 *
 *   node --test "dir/ ** /*.test.mjs"   glob support landed in Node 22, so
 *                                       Node 20 reports "Could not find"
 *   node --test dir                     works on Node 20; newer Node treats the
 *                                       directory as a module to execute and
 *                                       fails with MODULE_NOT_FOUND
 *
 * CI pins Node 20 and package.json declares >=20, so the runner enumerates the
 * files itself and passes explicit paths, which every version handles the same.
 * That divergence is exactly how a green local run shipped a red CI.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SUFFIX = ".test.mjs";

const [dirArg = "scripts/test", ...rest] = process.argv.slice(2);
const root = path.resolve(process.cwd(), dirArg);

if (!fs.existsSync(root)) {
  process.stderr.write(`[run-tests] no such directory: ${root}\n`);
  process.exit(2);
}

/** Every *.test.mjs under `dir`, recursively, sorted for a stable order. */
function collect(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...collect(full));
    else if (entry.name.endsWith(SUFFIX)) found.push(full);
  }
  return found;
}

const files = collect(root);
if (files.length === 0) {
  // Silently passing here would mean a rename could delete the whole suite
  // without anything turning red.
  process.stderr.write(`[run-tests] no ${SUFFIX} files under ${root}\n`);
  process.exit(2);
}

const res = spawnSync(process.execPath, ["--test", ...rest, ...files], { stdio: "inherit" });
process.exit(res.status ?? 1);
