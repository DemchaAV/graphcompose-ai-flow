/**
 * scripts/lib/handoff.mjs — the shape of the discovery/authoring boundary.
 *
 * The CLI is `scripts/handoff.mjs`; what a handoff *is* lives here, so a reader
 * — a test, a later phase, another tool — can ask about one without running a
 * command that would exit the process out from under it.
 *
 * A handoff is paths and hashes and nothing else. Copying an artifact's
 * contents in would put the same document into context twice and give the run a
 * second thing that can disagree with the first; the hash is what makes the
 * path trustworthy instead.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { findDataFile } from "./data-spec.mjs";

export const HANDOFF_FILE = "handoff.json";
export const HANDOFF_SCHEMA_VERSION = 1;

/** The phases a handoff can point at. `authoring` is the only boundary today. */
export const NEXT_PHASES = Object.freeze(["authoring"]);

/**
 * Artifact key -> the file it names inside a revision. The data file resolves
 * through the project, because its name is the document kind's — a handoff that
 * invented `doc-data.json` would name a file the renderer never reads.
 */
export function artifactPaths(projectDir, revisionDir, project) {
  const at = (name) => path.join(revisionDir, name);
  return {
    visualAnalysis: at("visual-analysis.json"),
    data: project.render?.dataFileName === null ? null : findDataFile(projectDir, revisionDir),
    assetRequest: at("asset-request.json"),
    assetManifest: at("assets-manifest.json"),
    architecturePlan: at("architecture-plan.json"),
  };
}

/** sha256 of a file, or null when it is not there. Hex, so it survives JSON. */
export function hashFile(file) {
  if (!file) return null;
  try {
    return `sha256:${crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")}`;
  } catch {
    return null;
  }
}

/**
 * Compare a recorded handoff against what is on disk now.
 *
 * The failure this exists to make loud: authoring resumes from a handoff that
 * describes a plan somebody has since changed. Silent staleness is worse than
 * no handoff, because a stale one still looks like durable state.
 *
 * @returns {{fresh: boolean, problems: string[]}}
 */
export function verifyHandoff(handoff, { revisionDir }) {
  const problems = [];
  if (!handoff || typeof handoff !== "object") return { fresh: false, problems: ["no handoff on disk"] };
  if (handoff.schemaVersion !== HANDOFF_SCHEMA_VERSION) {
    problems.push(
      `handoff.schemaVersion ${JSON.stringify(handoff.schemaVersion)} — this reader understands ${HANDOFF_SCHEMA_VERSION}`,
    );
  }
  if (handoff.validated !== true) problems.push("handoff.validated is not true");

  for (const [key, rel] of Object.entries(handoff.artifacts ?? {})) {
    if (rel === null) continue; // a declared absence, e.g. inline data
    const file = path.resolve(revisionDir, handoff.artifactRoot ?? ".", rel);
    if (!fs.existsSync(file)) {
      problems.push(`${key}: ${rel} is gone`);
      continue;
    }
    const now = hashFile(file);
    const then = handoff.hashes?.[key] ?? null;
    if (then === null) problems.push(`${key}: no hash was recorded`);
    else if (now !== then) problems.push(`${key}: ${rel} changed since the handoff was written`);
  }
  return { fresh: problems.length === 0, problems };
}

/**
 * The five states of the boundary, which are five different things.
 *
 * Three real runs wrote a correct, verifiable handoff and then authored in the
 * coordinator anyway. Every report said "handoff written" and every one of them
 * was true; none of them said the boundary had not been crossed, because
 * nothing distinguished the two. So the states are named, and the one that
 * matters — `taken` — is the only one that requires evidence from the far side.
 *
 *   written    handoff.json exists and the barrier passed when it was made
 *   requested  the coordinator declared it is about to cross
 *   available  this host can create a second context at all
 *   taken      a DIFFERENT context claimed the handoff and authored from it
 *   claimedBy  who that was, so "taken" is attributable rather than asserted
 *
 * `written` is never evidence of `taken`. That confusion is the whole reason
 * this exists.
 */
export const BOUNDARY_STATES = Object.freeze(["written", "requested", "available", "taken"]);

/**
 * Read the boundary block off a handoff, with every state defaulting to the
 * pessimistic answer. An absent block means nothing was recorded, which is
 * reported as not-taken rather than unknown: a boundary nobody claimed did not
 * happen, and reporting it as indeterminate is how "written" came to be read as
 * "taken" in the first place.
 */
