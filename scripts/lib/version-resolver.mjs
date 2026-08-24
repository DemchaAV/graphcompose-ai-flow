#!/usr/bin/env node
/**
 * scripts/lib/version-resolver.mjs — read the GraphCompose version out of a
 * Java project's build file and map it to a skill pack.
 *
 * This is the deterministic half of what the Version + Skill Resolver Agent
 * used to do by reading prompts: a build file states a version, the manifest
 * states which packs exist, and matching them is arithmetic, not judgement.
 *
 * Coordinates recognised:
 *   io.github.demchaav:graph-compose        Maven Central (current)
 *   com.github.DemchaAV:GraphCompose        JitPack (pre-1.6.7 pins)
 *
 * A version with no matching pack is reported as `unsupported` with the packs
 * that do exist. It is never silently rounded to the nearest one: rendering
 * against 2.2 with a 1.9 allow-list would produce calls that do not compile,
 * and a wrong answer is worse than an honest gap.
 */

import fs from "node:fs";
import path from "node:path";

export const BUILD_FILES = Object.freeze(["pom.xml", "build.gradle.kts", "build.gradle"]);

const MAVEN_GROUP = "io.github.demchaav";
const MAVEN_ARTIFACT = "graph-compose";
const JITPACK_GROUP = "com.github.DemchaAV";
const JITPACK_ARTIFACT = "GraphCompose";

export class VersionResolutionError extends Error {
  constructor(message) {
    super(`[resolve-version] ${message}`);
    this.name = "VersionResolutionError";
  }
}

/**
 * Find the nearest build file, walking up from `startDir`.
 *
 * @param {string} startDir
 * @returns {string|null} absolute path to the build file
 */
export function findBuildFile(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    for (const name of BUILD_FILES) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Extract the GraphCompose version a build file pins.
 *
 * @param {string} buildFile
 * @returns {{ version: string, coordinate: string }|null}
 */
export function readPinnedVersion(buildFile) {
  const source = fs.readFileSync(buildFile, "utf8");
  return path.basename(buildFile) === "pom.xml"
    ? readFromPom(source)
    : readFromGradle(source);
}

function readFromPom(xml) {
  const properties = readPomProperties(xml);

  for (const [group, artifact] of [
    [MAVEN_GROUP, MAVEN_ARTIFACT],
    [JITPACK_GROUP, JITPACK_ARTIFACT],
  ]) {
    // Dependency blocks put the three tags in any order in principle, but in
    // practice groupId precedes artifactId precedes version; match that and
    // tolerate whitespace and comments between them.
    const pattern = new RegExp(
      `<groupId>\\s*${escape(group)}\\s*</groupId>[\\s\\S]{0,400}?` +
        `<artifactId>\\s*${escape(artifact)}\\s*</artifactId>[\\s\\S]{0,400}?` +
        `<version>\\s*([^<]+?)\\s*</version>`,
    );
    const hit = pattern.exec(xml);
    if (hit) {
      const raw = hit[1].trim();
      const resolved = resolveProperty(raw, properties);
      if (resolved) return { version: resolved, coordinate: `${group}:${artifact}` };
    }
  }
  return null;
}

function readPomProperties(xml) {
  const block = /<properties>([\s\S]*?)<\/properties>/.exec(xml);
  const properties = {};
  if (!block) return properties;
  const tag = /<([A-Za-z0-9_.-]+)>\s*([^<]*?)\s*<\/\1>/g;
  let hit;
  while ((hit = tag.exec(block[1])) !== null) properties[hit[1]] = hit[2];
  return properties;
}

function resolveProperty(value, properties) {
  const placeholder = /^\$\{([^}]+)\}$/.exec(value);
  if (!placeholder) return value;
  const resolved = properties[placeholder[1]];
  return resolved && resolved.trim() !== "" ? resolved.trim() : null;
}

