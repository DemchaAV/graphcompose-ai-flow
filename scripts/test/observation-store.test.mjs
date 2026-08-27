#!/usr/bin/env node
/**
 * scripts/test/observation-store.test.mjs — where a run's findings are kept.
 *
 * The failure behind every test here: a run wrote a well-formed observation
 * into `~/.claude/plugins/cache/.../0.14.0/observations/`, which is where the
 * reader looks, so nothing appeared wrong. That directory is one plugin
 * version's payload. `timeline-cannot-place-marker-or-date`, recorded during an
 * 0.12.0 run, exists in the 0.12.0 cache and nowhere else — the upgrade took it.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  loadObservations,
  observationRoots,
  recordObservation,
  recordVerification,
} from "../lib/observation-store.mjs";

function tempTree(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcobs-${label}-`));
  process.on("exit", () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
  return dir;
}

function workspaceIn(host) {
  const root = path.join(host, "graphcompose-flow");
  fs.mkdirSync(root, { recursive: true });
  const manifestPath = path.join(root, "flow.config.json");
  fs.writeFileSync(manifestPath, JSON.stringify({ schemaVersion: 1 }), "utf8");
  return { root, manifestPath, manifest: { schemaVersion: 1 } };
}

function observation(overrides = {}) {
  return {
    schemaVersion: 1,
    id: "layered-row-survives-a-row-cell",
    graphComposeVersion: "2.2.2",
    observedBehaviour: "A row wrapped in a LayerStack layer lays out horizontally in a row cell.",
    minimalReproduction: { probe: "column-nesting", command: "node scripts/probe.mjs column-nesting" },
    confidence: "confirmed",
    ...overrides,
  };
}

function writeInto(root, line, body) {
  const dir = path.join(root, "observations", `graphcompose-${line}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${body.id}.json`), JSON.stringify(body), "utf8");
}

test("the workspace is read before the pack, and only the workspace is writable", () => {
  const host = tempTree("roots");
  const install = tempTree("install");
  const roots = observationRoots({ workspace: workspaceIn(host), install });

  assert.deepEqual(roots.map((r) => r.origin), ["workspace", "install"]);
  assert.deepEqual(roots.map((r) => r.writable), [true, false]);
});

test("development mode has one root, and it is the shipped one", () => {
  const install = tempTree("install-only");
  const roots = observationRoots({ workspace: { root: install, manifestPath: null }, install });

  assert.deepEqual(roots.map((r) => r.origin), ["install"]);
});

test("a workspace record stands in front of the shipped one it shares an id with", () => {
  const host = tempTree("shadow");
  const install = tempTree("shadow-install");
  const workspace = workspaceIn(host);

  writeInto(install, "2.2", observation({ observedBehaviour: "What the pack shipped." }));
  writeInto(workspace.root, "2.2", observation({ observedBehaviour: "What this machine measured." }));

  const all = loadObservations({ workspace, install });
  assert.equal(all.length, 1, "the same id came back twice");
  assert.equal(all[0].origin, "workspace");
  assert.match(all[0].body.observedBehaviour, /this machine measured/);
  assert.ok(all[0].shadows, "the shipped copy it hides was not named");
});

test("recording goes to the workspace and comes back as learned here", () => {
  const host = tempTree("record");
  const install = tempTree("record-install");
  const workspace = workspaceIn(host);

  const written = recordObservation({ workspace, install, body: observation() });

  assert.equal(written.line, "2.2");
  assert.equal(written.replaced, false);
  assert.ok(written.file.startsWith(workspace.root), "written outside the workspace");
  assert.equal(loadObservations({ workspace, install })[0].origin, "workspace");
});

test("with no workspace it refuses rather than falling back to the install tree", () => {
  const install = tempTree("no-workspace");
  assert.throws(
    () =>
      recordObservation({
        workspace: { root: install, manifestPath: null },
        install,
        body: observation(),
      }),
    /replaced wholesale on upgrade/,
  );
});

test("a workspace inside the install tree is refused by path, not by convention", () => {
  // The exact shape of the failure: a "workspace" that is really the installed
  // payload. Convention is what let the original write through.
  const install = tempTree("inside");
  const workspace = workspaceIn(path.join(install, "nested"));

  assert.throws(
    () => recordObservation({ workspace, install, body: observation() }),
    /refusing to write into the install tree/,
  );
});

test("a finding with no reproduction is a memory, and is refused as one", () => {
  const host = tempTree("incomplete");
  const install = tempTree("incomplete-install");
  const workspace = workspaceIn(host);
  const body = observation();
  delete body.minimalReproduction;

  assert.throws(
    () => recordObservation({ workspace, install, body }),
    /missing minimalReproduction/,
  );
});

test("the same id twice needs --force, because two records disagree eventually", () => {
  const host = tempTree("duplicate");
  const install = tempTree("duplicate-install");
  const workspace = workspaceIn(host);

  recordObservation({ workspace, install, body: observation() });
  assert.throws(
    () => recordObservation({ workspace, install, body: observation() }),
    /already exists in this workspace/,
  );

  const forced = recordObservation({ workspace, install, body: observation(), force: true });
  assert.equal(forced.replaced, true);
});

test("a verdict lands in verifiedAgainst, newest first, one entry per build", () => {
  // The field shipped a release ago and nothing wrote it, so `show` was gating
  // on a list that was empty on every record.
  const host = tempTree("verified");
  const install = tempTree("verified-install");
  const workspace = workspaceIn(host);
  recordObservation({ workspace, install, body: observation() });

  const first = loadObservations({ workspace, install })[0];
  recordVerification({
    workspace,
    install,
    subject: first,
    entry: { version: "2.2.2", on: "2026-08-27", verdict: "held" },
  });

  const again = loadObservations({ workspace, install })[0];
  recordVerification({
    workspace,
    install,
    subject: again,
    entry: { version: "2.2.2", on: "2026-08-28", verdict: "changed", note: "the escape is gone" },
  });

  const [record] = loadObservations({ workspace, install });
  assert.equal(record.body.verifiedAgainst.length, 1, "the same build was filed twice");
  assert.equal(record.body.verifiedAgainst[0].verdict, "changed");
  assert.equal(record.body.verifiedAgainst[0].on, "2026-08-28");
});

test("verifying a shipped record copies it into the workspace rather than editing the pack", () => {
  const host = tempTree("verify-shipped");
  const install = tempTree("verify-shipped-install");
  const workspace = workspaceIn(host);
  writeInto(install, "2.2", observation());

  const shipped = loadObservations({ workspace, install })[0];
  assert.equal(shipped.origin, "install");

  const written = recordVerification({
    workspace,
    install,
    subject: shipped,
    entry: { version: "2.2.2", on: "2026-08-27", verdict: "held" },
  });

  assert.equal(written.copied, true);
  assert.ok(written.file.startsWith(workspace.root));
  // The pack's own copy is untouched: it is replaced on upgrade either way.
  const original = JSON.parse(
    fs.readFileSync(
      path.join(install, "observations", "graphcompose-2.2", `${observation().id}.json`),
      "utf8",
    ),
  );
  assert.equal(original.verifiedAgainst, undefined);
});

test("an install tree that is a checkout is the canonical store, and writable", () => {
  // The harness's own clone: observations/ there is tracked in git and shipped
  // to everyone, so the maintainer recording into it is the point. A plugin
  // cache has no .git, and nothing else on disk tells the two apart.
  const install = tempTree("checkout");
  fs.mkdirSync(path.join(install, ".git"), { recursive: true });

  const written = recordObservation({
    workspace: { root: install, manifestPath: null },
    install,
    body: observation(),
  });

  assert.ok(written.file.startsWith(install));
  assert.equal(observationRoots({ workspace: null, install })[0].writable, true);
});

test("verifying a record in a checkout updates it in place, and says so", () => {
  const install = tempTree("checkout-verify");
  fs.mkdirSync(path.join(install, ".git"), { recursive: true });
  writeInto(install, "2.2", observation());

  const workspace = { root: install, manifestPath: null };
  const subject = loadObservations({ workspace, install })[0];
  const written = recordVerification({
    workspace,
    install,
    subject,
    entry: { version: "2.2.2", on: "2026-08-27", verdict: "held" },
  });

  assert.equal(written.copied, false, "an in-place update was reported as a copy");
  assert.equal(path.resolve(written.file), path.resolve(subject.file));
});

test("an id that is not kebab-case is refused before it reaches a filename", () => {
  const host = tempTree("id");
  const install = tempTree("id-install");
  assert.throws(
    () =>
      recordObservation({
        workspace: workspaceIn(host),
        install,
        body: observation({ id: "Layered Row" }),
      }),
    /kebab-case/,
  );
});
