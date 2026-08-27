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

/**
 * Files that mutate something the rest of the suite reads, and therefore cannot
 * share a run with it.
 *
 * ## The one that is here, and why
 *
 * `revision-discipline` drives `render-runtime.mjs` for real, and a full-pipeline
 * render runs `mvn package` on `tools/preview-renderer` — in this checkout, not a
 * copy. Meanwhile `import-reference` *executes* that same
 * `target/preview-renderer.jar` in a JVM to rasterise a PDF
 * (`import-reference.mjs:120`).
 *
 * The jar is never missing — the shade plugin replaces it atomically, confirmed
 * by polling the path 13,533 times through a full package with zero misses. The
 * hazard is subtler: a JVM loads classes from a jar **lazily**, so replacing the
 * file under a live process invalidates the handle it has not finished reading
 * from. The rasterisation dies part-way through PDFBox:
 *
 *     NoClassDefFoundError: org/apache/pdfbox/contentstream/operator/text/
 *                           SetTextHorizontalScaling
 *       at PDFRenderer.createPageDrawer(PDFRenderer.java:528)
 *     Caused by: ClassNotFoundException
 *
 * A class PDFBox only needs for some content streams, absent from a jar that was
 * present when the JVM started. `codex-adapter`, which copies the runtime tree
 * and asserts the jar arrived, failed once in the same window; its message was
 * not captured before the race stopped reproducing, so that one is recorded as
 * consistent-with rather than proven.
 *
 * Nothing is wrong with any of the three tests. What was wrong is running a
 * writer of a shared build artifact concurrently with a process executing it.
 *
 * The narrow fix is to give the writer its own pass. Everything else stays
 * parallel, so the suite keeps its speed and stops depending on scheduling.
 *
 * ## Kept after the root cause was fixed
 *
 * `render-runtime.mjs` no longer rebuilds the renderer on every render — it
 * compares the jar against its sources and builds only when they moved, so
 * `revision-discipline` does not touch the shared jar any more (verified by
 * mtime before and after the file runs). This list is therefore belt as well as
 * braces, and that is deliberate: `RENDER_NO_SKIP=1` still forces a rebuild by
 * design, a source edit mid-suite would too, and the cost of keeping the entry
 * is one file's parallelism against a failure mode that took a full
 * investigation to identify the first time.
 *
 * **Add to this list only for a proven shared-artifact write.** Slowness is not
 * a reason — a file parked here costs the whole suite its parallelism for that
 * file's duration, and "it failed once" is where flaky-test lists come from.
 */
const EXCLUSIVE = new Set(["revision-discipline.test.mjs"]);

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

const exclusive = files.filter((f) => EXCLUSIVE.has(path.basename(f)));
const shared = files.filter((f) => !EXCLUSIVE.has(path.basename(f)));

/** One `node --test` pass. Returns its exit status. */
function runPass(paths) {
  if (paths.length === 0) return 0;
  const res = spawnSync(process.execPath, ["--test", ...rest, ...paths], { stdio: "inherit" });
  return res.status ?? 1;
}

// Writers first, alone. Running them last would leave the jar rebuilt but
// unread, which hides the problem rather than fixing it — and a failure in the
// exclusive pass is worth seeing before waiting out the parallel one.
//
// Both statuses are collected before exiting: a green exclusive pass followed by
// a red parallel one has to come out red, and returning early on the first
// non-zero would report only whichever failed first.
const exclusiveStatus = runPass(exclusive);
const sharedStatus = runPass(shared);
process.exit(exclusiveStatus || sharedStatus);
