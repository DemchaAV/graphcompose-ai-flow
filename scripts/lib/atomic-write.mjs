/**
 * scripts/lib/atomic-write.mjs — a file is either the old one or the new one.
 *
 * Several terminals run the harness at once, and the workspace's records —
 * resolved-version.json, an observation, attempts.json, the accepted
 * limitations — were written with a plain writeFileSync: a reader arriving
 * mid-write gets a truncated file, and two writers interleave. The icon
 * cache already did the right thing (tmp + rename); this is that, for JSON,
 * in one place.
 */

import fs from "node:fs";
import path from "node:path";

/**
 * Write `content` to `file` through a sibling temp file and an atomic rename.
 * The directory is created when missing.
 */
export function writeFileAtomic(file, content, encoding = "utf8") {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`;
  fs.writeFileSync(tmp, content, encoding);
  try {
    fs.renameSync(tmp, file);
  } catch (err) {
    // Windows refuses to rename over a file another process holds open.
    // Fall back to an in-place write rather than leaving nothing, and remove
    // the temp file either way.
    try {
      fs.writeFileSync(file, content, encoding);
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* already gone */
      }
    }
    if (err?.code !== "EPERM" && err?.code !== "EBUSY" && err?.code !== "EEXIST") throw err;
  }
}

/** JSON, two-space indented, trailing newline, written atomically. */
export function writeJsonAtomic(file, value) {
  writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}
