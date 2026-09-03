/**
 * scripts/lib/atomic-write.mjs — a file is either the old one or the new one.
 *
 * Several terminals run the harness at once, and the workspace's records —
 * resolved-version.json, an observation, attempts.json, the accepted
 * limitations — were written with a plain writeFileSync: a reader arriving
 * mid-write gets a truncated file, and two writers interleave. The icon
 * cache already did the right thing (tmp + rename); this is that, for JSON,
 * in one place.
 *
 * Two strengths, because two kinds of file want different answers when the
 * rename cannot be made:
 *
 *   writeFileAtomic   a workspace record. Falls back to an in-place write —
 *                     losing the file would be worse than a brief window.
 *   replaceFileAtomic a canonical artifact someone joins on. Retries, then
 *                     throws, leaving the previous complete file in place. An
 *                     in-place write here would re-open the exact truncation
 *                     window the rename exists to close.
 *   stageAndCommit    the same, with a validation step between the complete
 *                     write and the rename: an invalid artifact never becomes
 *                     canonical at all.
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
    // Fall back to an in-place write; a fallback that succeeded is a success,
    // whatever the rename said. The temp file goes either way.
    try {
      fs.writeFileSync(file, content, encoding);
      return;
    } catch (fallback) {
      throw fallback;
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* already gone */
      }
    }
  }
}

/** JSON, two-space indented, trailing newline, written atomically. */
export function writeJsonAtomic(file, value) {
  writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** Raised when a strict replacement could not be made atomically. */
export class AtomicReplaceError extends Error {
  constructor(message, { file, tmp, cause } = {}) {
    super(message);
    this.name = "AtomicReplaceError";
    this.file = file ?? null;
    this.tmp = tmp ?? null;
    if (cause) this.cause = cause;
  }
}

/**
 * Windows refuses to rename over a file another process currently has open —
 * `EPERM: operation not permitted, rename` — and a scanner or a just-exited
 * process holds one for a moment too. Measured here: a reader polling a 50 KB
 * artifact clears in tens of milliseconds; a reader in a tight loop over an
 * 8 MB one can hold it for seconds, and that is not hypothetical, because the
 * coordinator reads all five artifacts every time it runs the barrier.
 *
 * So the ladder is patient — about five seconds in total, backing off — and then
 * the caller is told. It never degrades to an in-place write: that would put
 * back the exact truncation window the rename exists to close, in the one
 * situation where a reader is provably present.
 *
 * Anything that is not one of these codes — a missing directory, a full disk —
 * is not going to get better by waiting, so it is reported on the first try.
 */
const TRANSIENT = new Set(["EPERM", "EACCES", "EBUSY", "ENOTEMPTY"]);
const RETRY_DELAYS_MS = [5, 15, 40, 100, 250, 500, 1000, 1500, 1500];

/** Block for `ms` without a timer, because every caller here is synchronous. */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Replace `file` with `content`, or leave the file exactly as it was.
 *
 * The difference from `writeFileAtomic` is what happens when the rename cannot
 * be made: that one falls back to writing in place, which is right for a
 * workspace record nobody joins on, and wrong for a canonical artifact — an
 * in-place write is the very truncation window the atomic rename exists to
 * close. Here the rename is retried and then the call throws, so the reader on
 * the other side of the barrier still sees the previous complete artifact
 * rather than half of the new one.
 *
 * @param {string} file the canonical path
 * @param {string} content
 * @param {{ encoding?: string, retries?: number[] }} [options]
 * @returns {{ replaced: boolean, tmp: string }} `replaced` is false when the
 *   canonical file did not exist before — a create rather than a replace
 * @throws {AtomicReplaceError} the canonical file is untouched
 */
export function replaceFileAtomic(file, content, { encoding = "utf8", retries = RETRY_DELAYS_MS } = {}) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const existed = fs.existsSync(file);
  // Same directory, so the rename stays inside one filesystem — a temp file in
  // the OS temp directory is a copy across devices, which is not atomic.
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now().toString(36)}.tmp`);
  try {
    fs.writeFileSync(tmp, content, encoding);
  } catch (cause) {
    cleanup(tmp);
    throw new AtomicReplaceError(`could not write the temporary file beside ${file}: ${cause.message}`, { file, tmp, cause });
  }

  let last = null;
  for (let attempt = 0; attempt <= retries.length; attempt += 1) {
    try {
      fs.renameSync(tmp, file);
      return { replaced: existed, tmp };
    } catch (cause) {
      last = cause;
      if (!TRANSIENT.has(cause.code) || attempt === retries.length) break;
      sleepSync(retries[attempt]);
    }
  }
  cleanup(tmp);
  throw new AtomicReplaceError(
    `could not replace ${file} atomically (${last?.code ?? "unknown"}: ${last?.message ?? "no reason given"}) — ` +
      "the previous file is untouched; close whatever holds it open and re-run",
    { file, tmp, cause: last },
  );
}

/** Remove a temp file, whatever state it is in. A failed write leaves nothing. */
export function cleanup(tmp) {
  try {
    fs.unlinkSync(tmp);
  } catch {
    /* already gone, or never created */
  }
}

/**
 * Write to a temp file beside `file`, let `validate` inspect it, and only then
 * make it canonical. `validate` receives the temp path and the parsed content
 * and returns `{ ok, detail }`; a rejection removes the temp file and leaves
 * the canonical one exactly as it was.
 *
 * This is the whole "artifact.tmp -> complete write -> validation -> atomic
 * rename" sequence in one place, so no caller can perform three of the four
 * steps and believe it did all of them.
 *
 * @returns {{ ok: true, replaced: boolean } | { ok: false, detail: string }}
 */
export function stageAndCommit(file, content, validate, { encoding = "utf8" } = {}) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now().toString(36)}.tmp`);
  try {
    fs.writeFileSync(tmp, content, encoding);
  } catch (cause) {
    cleanup(tmp);
    return { ok: false, detail: `could not stage the artifact: ${cause.message}` };
  }

  let verdict;
  try {
    verdict = validate(tmp, content);
  } catch (err) {
    cleanup(tmp);
    return { ok: false, detail: `validation threw: ${err.message}` };
  }
  if (!verdict?.ok) {
    cleanup(tmp);
    return { ok: false, detail: verdict?.detail ?? "the staged artifact did not validate" };
  }

  const existed = fs.existsSync(file);
  let last = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      fs.renameSync(tmp, file);
      return { ok: true, replaced: existed };
    } catch (cause) {
      last = cause;
      if (!TRANSIENT.has(cause.code) || attempt === RETRY_DELAYS_MS.length) break;
      sleepSync(RETRY_DELAYS_MS[attempt]);
    }
  }
  cleanup(tmp);
  return {
    ok: false,
    detail:
      `the artifact validated but could not replace ${path.basename(file)} atomically ` +
      `(${last?.code ?? "unknown"}) — the previous file is untouched`,
  };
}
