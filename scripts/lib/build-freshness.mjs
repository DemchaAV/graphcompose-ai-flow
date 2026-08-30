/**
 * scripts/lib/build-freshness.mjs — is a compiled tool current, not just present.
 *
 * ## Why
 *
 * `revision-manager` and `visual-diff` ship as TypeScript and run from a
 * gitignored `dist/`. Every guard in this repository asked the same question of
 * that directory — does it exist — and none asked whether it was current. Those
 * are different failures and only the first one is loud:
 *
 * - **missing** `dist/`: the bin shim exits 69 naming `npm run setup`.
 * - **stale** `dist/`: the old CLI runs. It rejects flags it predates
 *   (`error: unknown option '--report'`, exit 1) and silently does less work
 *   than the caller expects — a `new-revision` compiled before sources were
 *   carried forward exits 0 having carried none.
 *
 * That second failure cost this repository two red tests that survived a
 * `git stash` of every local change, because `dist/` is gitignored and a stash
 * does not reach it: `pass.mjs --open` reported exit 1 with an empty screen and
 * the reason on a stream nobody printed.
 *
 * ## What counts as stale
 *
 * The newest mtime anywhere under `src/` against the newest anywhere under the
 * build output. `tsc` reads the first and writes the second, so a build always
 * leaves the output at least as new; anything newer in `src/` has not been
 * compiled yet.
 *
 * Only a source checkout can be behind. A published package ships `bin/` and
 * `dist/` and no `src/` (see either tool's `files` field), so an absent `src/`
 * means there is nothing to be behind and the build is taken as current.
 *
 * The bin shims deliberately do not import this module: they are the entry
 * points of two standalone npm packages and cannot reach into the harness's
 * `scripts/`. They carry the same check inline, pinned by
 * scripts/test/build-freshness.test.mjs.
 */

import fs from "node:fs";
import path from "node:path";

/**
 * The newest mtime under `target`, in epoch milliseconds; the file's own when
 * `target` is a file, and 0 when it is absent or unreadable. Directory mtimes
 * are ignored — on Windows they move for reasons that have nothing to do with
 * the files.
 *
 * A file is answered rather than treated as an empty directory because one
 * caller compares against one: `preflight` asks about
 * `tools/preview-renderer/target/preview-renderer.jar`. Returning 0 there would
 * make any future sibling `src/` permanently newer, and no rebuild could ever
 * clear it.
 *
 * @param {string} target  a directory, or a single build artifact
 * @returns {number}
 */
export function newestMtimeMs(target) {
  let newest = 0;
  let entries;
  try {
    entries = fs.readdirSync(target, { withFileTypes: true });
  } catch (err) {
    if (err?.code !== "ENOTDIR") return 0; // absent, or unreadable
    try {
      return fs.statSync(target).mtimeMs; // a file: it is its own newest
    } catch {
      return 0;
    }
  }
  for (const entry of entries) {
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestMtimeMs(full));
    } else {
      try {
        newest = Math.max(newest, fs.statSync(full).mtimeMs);
      } catch {
        /* raced with a rebuild; the next call sees it */
      }
    }
  }
  return newest;
}

/**
 * Whether `outDir` was compiled before the current contents of `srcDir`.
 *
 * False when either is absent: a missing build is the other guard's failure and
 * has its own message, and a missing `src/` is a published package.
 *
 * @param {string} outDir  the build output — a directory such as
 *   `tools/revision-manager/dist`, or a single artifact such as a packaged jar
 * @param {string} srcDir  the sources it is compiled from
 * @returns {boolean}
 */
export function isBuildStale(outDir, srcDir) {
  if (!fs.existsSync(outDir) || !fs.existsSync(srcDir)) return false;
  return newestMtimeMs(srcDir) > newestMtimeMs(outDir);
}
