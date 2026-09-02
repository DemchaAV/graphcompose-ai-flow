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

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
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

  // Search the real dependencies first. A <dependencyManagement> block states
  // what a version WOULD be if a module asked for it, and it routinely pins an
  // older line than the module actually uses — taking the first match in the
  // file would silently hand back that older line. Comments go too: a
  // commented-out dependency is not a dependency.
  const withoutComments = xml.replace(/<!--[\s\S]*?-->/g, "");
  const declared = withoutComments.replace(
    /<dependencyManagement>[\s\S]*?<\/dependencyManagement>/g,
    "",
  );

  // Managed-only is still an answer, just a weaker one, so it is the fallback.
  for (const scope of [declared, withoutComments]) {
    const found = findCoordinate(scope, properties);
    if (found) return found;
  }
  return null;
}

/**
 * @returns {{ version: string, coordinate: string }
 *          | { version: null, coordinate: string, unresolvedProperty: string }
 *          | null}
 */
function findCoordinate(xml, properties) {
  for (const [group, artifact] of [
    [MAVEN_GROUP, MAVEN_ARTIFACT],
    [JITPACK_GROUP, JITPACK_ARTIFACT],
  ]) {
    // Dependency blocks put the three tags in any order in principle, but in
    // practice groupId precedes artifactId precedes version; match that and
    // tolerate whitespace between them.
    const pattern = new RegExp(
      `<groupId>\\s*${escape(group)}\\s*</groupId>[\\s\\S]{0,400}?` +
        `<artifactId>\\s*${escape(artifact)}\\s*</artifactId>[\\s\\S]{0,400}?` +
        `<version>\\s*([^<]+?)\\s*</version>`,
    );
    const hit = pattern.exec(xml);
    if (!hit) continue;

    const raw = hit[1].trim();
    const resolved = resolveProperty(raw, properties);
    if (resolved) return { version: resolved, coordinate: `${group}:${artifact}` };

    // The coordinate IS declared; only its version is a property this file does
    // not define — normally because a parent pom does. Saying "no GraphCompose
    // dependency" here would send the reader to the wrong file entirely.
    return { version: null, coordinate: `${group}:${artifact}`, unresolvedProperty: raw };
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
export function packHasAllowList(install, line) {
  const dir = path.join(install, "skills", "versions", `graphcompose-${line}`);
  return fs.existsSync(path.join(dir, "api-surface.json")) || fs.existsSync(path.join(dir, "00-api-surface.md"));
}

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

/**
 * Order two major.minor lines numerically: 2.10 is newer than 2.9.
 *
 * Exported because it kept being rewritten. Nine copies existed at one point,
 * and three of them sorted by `Number("2.10")` — which is 2.1 — so on the day a
 * 2.10 pack was imported, bundle-consistency would have checked one pack and
 * knowledge-drift another, and `npm run verify` would have been green over two
 * different "newest" lines. One function, asked by every enumerator.
 *
 * @param {string} a  a line such as "2.3"
 * @param {string} b
 * @returns {number} negative when a is older, positive when newer, 0 when equal
 */
export function compareLines(a, b) {
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
    if (pinned.version === null) {
      return {
        status: "unknown",
        version: null,
        line: null,
        coordinate: pinned.coordinate,
        buildFile,
        skillPack: null,
        availablePacks,
        message:
          `${buildFile} declares ${pinned.coordinate}, but its version is ` +
          `${pinned.unresolvedProperty} and this file does not define that property — ` +
          "a parent pom usually does. Pass --version <x.y.z> with the effective version, " +
          "or run `mvn help:evaluate -Dexpression=" +
          `${pinned.unresolvedProperty.replace(/^\$\{|\}$/g, "")}` +
          "` to read it.",
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
      artifact: describeArtifact({ coordinate: pinned.coordinate, version: pinned.version }),
      message:
        `GraphCompose ${pinned.version} has no skill pack. Packs on disk: ` +
        `${availablePacks.join(", ") || "(none)"}. Authoring against a pack from a different ` +
        "line would emit calls that do not exist in the pinned version, so this is a stop, not a fallback.",
    };
  }

  // A pack is not automatically an allow-list. The 1.6 and 1.7 packs are prose
  // only: they were written before the surface was extracted from the jar, and
  // nothing has re-extracted them. Reporting "supported" and stopping there
  // sent an agent to `api-query` — which the workflow requires before writing
  // any call — only for it to dead-end on a file that was never generated.
  const hasAllowList = packHasAllowList(install, match.line);

  return {
    status: "supported",
    version: pinned.version,
    line,
    coordinate: pinned.coordinate,
    buildFile,
    skillPack: match.path,
    availablePacks,
    // What the pin resolves to on this machine. A supported line says the
    // allow-list is right; this says whether the jar behind it is one build or
    // a moving target, which is the half a probe result depends on.
    artifact: describeArtifact({ coordinate: pinned.coordinate, version: pinned.version }),
    hasAllowList,
    ...(hasAllowList
      ? {}
      : {
          message:
            `the ${match.line} pack carries prose but no generated allow-list, so ` +
            "`api-query` cannot answer for this line. Verify every call against the " +
            "pinned jar itself (`javap -classpath <jar> <type>`) before writing it — " +
            "the prose describes the shape of the API, not its exact signatures.",
        }),
  };
}

// ---------------------------------------------------------------- identity ---

/**
 * Where Maven keeps what it downloaded and what `mvn install` put there.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string} absolute path to the local repository
 */
export function localRepositoryRoot(env = process.env) {
  const named = env?.MAVEN_REPO_LOCAL ?? env?.M2_REPO ?? null;
  if (named && named.trim() !== "") return path.resolve(named.trim());
  return path.join(os.homedir(), ".m2", "repository");
}

/**
 * Maven's precedence for two version strings, far enough for the two questions
 * this file has to answer: which of two releases is newer, and whether a
 * SNAPSHOT sits before the release of the same numbers. `2.2.1-SNAPSHOT` is the
 * work leading UP to 2.2.1, so it precedes it — which is the whole point here,
 * because a pin that looks like the newest line can be two releases behind it.
 *
 * @param {string} a
 * @param {string} b
 * @returns {-1|0|1}
 */
export function compareVersions(a, b) {
  const parse = (value) => {
    const [base, ...rest] = String(value).trim().replace(/^v/i, "").split("-");
    return {
      numbers: base.split(".").map((part) => Number.parseInt(part, 10) || 0),
      qualifier: rest.join("-").toUpperCase(),
    };
  };
  const left = parse(a);
  const right = parse(b);

  const width = Math.max(left.numbers.length, right.numbers.length);
  for (let i = 0; i < width; i += 1) {
    const diff = (left.numbers[i] ?? 0) - (right.numbers[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }

  // Same numbers: a release outranks its own SNAPSHOT, and any other qualifier
  // sits between them rather than being ordered against qualifiers it never
  // meets in this project.
  const rank = (qualifier) => (qualifier === "" ? 1 : qualifier === "SNAPSHOT" ? -1 : 0);
  const diff = rank(left.qualifier) - rank(right.qualifier);
  if (diff !== 0) return diff < 0 ? -1 : 1;
  if (left.qualifier === right.qualifier) return 0;
  return left.qualifier < right.qualifier ? -1 : 1;
}

/**
 * Which build does this pin actually name?
 *
 * <p>Resolution used to stop at the string, and a string is not a build. One
 * run pinned `2.2.1-SNAPSHOT`, measured the engine against it, and recorded
 * what it saw as a regression in the released line — while the jar behind that
 * name was a local install from a tree two releases behind, and 2.2.1 and 2.2.2
 * were both sitting in the same repository. Nothing in the chain was wrong
 * except the assumption that a version string identifies code.</p>
 *
 * <p>So this reports the jar: where it is, how big, when it was written, and
 * for a SNAPSHOT the releases already installed that it precedes. It decides
 * nothing — `identifiesOneBuild` is the fact a caller branches on.</p>
 *
 * @param {{ coordinate?: string|null, version: string,
 *           repositoryRoot?: string, hash?: boolean }} options
 * @returns {{ coordinate: string, version: string,
 *             jar: { path: string, bytes: number, modified: string }|null,
 *             sha1: string|null, mutable: boolean, origin: string|null,
 *             installed: string[], supersededBy: string[],
 *             identifiesOneBuild: boolean, message: string|null }|null}
 */
export function describeArtifact({
  coordinate = null,
  version,
  repositoryRoot = localRepositoryRoot(),
  hash = false,
} = {}) {
  if (!version) return null;

  const [group, artifact] = (coordinate ?? `${MAVEN_GROUP}:${MAVEN_ARTIFACT}`).split(":");
  const artifactDir = path.join(repositoryRoot, ...group.split("."), artifact);
  const versionDir = path.join(artifactDir, version);
  const jarPath = path.join(versionDir, `${artifact}-${version}.jar`);
  const mutable = /-SNAPSHOT$/i.test(version);

  let jar = null;
  try {
    const stat = fs.statSync(jarPath);
    jar = { path: jarPath, bytes: stat.size, modified: stat.mtime.toISOString() };
  } catch {
    /* nothing has resolved this pin on this machine */
  }

  let installed = [];
  try {
    installed = fs
      .readdirSync(artifactDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^\d+\./.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => compareVersions(b, a));
  } catch {
    /* no such artifact locally */
  }

  const supersededBy = mutable
    ? installed.filter((other) => !/-SNAPSHOT$/i.test(other) && compareVersions(other, version) > 0)
    : [];

  const origin = jar
    ? fs.existsSync(path.join(versionDir, "maven-metadata-local.xml"))
      ? "local-install"
      : "downloaded"
    : null;

  return {
    coordinate: `${group}:${artifact}`,
    version,
    jar,
    sha1: hash && jar ? sha1OfFile(jarPath) : null,
    mutable,
    origin,
    installed,
    supersededBy,
    // A release coordinate names immutable bits by contract, whether or not
    // Maven has fetched them here yet. A SNAPSHOT never does, however present
    // its jar is — which is the distinction everything downstream branches on.
    identifiesOneBuild: !mutable,
    message: artifactMessage({ version, jar, mutable, origin, supersededBy, repositoryRoot }),
  };
}

function artifactMessage({ version, jar, mutable, origin, supersededBy, repositoryRoot }) {
  if (!jar) {
    return (
      `${version} is not in the local repository (${repositoryRoot}), so nothing has ` +
      "resolved this pin on this machine yet. Build or fetch it before measuring anything " +
      "against it — probe results are only as identified as the jar they ran on."
    );
  }
  if (!mutable) return null;

  const built = origin === "local-install" ? "a local `mvn install`" : "a snapshot download";
  if (supersededBy.length > 0) {
    return (
      `${version} is a SNAPSHOT from ${built}: the name says which release it leads up to, ` +
      `not which code is in it. ${supersededBy.join(", ")} ${supersededBy.length === 1 ? "is" : "are"} ` +
      "already installed alongside it, so this pin sits behind its own line. Anything measured " +
      "here describes that build alone — record the jar's mtime or sha with it, and say which " +
      "release the reader should compare against."
    );
  }
  return (
    `${version} is a SNAPSHOT from ${built}: the same string will name different code tomorrow. ` +
    "Record the jar's mtime or sha alongside anything measured against it."
  );
}

function sha1OfFile(file) {
  try {
    return crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex");
  } catch {
    return null;
  }
}