function readFromGradle(source) {
  for (const [group, artifact] of [
    [MAVEN_GROUP, MAVEN_ARTIFACT],
    [JITPACK_GROUP, JITPACK_ARTIFACT],
  ]) {
    const pattern = new RegExp(`${escape(group)}:${escape(artifact)}:([A-Za-z0-9._-]+)`);
    const hit = pattern.exec(source);
    if (hit) return { version: hit[1], coordinate: `${group}:${artifact}` };
  }
  return null;
}

function escape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Normalise a pin to its major.minor line. Handles a leading v, qualifiers and
 * SNAPSHOT suffixes: v2.2.1-SNAPSHOT and 2.2.0 are both the 2.2 line.
 *
 * @param {string} version
 * @returns {string|null}
 */
export function versionLine(version) {
  const hit = /^v?(\d+)\.(\d+)/.exec(String(version).trim());
  return hit ? `${hit[1]}.${hit[2]}` : null;
}

/**
 * Skill packs present on disk, newest line first.
 *
 * @param {string} install harness install root
 * @returns {Array<{ line: string, path: string }>}
 */
export function availableSkillPacks(install) {
  const versionsDir = path.join(install, "skills", "versions");
  if (!fs.existsSync(versionsDir)) return [];
  return fs
    .readdirSync(versionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("graphcompose-"))
    .map((entry) => ({
      line: entry.name.replace("graphcompose-", ""),
      path: `skills/versions/${entry.name}`,
    }))
    .filter((pack) => versionLine(pack.line) !== null)
    .sort((a, b) => compareLines(b.line, a.line));
}

function compareLines(a, b) {
  const [aMajor, aMinor] = a.split(".").map(Number);
  const [bMajor, bMinor] = b.split(".").map(Number);
  return aMajor === bMajor ? aMinor - bMinor : aMajor - bMajor;
}

/**
 * Resolve version and skill pack for a Java project.
 *
 * @param {{ projectDir?: string, install: string, version?: string|null }} options
 * @returns {{ status: "supported"|"unsupported"|"unknown", version: string|null, line: string|null,
 *            coordinate: string|null, buildFile: string|null, skillPack: string|null,
 *            availablePacks: string[], message?: string }}
 */
export function resolveVersion({ projectDir = process.cwd(), install, version = null } = {}) {
  const packs = availableSkillPacks(install);
  const availablePacks = packs.map((pack) => pack.line);

  let pinned = version ? { version, coordinate: null } : null;
  let buildFile = null;

  if (!pinned) {
    buildFile = findBuildFile(projectDir);
    if (!buildFile) {
      return {
        status: "unknown",
        version: null,
        line: null,
        coordinate: null,
        buildFile: null,
        skillPack: null,
        availablePacks,
        message:
          `no ${BUILD_FILES.join(" / ")} found at or above ${path.resolve(projectDir)}. ` +
          "Point --project-dir at the Java project, or pass --version to state the pin directly.",
      };
    }
    pinned = readPinnedVersion(buildFile);
    if (!pinned) {
      return {
        status: "unknown",
        version: null,
        line: null,
        coordinate: null,
        buildFile,
        skillPack: null,
        availablePacks,
        message:
          `${buildFile} declares no GraphCompose dependency ` +
          `(${MAVEN_GROUP}:${MAVEN_ARTIFACT} or ${JITPACK_GROUP}:${JITPACK_ARTIFACT}).`,
      };
    }
  }

  const line = versionLine(pinned.version);
  const match = line ? packs.find((pack) => pack.line === line) : undefined;

  if (!match) {
    return {
      status: "unsupported",
      version: pinned.version,
      line,
      coordinate: pinned.coordinate,
      buildFile,
      skillPack: null,
      availablePacks,
      message:
        `GraphCompose ${pinned.version} has no skill pack. Packs on disk: ` +
        `${availablePacks.join(", ") || "(none)"}. Authoring against a pack from a different ` +
        "line would emit calls that do not exist in the pinned version, so this is a stop, not a fallback.",
    };
  }

  return {
    status: "supported",
    version: pinned.version,
    line,
    coordinate: pinned.coordinate,
    buildFile,
    skillPack: match.path,
    availablePacks,
  };
}
