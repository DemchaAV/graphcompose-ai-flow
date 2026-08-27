#!/usr/bin/env node
/**
 * scripts/test/resolved-version.test.mjs — the record that makes one run agree
 * with itself about which GraphCompose build it is against.
 *
 * The case behind every test here: a run pinned `2.2.1-SNAPSHOT`, measured the
 * engine against whatever jar carried that name, and wrote the result down as a
 * property of the released line. Two facts had to become impossible to miss —
 * that a SNAPSHOT names no single build, and that accepting one is a decision
 * with a reason attached rather than a default.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  acceptBuild,
  acceptanceHolds,
  buildIdentity,
  readResolvedVersion,
  resolvedVersionPath,
  writeResolvedVersion,
} from "../lib/resolved-version.mjs";

function tempWorkspace(label) {
  const host = fs.mkdtempSync(path.join(os.tmpdir(), `gcrv-${label}-`));
  const root = path.join(host, "graphcompose-flow");
  fs.mkdirSync(root, { recursive: true });
  const manifestPath = path.join(root, "flow.config.json");
  fs.writeFileSync(manifestPath, JSON.stringify({ schemaVersion: 1 }), "utf8");
  process.on("exit", () => {
    try {
      fs.rmSync(host, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
  return { root, manifestPath, manifest: { schemaVersion: 1 } };
}

/** A resolveVersion result, with the artifact shape the record stores. */
function resolvedFor(version, { mutable = version.endsWith("-SNAPSHOT"), jar = true } = {}) {
  return {
    status: "supported",
    version,
    line: "2.2",
    coordinate: "io.github.demchaav:graph-compose",
    skillPack: "skills/versions/graphcompose-2.2",
    buildFile: "C:/project/pom.xml",
    artifact: {
      coordinate: "io.github.demchaav:graph-compose",
      version,
      jar: jar ? { path: `/repo/${version}.jar`, bytes: 4108, modified: "2026-08-26T18:00:55.245Z" } : null,
      sha1: null,
      mutable,
      origin: jar ? "local-install" : null,
      installed: [version],
      supersededBy: mutable ? ["2.2.2"] : [],
      identifiesOneBuild: !mutable,
      message: null,
    },
  };
}

test("a release pin is identified and asks nothing", () => {
  const identity = buildIdentity(resolvedFor("2.2.2"));
  assert.equal(identity.identified, true);
  assert.equal(identity.accepted, false);
  assert.equal(identity.reason, null);
});

test("a SNAPSHOT pin is not identified, and says why in the reason", () => {
  const identity = buildIdentity(resolvedFor("2.2.1-SNAPSHOT"));
  assert.equal(identity.identified, false);
  assert.equal(identity.accepted, false);
  assert.match(identity.reason, /which release it leads up to/);
});

test("an acceptance holds for the jar it was written for, and not past it", () => {
  const artifact = resolvedFor("2.2.1-SNAPSHOT").artifact;
  const accepted = {
    version: "2.2.1-SNAPSHOT",
    sha1: null,
    jar: { ...artifact.jar },
    decision: "the dependency-refresh tree's install, deliberately",
    at: "2026-08-27T12:00:00.000Z",
  };

  assert.equal(acceptanceHolds(accepted, artifact), true);

  // Same name, rebuilt: the question is open again.
  const rebuilt = { ...artifact, jar: { ...artifact.jar, modified: "2026-08-27T09:00:00.000Z" } };
  assert.equal(acceptanceHolds(accepted, rebuilt), false, "a rebuild kept an old acceptance alive");

  // Same jar, different name: never transfers.
  assert.equal(acceptanceHolds({ ...accepted, version: "2.2.2" }, artifact), false);
});

test("the record is written where the workspace can find it, and read back whole", () => {
  const workspace = tempWorkspace("write");
  const written = writeResolvedVersion(workspace, {
    resolved: resolvedFor("2.2.2"),
    pins: { agree: true, distinct: ["2.2.2"], pins: [], message: null },
    // The real jar is not on the machine running this test; skip hashing so the
    // stored artifact is the one the fixture describes.
    hash: false,
  });

  assert.equal(written.version, "2.2.2");
  assert.equal(written.accepted, null);
  assert.ok(fs.existsSync(resolvedVersionPath(workspace)));
  assert.deepEqual(readResolvedVersion(workspace), written);
});

test("development mode writes no record: the workspace is the harness checkout", () => {
  // manifestPath null is install mode. Writing there would put one machine's
  // local repository into the tree everyone else clones.
  const written = writeResolvedVersion(
    { root: os.tmpdir(), manifestPath: null },
    { resolved: resolvedFor("2.2.2"), hash: false },
  );
  assert.equal(written, null);
});

test("re-resolving keeps an acceptance that still applies and drops one that does not", () => {
  const workspace = tempWorkspace("reresolve");
  const resolved = resolvedFor("2.2.1-SNAPSHOT");

  writeResolvedVersion(workspace, { resolved, hash: false });
  const record = readResolvedVersion(workspace);
  record.accepted = {
    version: "2.2.1-SNAPSHOT",
    sha1: null,
    jar: { ...resolved.artifact.jar },
    decision: "the dependency-refresh tree's install, measured deliberately",
    at: "2026-08-27T12:00:00.000Z",
  };
  fs.writeFileSync(resolvedVersionPath(workspace), JSON.stringify(record), "utf8");

  const again = writeResolvedVersion(workspace, { resolved, hash: false });
  assert.ok(again.accepted, "an acceptance for the same jar was dropped");

  const rebuilt = resolvedFor("2.2.1-SNAPSHOT");
  rebuilt.artifact.jar.modified = "2026-08-27T09:00:00.000Z";
  const afterRebuild = writeResolvedVersion(workspace, { resolved: rebuilt, hash: false });
  assert.equal(afterRebuild.accepted, null, "a rebuilt snapshot kept its old acceptance");
});

test("accepting a build needs a decision long enough to be one", () => {
  const workspace = tempWorkspace("decision");
  assert.throws(
    () => acceptBuild(workspace, { decision: "fine", resolved: resolvedFor("2.2.1-SNAPSHOT") }),
    /needs --decision/,
  );
});

test("there is no workspace to record a decision in until one exists", () => {
  assert.throws(
    () =>
      acceptBuild(
        { root: os.tmpdir(), manifestPath: null },
        { decision: "a reason long enough to count as one", resolved: resolvedFor("2.2.2") },
      ),
    /no workspace/,
  );
});
