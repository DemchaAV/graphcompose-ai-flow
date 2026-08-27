#!/usr/bin/env node
/**
 * scripts/lib/observation-store.mjs — where a run's findings about GraphCompose
 * are kept, and where they are emphatically not kept.
 *
 * ## The failure
 *
 * A run measured a layout behaviour the pack did not know about, wrote the
 * observation up properly — probe, both versions, workaround — and saved it to
 * `~/.claude/plugins/cache/graphcompose/graphcompose-flow/0.14.0/observations/`.
 * That is where `observations.mjs` reads from, so nothing looked wrong. It is
 * also the installed payload of one plugin version: the next release lands in a
 * `0.15.0` directory beside it, and the finding is gone. It had happened
 * already — `timeline-cannot-place-marker-or-date`, recorded during an 0.12.0
 * run, exists in the 0.12.0 cache and nowhere else.
 *
 * The install tree is knowledge that *ships*: read-only, replaced wholesale on
 * upgrade. What a run learns belongs to the user's workspace, which survives.
 *
 * ## The two tiers
 *
 *   workspace  <workspace>/observations/graphcompose-<line>/  what runs here learned
 *   install    <install>/observations/graphcompose-<line>/    what the pack shipped
 *
 * Reads merge both, workspace first — a local measurement of this machine's
 * build outranks a shipped record about someone else's. Writes only ever go to
 * the workspace, and this module refuses the install tree by path rather than
 * by convention, because convention is exactly what failed.
 */

import fs from "node:fs";
import path from "node:path";

import { versionLine } from "./version-resolver.mjs";

export const OBSERVATIONS_DIR = "observations";

/** What a record must carry to be one. Mirrors schemas/observation.schema.json. */
const REQUIRED = Object.freeze([
  "schemaVersion",
  "id",
  "graphComposeVersion",
  "observedBehaviour",
  "minimalReproduction",
  "confidence",
]);

export class ObservationStoreError extends Error {
  constructor(message) {
    super(`[observations] ${message}`);
    this.name = "ObservationStoreError";
  }
}

/**
 * The roots to read from, most authoritative first.
 *
 * @param {{ workspace?: { root: string, manifestPath: string|null }|null, install: string }} options
 * @returns {Array<{ origin: "workspace"|"install", root: string, writable: boolean }>}
 */
export function observationRoots({ workspace = null, install }) {
  const roots = [];
  const installRootDir = path.join(install, OBSERVATIONS_DIR);

  if (workspace?.manifestPath) {
    const workspaceRoot = path.join(workspace.root, OBSERVATIONS_DIR);
    // A workspace that IS the install (development mode inside a clone) would
    // otherwise list the same directory twice and call half of it writable.
    if (path.resolve(workspaceRoot) !== path.resolve(installRootDir)) {
      roots.push({ origin: "workspace", root: workspaceRoot, writable: true });
    }
  }
  roots.push({ origin: "install", root: installRootDir, writable: false });
  return roots;
}

/**
 * Every observation visible from here, workspace records shadowing shipped ones
 * of the same id.
 *
 * @param {{ workspace?: object|null, install: string, version?: string|null }} options
 * @returns {Array<{ line: string, file: string, origin: string, shadows: string|null, body: object }>}
 */
export function loadObservations({ workspace = null, install, version = null }) {
  const byId = new Map();

  for (const { origin, root } of observationRoots({ workspace, install })) {
    if (!fs.existsSync(root)) continue;
    const lines = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("graphcompose-"))
      .map((entry) => entry.name.replace("graphcompose-", ""))
      .filter((line) => !version || line === version);

    for (const line of lines) {
      const dir = path.join(root, `graphcompose-${line}`);
      for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".json"))) {
        const full = path.join(dir, file);
        let body;
        try {
          body = JSON.parse(fs.readFileSync(full, "utf8"));
        } catch (cause) {
          throw new ObservationStoreError(`${full} is not valid JSON: ${cause.message}`);
        }
        const id = body?.id ?? path.basename(file, ".json");
        const existing = byId.get(id);
        if (existing) {
          // Reached the shipped copy of something the workspace also has. Keep
          // the local one and say what it stands in front of, rather than
          // silently presenting one of two disagreeing records.
          existing.shadows = full;
          continue;
        }
        byId.set(id, { line, file: full, origin, shadows: null, body });
      }
    }
  }

  return [...byId.values()].sort((a, b) => String(a.body.id).localeCompare(String(b.body.id)));
}

