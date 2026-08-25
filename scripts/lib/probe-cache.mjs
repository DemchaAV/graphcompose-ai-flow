#!/usr/bin/env node
/**
 * scripts/lib/probe-cache.mjs — when a probe's build can be skipped.
 *
 * Two Maven invocations dominate a probe run. Warm on a real machine: `mvn
 * compile` about 3 s, `dependency:build-classpath` about 3.6 s, against 0.7 s
 * for the probe itself. `observations verify` spawns one probe per
 * observation, so it paid both every time — 21 s for three observations, and
 * linear in however many get recorded.
 *
 * Skipping them is only safe if the decision rests on evidence. A stale cache
 * silently running old code would be worse than a slow probe: the whole point
 * of a probe is that its answer describes the build in front of you.
 *
 * These predicates live here rather than in scripts/probe.mjs so they can be
 * tested without a Java toolchain — the fast CI job has none, and cache
 * invalidation is exactly the logic that deserves tests.
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

/**
 * Does anything under `src/` post-date what is in `target/classes`?
 *
 * Newest source against newest class, rather than a marker file: editing a
 * probe and re-running must always recompile, including when the edit arrived
 * through a git checkout, which a marker written by the last build would miss.
 *
 * @param {string} sourcesDir
 * @param {string} classesDir
 * @returns {boolean} true when a compile is needed
 */
export function needsCompile(sourcesDir, classesDir) {
  const newestClass = newestMtime(classesDir, (name) => name.endsWith(".class"));
  if (newestClass === null) return true; // never built
  const newestSource = newestMtime(sourcesDir, (name) => name.endsWith(".java"));
  if (newestSource === null) return false; // nothing to be stale against
  return newestSource > newestClass;
}

/**
 * Is the cached classpath still worth trusting?
 *
 * Keyed on the pom's **contents**. Timestamps looked like the obvious key and
 * were useless: a commit or a branch switch rewrites pom.xml, so the cache
 * invalidated after every ordinary git operation while the dependencies had
 * not moved at all.
 *
 * A cleaned or pruned local repository invalidates it without touching the pom
 * either, and the failure there is a confusing NoClassDefFoundError from the
 * probe rather than an honest resolve — so every entry is checked to still
 * exist. Twenty-odd stat calls against three seconds of Maven.
 *
 * @param {string} classpathFile
 * @param {string} pomFile
 * @returns {boolean} true when the cached classpath may be reused
 */
export function classpathIsUsable(classpathFile, pomFile) {
  try {
    if (!fs.existsSync(classpathFile)) return false;
    const stamp = stampPathFor(classpathFile);
    if (!fs.existsSync(stamp)) return false;
    if (fs.readFileSync(stamp, "utf8").trim() !== hashOf(pomFile)) return false;

    const entries = fs.readFileSync(classpathFile, "utf8").trim().split(path.delimiter);
    if (entries.length === 0 || entries[0] === "") return false;
    return entries.every((entry) => fs.existsSync(entry));
  } catch {
    return false;
  }
}

/** Record what the cached classpath was resolved from. */
export function stampClasspath(classpathFile, pomFile) {
  try {
    fs.writeFileSync(stampPathFor(classpathFile), `${hashOf(pomFile)}\n`, "utf8");
  } catch {
    // A stamp that cannot be written just means the next run resolves again,
    // which is slow rather than wrong.
  }
}

export function stampPathFor(classpathFile) {
  return `${classpathFile}.pom-sha`;
}

/** Newest mtime under a directory among files the filter accepts, or null. */
export function newestMtime(dir, accept) {
  let newest = null;
  const walk = (current) => {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && accept(entry.name)) {
        const { mtimeMs } = fs.statSync(full);
        if (newest === null || mtimeMs > newest) newest = mtimeMs;
      }
    }
  };
  walk(dir);
  return newest;
}

function hashOf(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