export function boundaryState(handoff) {
  const b = handoff?.boundary ?? null;
  const crossings = Array.isArray(b?.crossings) ? b.crossings : [];
  const fingerprint = handoffFingerprint(handoff);
  // A crossing belongs to the handoff generation it names. Rewriting the
  // handoff starts a new generation, so `taken` goes back to false — the claim
  // described artifacts that have since moved. What must NOT happen is the
  // crossing disappearing: `everCrossed` is the record that survives.
  const current = crossings.filter((c) => c?.handoffHash === fingerprint);
  const latest = crossings.length ? crossings[crossings.length - 1] : null;
  return {
    written: Boolean(handoff?.validated),
    requested: Boolean(b?.requested),
    available: b?.mechanismAvailable ?? null,
    mechanism: b?.mechanism ?? null,
    taken: current.length > 0,
    claimedBy: current.length ? current[current.length - 1].claimedBy : null,
    claimedAt: current.length ? current[current.length - 1].at : null,
    requestedAt: b?.requestedAt ?? null,
    handoffHash: fingerprint,
    everCrossed: crossings.length > 0,
    crossings,
    latestCrossing: latest,
  };
}

/**
 * A stable id for one handoff generation: the artifact hashes it recorded.
 *
 * Not `validatedAt` — two writes a second apart with identical artifacts are
 * the same state and should not read as two generations. Not the whole
 * document either, because the boundary block itself changes as the crossing
 * is recorded, and a fingerprint that moved when a claim was written could
 * never match the claim it just recorded.
 */
export function handoffFingerprint(handoff) {
  const hashes = handoff?.hashes ?? null;
  if (!hashes || typeof hashes !== "object") return null;
  const canonical = Object.keys(hashes)
    .sort()
    .map((k) => `${k}=${hashes[k] ?? "-"}`)
    .join("\n");
  return `sha256:${crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 32)}`;
}

/**
 * Add a crossing without ever losing one, and without inventing one.
 *
 * Append-only by construction: a claim on a generation that already has one
 * replaces nothing and adds nothing, so repeated claims are idempotent and a
 * re-run cannot inflate the history.
 */
export function recordCrossing(handoff, { claimedBy, fromSession = null, toSession = null, verified = true }) {
  const fingerprint = handoffFingerprint(handoff);
  const boundary = { ...(handoff.boundary ?? {}) };
  const crossings = Array.isArray(boundary.crossings) ? [...boundary.crossings] : [];
  const already = crossings.some((c) => c?.handoffHash === fingerprint && c?.claimedBy === claimedBy);
  if (!already) {
    crossings.push({
      at: new Date().toISOString(),
      claimedBy,
      handoffHash: fingerprint,
      fromSession,
      toSession,
      verified,
    });
  }
  boundary.crossings = crossings;
  return { ...handoff, boundary };
}

/** One line a human or a report can read without interpreting a JSON blob. */
export function describeBoundary(state) {
  if (state.taken) {
    return `boundary TAKEN — claimed by ${state.claimedBy ?? "(unattributed)"} at ${state.claimedAt}`;
  }
  // The case that produced a false negative on a run where the boundary
  // demonstrably fired: the handoff was rewritten after the crossing, so the
  // current generation has no claim — but one happened, and saying so is the
  // difference between "not crossed" and "crossed, then the state moved on".
  if (state.everCrossed) {
    const last = state.latestCrossing;
    return (
      `boundary was CROSSED by ${last?.claimedBy ?? "(unattributed)"} at ${last?.at}, ` +
      "and the handoff has been rewritten since — the claim describes an earlier artifact set"
    );
  }
  if (state.requested) {
    return "boundary REQUESTED but never claimed — authoring did not run in a fresh context";
  }
  return "boundary NOT requested — the handoff was written and the coordinator carried on";
}

/** The lines `show` and `write` print for a handoff's artifact table. */
export function describeArtifacts(doc) {
  const lines = [];
  for (const [key, rel] of Object.entries(doc.artifacts ?? {})) {
    const hash = doc.hashes?.[key];
    lines.push(
      rel === null
        ? `  ${key.padEnd(18)} (none — declared absent)`
        : `  ${key.padEnd(18)} ${rel.padEnd(28)} ${hash ? hash.slice(7, 19) : "?"}`,
    );
  }
  return lines.join("\n");
}