/**
 * Write an observation into the workspace.
 *
 * @param {{ workspace: object|null, install: string, body: object, force?: boolean }} options
 * @returns {{ file: string, line: string, replaced: boolean }}
 * @throws {ObservationStoreError} when there is nowhere durable to put it, when
 *         the record is not one, or when the target is the install tree
 */
export function recordObservation({ workspace, install, body, force = false }) {
  const missing = REQUIRED.filter((key) => body?.[key] === undefined || body[key] === null);
  if (missing.length > 0) {
    throw new ObservationStoreError(
      `the record is missing ${missing.join(", ")}. schemas/observation.schema.json is the shape; ` +
        "a finding with no minimalReproduction is a memory, not an observation.",
    );
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(body.id))) {
    throw new ObservationStoreError(`id must be kebab-case: got ${JSON.stringify(body.id)}`);
  }

  const line = versionLine(body.graphComposeVersion);
  if (!line) {
    throw new ObservationStoreError(
      `graphComposeVersion ${JSON.stringify(body.graphComposeVersion)} has no major.minor line`,
    );
  }

  if (!workspace?.manifestPath) {
    throw new ObservationStoreError(
      "there is no workspace to record this in. Do not fall back to the install tree: it is one " +
        "plugin version's payload, replaced wholesale on upgrade, and a finding written there is " +
        "lost at the next release. Run init-workspace first, or pass --root.",
    );
  }

  const dir = path.join(workspace.root, OBSERVATIONS_DIR, `graphcompose-${line}`);
  const resolvedInstall = path.resolve(install);
  if (path.resolve(dir).startsWith(`${resolvedInstall}${path.sep}`)) {
    throw new ObservationStoreError(
      `refusing to write into the install tree (${resolvedInstall}). That tree ships with the ` +
        "plugin and is replaced on upgrade; observations written there do not survive it.",
    );
  }

  const file = path.join(dir, `${body.id}.json`);
  const replaced = fs.existsSync(file);
  if (replaced && !force) {
    throw new ObservationStoreError(
      `${body.id} already exists in this workspace (${file}). Pass --force to replace it, or ` +
        "record the new measurement in its verifiedAgainst[] instead — a second file for the same " +
        "behaviour is how two records start disagreeing.",
    );
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`, "utf8");
  return { file, line, replaced };
}

/**
 * Append what a probe just measured to the record it was measuring.
 *
 * <p>`verifiedAgainst[]` existed and nothing wrote it: the field that says
 * which builds a record has actually been tested on could only be filled in by
 * hand, so it was empty on every record while `show` gated on it. This is the
 * writer. A shipped record cannot be edited in place — the install tree is
 * replaced on upgrade — so verifying one copies it into the workspace, where
 * the copy then stands in front of the original.</p>
 *
 * @param {{ workspace: object|null, install: string,
 *           subject: { body: object, file: string, origin: string },
 *           entry: { version: string, on: string, verdict: "held"|"changed", note?: string } }} options
 * @returns {{ file: string, copied: boolean }}
 */
export function recordVerification({ workspace, install, subject, entry }) {
  const body = {
    ...subject.body,
    // Newest first: a reader deciding whether to trust this wants the most
    // recent build it was measured on, not the first.
    verifiedAgainst: [
      entry,
      ...(subject.body.verifiedAgainst ?? []).filter((v) => v.version !== entry.version),
    ],
  };

  if (subject.origin === "workspace") {
    fs.writeFileSync(subject.file, `${JSON.stringify(body, null, 2)}\n`, "utf8");
    return { file: subject.file, copied: false };
  }

  const written = recordObservation({ workspace, install, body, force: true });
  return { file: written.file, copied: true };
}
