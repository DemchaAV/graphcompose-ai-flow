/**
 * scripts/lib/project-lock.mjs — one render at a time per project.
 *
 * ## Why
 *
 * The harness is run from several terminals at once, on different projects
 * usually — and sometimes on the same one. Two renders of one project race
 * on `render-runner/target`, on the classpath file, on `current.pdf` and on
 * the revision they both write into, and the loser's failure names a file
 * the winner was busy with. Nothing said so.
 *
 * A lock file beside the project says so: who holds it (pid, session, since
 * when), and a second render refuses with that in the message rather than
 * starting. A lock whose process is gone is stale and is taken over, so a
 * crashed render never wedges a project.
 */

import fs from "node:fs";
import path from "node:path";

export const LOCK_FILE = ".render.lock";

export class ProjectLockedError extends Error {
  constructor(holder, file) {
    super(
      `[render] another render holds ${path.basename(path.dirname(file))} ` +
        `(pid ${holder.pid}${holder.session ? `, session ${holder.session}` : ""}, since ${holder.since}). ` +
        "Two renders of one project race on its target/, classpath and current.pdf — wait for it, or work on " +
        `another project. If that process is gone and this message persists, delete ${file}.`,
    );
    this.name = "ProjectLockedError";
    this.holder = holder;
    this.file = file;
  }
}

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: the process exists and is someone else's — still alive.
    return err?.code === "EPERM";
  }
}

/**
 * Take the project's render lock, or throw ProjectLockedError.
 *
 * @param {string} projectDir
 * @param {{ session?: string|null, env?: NodeJS.ProcessEnv }} [options]
 * @returns {{ file: string, release: () => void }}
 */
export function acquireProjectLock(projectDir, options = {}) {
  const file = path.join(projectDir, LOCK_FILE);
  const session = options.session ?? options.env?.CLAUDE_CODE_SESSION_ID ?? process.env.CLAUDE_CODE_SESSION_ID ?? null;
  const record = { pid: process.pid, session, since: new Date().toISOString() };

  let held = false;
  for (let attempt = 0; attempt < 3 && !held; attempt += 1) {
    try {
      const fd = fs.openSync(file, "wx");
      fs.writeSync(fd, `${JSON.stringify(record, null, 2)}\n`);
      fs.closeSync(fd);
      held = true;
      break;
    } catch (err) {
      if (err?.code !== "EEXIST") throw err;
      let holder = null;
      try {
        holder = JSON.parse(fs.readFileSync(file, "utf8"));
      } catch {
        holder = null;
      }
      if (holder && holder.pid !== process.pid && alive(holder.pid)) {
        throw new ProjectLockedError(holder, file);
      }
      if (!holder) {
        // Unreadable: either a stale fragment or another process mid-write.
        // Give a writer a moment before deciding it is stale.
        const started = Date.now();
        while (Date.now() - started < 150) {
          /* spin briefly; the lock is taken synchronously by design */
        }
        try {
          holder = JSON.parse(fs.readFileSync(file, "utf8"));
          if (holder && holder.pid !== process.pid && alive(holder.pid)) {
            throw new ProjectLockedError(holder, file);
          }
        } catch (again) {
          if (again instanceof ProjectLockedError) throw again;
        }
      }
      // Stale (dead pid, still unreadable, or our own): take it over.
      try {
        fs.unlinkSync(file);
      } catch {
        /* someone else removed it first; the retry will tell */
      }
    }
  }
  if (!held) {
    throw new Error(`[render] could not take the render lock at ${file} after three attempts; another render keeps winning it`);
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try {
      const current = JSON.parse(fs.readFileSync(file, "utf8"));
      if (current.pid === process.pid) fs.unlinkSync(file);
    } catch {
      /* already gone */
    }
  };
  process.on("exit", release);
  return { file, release };
}

/** Who holds the lock, if anyone alive does. */
export function lockHolder(projectDir) {
  const file = path.join(projectDir, LOCK_FILE);
  try {
    const holder = JSON.parse(fs.readFileSync(file, "utf8"));
    return alive(holder.pid) ? holder : null;
  } catch {
    return null;
  }
}
