#!/usr/bin/env node
/**
 * scripts/test/probe-cache.test.mjs — a probe's build is skipped only when it
 * genuinely has nothing to do.
 *
 * Caching here bought a lot: a warm probe went from 6.0 s to 0.7 s and
 * `observations verify` from 21 s to 2.7 s. All of that is worthless — worse
 * than worthless — if a stale cache ever lets a probe report on code that is
 * no longer there. A probe's only value is that its answer describes the build
 * in front of you.
 *
 * So these tests are about the invalidation, not the speed. No Java toolchain
 * is involved, which is the point of the predicates living in a module.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  classpathIsUsable,
  needsCompile,
  newestMtime,
  stampClasspath,
  stampPathFor,
} from "../lib/probe-cache.mjs";

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcprobecache-${label}-`));
  process.on("exit", () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
  return dir;
}

function write(file, contents, mtime = null) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents, "utf8");
  if (mtime !== null) fs.utimesSync(file, mtime / 1000, mtime / 1000);
  return file;
}

/** A project with sources, classes and a resolvable classpath. */
function project(label) {
  const dir = tempDir(label);
  const src = path.join(dir, "src");
  const classes = path.join(dir, "target", "classes");
  const pom = write(path.join(dir, "pom.xml"), "<project><version>1</version></project>\n");
  const jar = write(path.join(dir, "lib", "dep.jar"), "jar");
  const classpathFile = path.join(dir, "target", "probe-classpath.txt");

  const past = Date.now() - 60_000;
  write(path.join(src, "Probe.java"), "class Probe {}", past);
  write(path.join(classes, "Probe.class"), "bytes", Date.now());
  write(classpathFile, jar);
  stampClasspath(classpathFile, pom);

  return { dir, src, classes, pom, jar, classpathFile };
}

// -------------------------------------------------------------- compiling ---

test("a build with nothing newer than it is reused", () => {
  const p = project("fresh");
  assert.equal(needsCompile(p.src, p.classes), false);
});

test("editing a source forces a recompile", () => {
  const p = project("edited");
  write(path.join(p.src, "Probe.java"), "class Probe { /* changed */ }", Date.now() + 1000);
  assert.equal(needsCompile(p.src, p.classes), true);
});

test("a project that was never built compiles", () => {
  const p = project("unbuilt");
  fs.rmSync(p.classes, { recursive: true, force: true });
  assert.equal(needsCompile(p.src, p.classes), true);
});

test("a new source file with no class of its own forces a recompile", () => {
  // Comparing counts would miss this; comparing newest-against-newest catches
  // it, because a file added now is newer than every class.
  const p = project("added");
  write(path.join(p.src, "Second.java"), "class Second {}", Date.now() + 1000);
  assert.equal(needsCompile(p.src, p.classes), true);
});

// -------------------------------------------------------------- classpath ---

test("a classpath resolved from the current pom is reused", () => {
  const p = project("cpfresh");
  assert.equal(classpathIsUsable(p.classpathFile, p.pom), true);
});

test("touching the pom without changing it does not invalidate the classpath", () => {
  // This is the whole reason the key is a hash. A commit or a branch switch
  // rewrites pom.xml, and a timestamp key threw the cache away every time
  // while the dependencies had not moved at all.
  const p = project("cptouched");
  const later = Date.now() + 10_000;
  fs.utimesSync(p.pom, later / 1000, later / 1000);
  assert.equal(classpathIsUsable(p.classpathFile, p.pom), true);
});

test("changing the pom invalidates the classpath", () => {
  const p = project("cpchanged");
  fs.writeFileSync(p.pom, "<project><version>2</version></project>\n", "utf8");
  assert.equal(classpathIsUsable(p.classpathFile, p.pom), false);
});

test("a classpath entry that no longer exists invalidates the cache", () => {
  // A cleaned or pruned local repository does not touch the pom, and the
  // failure without this check is a NoClassDefFoundError from the probe rather
  // than an honest resolve.
  const p = project("cppruned");
  fs.rmSync(p.jar);
  assert.equal(classpathIsUsable(p.classpathFile, p.pom), false);
});

test("a classpath with no stamp is not trusted", () => {
  const p = project("cpnostamp");
  fs.rmSync(stampPathFor(p.classpathFile));
  assert.equal(classpathIsUsable(p.classpathFile, p.pom), false);
});

test("an empty or missing classpath file is not trusted", () => {
  const p = project("cpempty");
  fs.writeFileSync(p.classpathFile, "   \n", "utf8");
  assert.equal(classpathIsUsable(p.classpathFile, p.pom), false);

  fs.rmSync(p.classpathFile);
  assert.equal(classpathIsUsable(p.classpathFile, p.pom), false);
});

test("a missing pom is a cache miss, not a crash", () => {
  const p = project("cpnopom");
  fs.rmSync(p.pom);
  assert.equal(classpathIsUsable(p.classpathFile, p.pom), false);
});

test("the stamp lands beside the classpath, inside target/, where git ignores it", () => {
  const p = project("stamp");
  const stamp = stampPathFor(p.classpathFile);
  assert.equal(path.dirname(stamp), path.dirname(p.classpathFile));
  assert.ok(fs.existsSync(stamp));
  assert.match(fs.readFileSync(stamp, "utf8").trim(), /^[0-9a-f]{64}$/);
});

// ----------------------------------------------------------------- helper ---

test("newestMtime ignores files the filter rejects, and returns null for nothing", () => {
  const dir = tempDir("newest");
  assert.equal(newestMtime(dir, () => true), null);

  write(path.join(dir, "a.txt"), "x", Date.now() + 5000);
  write(path.join(dir, "nested", "b.java"), "y", Date.now());
  const javaOnly = newestMtime(dir, (n) => n.endsWith(".java"));

  assert.ok(javaOnly !== null, "the nested .java was not found");
  assert.ok(javaOnly < newestMtime(dir, () => true), "the .txt was counted as a source");
});

test("newestMtime on a directory that does not exist is null, not a throw", () => {
  assert.equal(newestMtime(path.join(tempDir("gone"), "nope"), () => true), null);
});
