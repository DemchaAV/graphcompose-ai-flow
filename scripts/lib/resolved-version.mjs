#!/usr/bin/env node
/**
 * scripts/lib/resolved-version.mjs — the one place a run's GraphCompose version
 * is written down, and the one place every later step reads it from.
 *
 * Three files used to answer "which version is this work against": the host
 * build file, the workspace manifest, and the project's own
 * `targetGraphComposeVersion`. Nothing compared them, and one run carried
 * `2.2.0` in the manifest and `2.2.1-SNAPSHOT` in the project for its whole
 * ninety minutes. Worse, the answer they all gave was a string, and a string is
 * not a build: the jar behind `2.2.1-SNAPSHOT` was a local `mvn install` that
 * sat in the same repository as released 2.2.1 and 2.2.2, and the engine
 * behaviour measured against it was recorded as a property of the released
 * line.
 *
 * So this records the resolution once, with the build it resolved to, and
 * `accepted` for the case a person deliberately works against a mutable build.
 *
 * <p>The acceptance is bound to the build it was given for — its sha1, or its
 * size and mtime when the jar could not be hashed. Re-installing a snapshot
 * produces a different build under the same name, and an acceptance that
 * survived that would be the silence this whole file exists to remove.</p>
 */

import fs from "node:fs";
import path from "node:path";

import { describeArtifact } from "./version-resolver.mjs";
import { writeJsonAtomic } from "./atomic-write.mjs";

export const RESOLVED_VERSION_FILE = "resolved-version.json";

/** Shortest decision that can carry a reason rather than a shrug. */
export const MIN_DECISION = 20;

/**
 * @param {{ root: string, manifestPath: string|null }} workspace
 * @returns {string} where the record lives for this workspace
 */
export function resolvedVersionPath(workspace) {
  return path.join(workspace.root, RESOLVED_VERSION_FILE);
}

/**
 * Does this pin name one build, and did anyone say the alternative is fine?
 *
 * @param {{ artifact?: object|null }} resolved a `resolveVersion` result
 * @param {object|null} [accepted] the acceptance on record, if any
 * @returns {{ identified: boolean, accepted: boolean, reason: string|null }}
 */
export function buildIdentity(resolved, accepted = null) {
  const artifact = resolved?.artifact ?? null;
  if (artifact?.identifiesOneBuild) {
    return { identified: true, accepted: false, reason: null };
  }

  const reason = !artifact
    ? "the version could not be resolved to an artifact at all"
    : `${artifact.version} is a SNAPSHOT: the name says which release it leads up to, not which ` +
      "code is in it";

  return {
    identified: false,
    accepted: acceptanceHolds(accepted, artifact),
    reason,
  };
}

/**
 * An acceptance holds only for the build it was written for. Same name, new
 * bits, and the question is open again — which is the whole point of asking it
 * about a mutable build.
 *
 * @param {object|null} accepted
 * @param {object|null} artifact
 */
export function acceptanceHolds(accepted, artifact) {
  if (!accepted || !artifact) return false;
  if (accepted.version !== artifact.version) return false;
  if (accepted.sha1 && artifact.sha1) return accepted.sha1 === artifact.sha1;
  if (!accepted.jar || !artifact.jar) return false;
  return (
    accepted.jar.bytes === artifact.jar.bytes && accepted.jar.modified === artifact.jar.modified
  );
}

/**
 * Read the record. Returns null when the workspace has none — which is the
 * state every workspace starts in, not an error.
 *
 * @param {{ root: string }} workspace
 * @returns {object|null}
 */
export function readResolvedVersion(workspace) {
  const file = resolvedVersionPath(workspace);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Write the resolution, preserving an acceptance that still applies.
 *
 * @param {{ root: string, manifestPath: string|null }} workspace
 * @param {{ resolved: object, pins?: object|null, hash?: boolean }} options
 * @returns {object|null} the record written, or null when there is no workspace
 *          to write it into
 */
export function writeResolvedVersion(workspace, { resolved, pins = null, hash = true } = {}) {
  // Development mode has no manifest: the "workspace" is the harness checkout
  // itself, and writing a resolution into it would put one machine's local
  // repository into the tree everyone else clones.
  if (!workspace?.manifestPath || !fs.existsSync(workspace.root)) return null;
  if (!resolved?.version) return null;

  // Hash here rather than in every resolveVersion call: this is the record the
  // rest of the run compares against, and a size-and-mtime identity is the one
  // that quietly matches after a rebuild with the same output.
  const artifact = hash
    ? describeArtifact({ coordinate: resolved.coordinate, version: resolved.version, hash: true })
    : (resolved.artifact ?? null);

  const previous = readResolvedVersion(workspace);
  const accepted = acceptanceHolds(previous?.accepted ?? null, artifact)
    ? previous.accepted
    : null;

  const record = {
    schemaVersion: 1,
    resolvedAt: new Date().toISOString(),
    version: resolved.version,
    line: resolved.line ?? null,
    coordinate: resolved.coordinate ?? null,
    skillPack: resolved.skillPack ?? null,
    buildFile: resolved.buildFile ?? null,
    build: artifact,
    // A caller that did not compute pins is not asserting they agree; keep what
    // the last caller that did know recorded.
    pins: pins ?? previous?.pins ?? null,
    accepted,
  };

  writeJsonAtomic(resolvedVersionPath(workspace), record);
  return record;
}

/**
 * Record that a person was shown an unidentified build and chose it anyway.
 *
 * @param {{ root: string, manifestPath: string|null }} workspace
 * @param {{ decision: string, resolved: object }} options
 * @returns {object} the record written
 * @throws {Error} when there is no workspace, no build to accept, or the
 *         decision is too short to be one
 */
export function acceptBuild(workspace, { decision, resolved }) {
  if (!workspace?.manifestPath) {
    throw new Error(
      "no workspace to record the decision in — run init-workspace first, or pass --root",
    );
  }
  const text = String(decision ?? "").trim();
  if (text.length < MIN_DECISION) {
    throw new Error(
      "--accept-build needs --decision: a sentence on which build this is and why it is the " +
        "right one to measure against. An acceptance with no reason is the silence this replaces.",
    );
  }

  const artifact = describeArtifact({
    coordinate: resolved.coordinate,
    version: resolved.version,
    hash: true,
  });
  if (!artifact?.jar) {
    throw new Error(
      `${resolved.version} has no jar in the local repository, so there is no build to accept. ` +
        "Build or fetch it first.",
    );
  }

  const record = writeResolvedVersion(workspace, { resolved, pins: null, hash: true }) ?? {};
  record.accepted = {
    version: artifact.version,
    sha1: artifact.sha1,
    jar: artifact.jar,
    decision: text,
    at: new Date().toISOString(),
  };
  writeJsonAtomic(resolvedVersionPath(workspace), record);
  return record;
}
