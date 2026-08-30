#!/usr/bin/env node
/**
 * scripts/test/limitations.test.mjs — what a project has decided not to fix.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  acceptLimitation,
  coveringLimitation,
  LimitationError,
  readAll,
  readLimitations,
  retireLimitation,
} from "../lib/limitations.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(repoRoot, "scripts", "limitations.mjs");

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gclim-${label}-`));
  process.on("exit", () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
  return dir;
}

const REASON = "the reference sets its headings in Google Sans, which is not distributable; Lato is the nearest bundled family";

test("accepting records who decided and what it covers; reading returns only active entries", () => {
  const dir = tempDir("accept");
  const record = acceptLimitation(dir, {
    id: "heading-face",
    reason: REASON,
    decidedBy: "user",
    cause: "TYPOGRAPHY",
    mismatchIds: ["substituted-typeface", "substituted-typeface"],
    regions: ["masthead"],
    quote: "оставь Lato",
  });
  assert.equal(record.decidedBy, "user");
  assert.deepEqual(record.mismatchIds, ["substituted-typeface"]);
  assert.deepEqual(record.regions, ["masthead"]);
  assert.equal(readLimitations(dir).length, 1);

  retireLimitation(dir, "heading-face", "Google Sans arrived as a TTF in assets/fonts on 2026-09-01");
  assert.equal(readLimitations(dir).length, 0, "a retired limitation stops applying");
  assert.equal(readAll(dir).length, 1, "but stays on the record");
});

test("a thin reason, a bad id, or a cause the harness may not decide are refused", () => {
  const dir = tempDir("refuse");
  assert.throws(
    () => acceptLimitation(dir, { id: "x", reason: "ok", decidedBy: "user", mismatchIds: ["a"] }),
    LimitationError,
  );
  assert.throws(
    () => acceptLimitation(dir, { id: "Not Kebab", reason: REASON, decidedBy: "user", mismatchIds: ["a"] }),
    LimitationError,
  );
  assert.throws(
    () =>
      acceptLimitation(dir, {
        id: "sidebar-width",
        reason: REASON,
        decidedBy: "harness",
        cause: "GEOMETRY",
        mismatchIds: ["sidebar-width"],
      }),
    /a person's decision/,
  );
  assert.throws(
    () => acceptLimitation(dir, { id: "nothing", reason: REASON, decidedBy: "user" }),
    /at least one mismatch id/,
  );
  // The harness may accept a typeface on a measurement.
  const ok = acceptLimitation(dir, {
    id: "body-face",
    reason: REASON,
    decidedBy: "harness",
    cause: "TYPOGRAPHY",
    regions: ["body"],
    measured: { tool: "typography.mjs match", winner: "LATO", gap: 0.11 },
  });
  assert.equal(ok.decidedBy, "harness");
});

test("coverage is by mismatch id, by root cause, or by region + cause — never by cause alone", () => {
  const limitations = [
    {
      id: "heading-face",
      cause: "TYPOGRAPHY",
      mismatchIds: ["substituted-typeface"],
      regions: ["masthead"],
      retiredAt: null,
    },
  ];
  assert.ok(coveringLimitation(limitations, { id: "substituted-typeface" }));
  assert.ok(coveringLimitation(limitations, { id: "heading-wraps", rootCause: "substituted-typeface" }));
  assert.ok(coveringLimitation(limitations, { id: "masthead-glyphs", region: "masthead", cause: "TYPOGRAPHY" }));
  assert.equal(coveringLimitation(limitations, { id: "body-glyphs", region: "body", cause: "TYPOGRAPHY" }), null);
  assert.equal(coveringLimitation(limitations, { id: "masthead-offset", region: "masthead", cause: "GEOMETRY" }), null);
  assert.equal(coveringLimitation([], { id: "substituted-typeface" }), null);
  assert.equal(
    coveringLimitation([{ ...limitations[0], retiredAt: "2026-09-01T00:00:00Z" }], { id: "substituted-typeface" }),
    null,
  );
});

test("the CLI accepts, lists, answers covers with an exit code, and refuses with 4", () => {
  const host = tempDir("cli");
  const root = path.join(host, "graphcompose-flow");
  const project = path.join(root, "projects", "demo");
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(path.join(root, "flow.config.json"), JSON.stringify({ schemaVersion: 1 }));
  fs.writeFileSync(path.join(project, "template-project.json"), JSON.stringify({ projectName: "demo", schemaVersion: 1 }));

  const run = (args) => spawnSync(process.execPath, [CLI, ...args, "--project", "demo", "--root", root], { encoding: "utf8" });

  const refused = run(["accept", "heading-face", "--reason", "meh", "--mismatch", "substituted-typeface"]);
  assert.equal(refused.status, 4, refused.stderr);

  const accepted = run(["accept", "heading-face", "--reason", REASON, "--mismatch", "substituted-typeface", "--quote", "оставь"]);
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.match(accepted.stdout, /route around substituted-typeface/);

  const listed = run(["list", "--json"]);
  assert.equal(listed.status, 0);
  assert.equal(JSON.parse(listed.stdout).limitations[0].quote, "оставь");

  assert.equal(run(["covers", "--mismatch", "substituted-typeface"]).status, 0);
  assert.equal(run(["covers", "--mismatch", "page-number-low"]).status, 1);

  const retired = run(["retire", "heading-face", "--note", "the face was added as a TTF under assets/fonts"]);
  assert.equal(retired.status, 0, retired.stderr);
  assert.equal(run(["covers", "--mismatch", "substituted-typeface"]).status, 1);
});
