#!/usr/bin/env node
/**
 * scripts/test/project-lock.test.mjs — one render per project at a time.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { acquireProjectLock, LOCK_FILE, lockHolder, ProjectLockedError } from "../lib/project-lock.mjs";

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gclock-${label}-`));
  process.on("exit", () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
  return dir;
}

test("the lock records who holds it and is released on request", () => {
  const dir = tempDir("hold");
  const lock = acquireProjectLock(dir, { session: "s-1" });
  const record = JSON.parse(fs.readFileSync(path.join(dir, LOCK_FILE), "utf8"));
  assert.equal(record.pid, process.pid);
  assert.equal(record.session, "s-1");
  assert.equal(lockHolder(dir).pid, process.pid);
  lock.release();
  assert.ok(!fs.existsSync(path.join(dir, LOCK_FILE)));
  assert.equal(lockHolder(dir), null);
});

test("a lock held by a live process refuses a second render, naming the holder", () => {
  const dir = tempDir("refuse");
  // Our own pid is alive; write it as if another session held it.
  fs.writeFileSync(path.join(dir, LOCK_FILE), JSON.stringify({ pid: process.pid, session: "other", since: "2026-08-30T10:00:00Z" }));
  // Same pid is treated as ours (a re-entrant render in one process), so use a
  // different live pid: the parent process.
  fs.writeFileSync(path.join(dir, LOCK_FILE), JSON.stringify({ pid: process.ppid, session: "other", since: "2026-08-30T10:00:00Z" }));
  assert.throws(() => acquireProjectLock(dir), ProjectLockedError);
  try {
    acquireProjectLock(dir);
  } catch (err) {
    assert.match(err.message, /another render holds/);
    assert.match(err.message, /session other/);
    assert.match(err.message, new RegExp(`pid ${process.ppid}`));
  }
});

test("a stale lock — dead pid or unreadable — is taken over", () => {
  const dir = tempDir("stale");
  fs.writeFileSync(path.join(dir, LOCK_FILE), JSON.stringify({ pid: 2147483000, session: "gone", since: "2026-08-30T10:00:00Z" }));
  const lock = acquireProjectLock(dir);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, LOCK_FILE), "utf8")).pid, process.pid);
  lock.release();

  fs.writeFileSync(path.join(dir, LOCK_FILE), "not json");
  const again = acquireProjectLock(dir);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, LOCK_FILE), "utf8")).pid, process.pid);
  again.release();
});
