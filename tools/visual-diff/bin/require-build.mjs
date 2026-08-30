/**
 * The build guard every bin in this package runs before it imports dist/.
 *
 * ## Why a guard at all
 *
 * This package ships as TypeScript compiled into dist/, which is gitignored. A
 * fresh clone or plugin install therefore has nothing to import, and that is
 * the most likely first failure a new user ever sees: it deserves one line of
 * instruction rather than a module-resolution stack trace.
 *
 * A dist/ that is merely *behind* src/ is checked here too, and it is the
 * nastier of the two, because it loads and runs. In the sibling revision-manager
 * it rejected flags it predated — `error: unknown option '--report'` — and,
 * worse, exited 0 from a `new-revision` that carried no sources forward because
 * it was compiled before carrying them existed. Here the same staleness answers
 * with an older release's arithmetic: a parity number or a region ranking that
 * nobody can date. Because dist/ is gitignored, `git stash` does not reach it,
 * so a stale build survives every attempt to revert it away.
 *
 * Only a source checkout can be behind. The published package ships bin/ and
 * dist/ and no src/ (see `files` in package.json), and so does the adapters'
 * runtime copy (adapters/lib/runtime.mjs) — so an absent src/ means there is
 * nothing to compare and the build is taken as current.
 *
 * ## Why it lives here and not in scripts/lib
 *
 * These bins are the entry points of a standalone npm package and cannot import
 * from the harness's scripts/. scripts/lib/build-freshness.mjs is the same check
 * for callers that can; scripts/test/build-freshness.test.mjs drives every bin
 * in both packages against a real temp install, and scripts/test/pipeline-config
 * .test.mjs pins that no bin reaches dist/ without coming through here first.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(here, "..", "dist");
const srcDir = path.join(here, "..", "src");

/**
 * The newest mtime under `target`, in epoch milliseconds; the file's own when
 * it is a file, and 0 when it is absent. Directory mtimes are ignored — on
 * Windows they move for reasons that have nothing to do with the files.
 */
function newestMtimeMs(target) {
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
  let newest = 0;
  for (const entry of entries) {
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestMtimeMs(full));
    } else {
      try {
        newest = Math.max(newest, fs.statSync(full).mtimeMs);
      } catch {
        /* raced with a rebuild */
      }
    }
  }
  return newest;
}

/**
 * Refuse to run on a build that is missing or behind its sources, naming the
 * command that fixes it. Exits 69 (EX_UNAVAILABLE — an unusable service, not a
 * usage error) rather than returning, so a caller cannot continue past it.
 *
 * @param {string} name       the command as the user typed it, for the message
 * @param {string} entryFile  the file under dist/ this command imports
 */
export function requireBuild(name, entryFile) {
  if (!fs.existsSync(path.join(distDir, entryFile))) {
    process.stderr.write(
      `${name} is not built yet (tools/visual-diff/dist is missing).\n` +
        "Run the one-time setup from the repository root:\n\n" +
        "    npm run setup\n\n" +
        "It installs and builds the Node tools; see docs/plugin-installation.md.\n",
    );
    process.exit(69);
  }

  if (fs.existsSync(srcDir) && newestMtimeMs(srcDir) > newestMtimeMs(distDir)) {
    process.stderr.write(
      `${name} is built from a stale dist/ (tools/visual-diff/src has changed since\n` +
        "it was compiled). Running it would measure with an older release's arithmetic,\n" +
        "so it stops here instead.\n\n" +
        "Rebuild from the repository root:\n\n" +
        "    npm run build --prefix tools/visual-diff   # or, for everything: npm run setup\n\n",
    );
    process.exit(69);
  }
}
