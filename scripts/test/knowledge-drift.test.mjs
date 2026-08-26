#!/usr/bin/env node
/**
 * scripts/test/knowledge-drift.test.mjs — a skill cannot go on teaching the
 * hand-built form of a primitive the pinned pack has.
 *
 * The incident: `docs/engine-feedback-noir-corporate-cv.md` said work-experience
 * timelines "currently require bullets plus `LineBuilder.vertical(...)` and
 * margin tuning". True on 1.x. False on 2.2, which has `addTimeline` and a full
 * `TimelineBuilder`. Nothing linked to that document, so nothing corrected it —
 * and an agent grepping `docs/` for "timeline" would have found the wrong
 * answer stated confidently.
 *
 * What matters most here is the *negative* cases. The first version of this
 * checker scanned prose generally and flagged the sentences teaching the
 * closed-set rule itself; a check that cries wolf is a check somebody turns
 * off, so the passages that must stay silent are pinned as hard as the one that
 * must fire.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(repoRoot, "scripts", "check-knowledge-drift.mjs");
function run(root = null) {
  const result = spawnSync(
    process.execPath,
    [CLI, "--json", ...(root ? ["--root", root] : [])],
    { encoding: "utf8", cwd: repoRoot },
  );
  return { status: result.status, report: JSON.parse(result.stdout) };
}

/**
 * Ask the checker about one document, in a tree of its own.
 *
 * An earlier version wrote fixtures into the repository's real `docs/`, which
 * `contracts.test.mjs` walks at the same time — it listed a fixture, the
 * fixture was cleaned up, and an unrelated test failed on a missing file. The
 * suite passed or failed on timing. `--root` exists because of that.
 */
function withDoc(contents, assertion) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gcdrift-"));
  const file = path.join(root, "docs", "claim.md");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents, "utf8");
  try {
    assertion(run(root), "claim.md");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("the repository is clean, which is the state this check defends", () => {
  const { status, report } = run();
  assert.equal(status, 0, `drift found: ${JSON.stringify(report.findings, null, 2)}`);
  assert.ok(report.checked.length >= 3, "too few primitive pairs to be worth running");
  assert.deepEqual(report.dormant, [], "a pair naming a primitive this pack lacks is a stale pair");
});

test("the claim that started this is caught, verbatim", () => {
  // Copied from the retired document, wording unchanged.
  withDoc(
    "5. **Timeline primitive**\n\n" +
      "   Work-experience timelines currently require bullets plus\n" +
      "   `LineBuilder.vertical(...)` and margin tuning.\n",
    ({ status, report }, name) => {
      assert.equal(status, 1);
      const finding = report.findings.find((f) => f.file.endsWith(name));
      assert.ok(finding, `not caught: ${JSON.stringify(report.findings)}`);
      assert.equal(finding.concept, "timeline");
      assert.equal(finding.primitive, "addTimeline");
      assert.match(finding.replacement, /TimelineBuilder/);
    },
  );
});

test("teaching the contrast is not drift — the primitive named beside it is the tell", () => {
  withDoc(
    "Older packs said timelines require bullets plus `LineBuilder.vertical(...)`.\n" +
      "That is no longer true: use `addTimeline(...)` with `TimelineBuilder.entry(...)`.\n",
    ({ status, report }, name) => {
      assert.equal(status, 0, `false positive: ${JSON.stringify(report.findings)}`);
      assert.ok(!report.findings.some((f) => f.file.endsWith(name)));
    },
  );
});

test("a background band drawn with content rows is caught", () => {
  withDoc(
    "CV and proposal references often use background surfaces that cross the\n" +
      "content grid. Today these are painted with content rows as background paint.\n",
    ({ status, report }, name) => {
      assert.equal(status, 1);
      const finding = report.findings.find((f) => f.file.endsWith(name));
      assert.ok(finding, `not caught: ${JSON.stringify(report.findings)}`);
      assert.equal(finding.primitive, "pageBackgrounds");
    },
  );
});

test("the sentences that teach the closed-set rule stay silent", () => {
  // Every one of these came out of the repository and was flagged by the first,
  // broader version of this check. They deny nothing: they explain that the
  // allow-list is closed.
  withDoc(
    "If a method, overload or enum constant is not listed there, it does not\n" +
      "exist for this version — do not invent one. Grep the `TableBuilder` or\n" +
      "`LayerStackBuilder` you are about to call. `--exists` answering absent\n" +
      "means it does not exist: a closed answer, not a search result.\n",
    ({ status, report }, name) => {
      assert.equal(status, 0, `false positive: ${JSON.stringify(report.findings)}`);
      assert.ok(!report.findings.some((f) => f.file.endsWith(name)));
    },
  );
});

test("prose that merely says 'there is no' about something that is not an API stays silent", () => {
  withDoc(
    "Working inside your own Java project there is no shared copy — run\n" +
      "`node scripts/init-workspace.mjs` and the workspace is yours.\n" +
      "For an SVG, `size` is null: there is no pixel size to read.\n",
    ({ status, report }, name) => {
      assert.equal(status, 0, `false positive: ${JSON.stringify(report.findings)}`);
      assert.ok(!report.findings.some((f) => f.file.endsWith(name)));
    },
  );
});

test("a pack is only held to primitives it actually declares", () => {
  // A document describing the hand-built form was correct on a line that had no
  // primitive. Firing on it would be the same error in the other direction, so
  // every pair is looked up in the pack being checked rather than assumed.
  //
  // Only 1.9 and 2.2 carry a generated allow-list; 1.6 and 1.7 are prose-only
  // packs, and the checker refuses them with exit 2 rather than reporting a
  // clean run it did not make.
  const older = spawnSync(process.execPath, [CLI, "--version", "1.9", "--json"], {
    encoding: "utf8",
    cwd: repoRoot,
  });
  assert.notEqual(older.status, 2, `1.9 should have an allow-list: ${older.stderr}`);
  const report = JSON.parse(older.stdout);
  assert.equal(report.pack, "graphcompose-1.9");
  assert.equal(
    report.checked.length + report.dormant.length,
    4,
    "every pair must be classified as checked or dormant, never dropped",
  );

  const missing = spawnSync(process.execPath, [CLI, "--version", "1.6", "--json"], {
    encoding: "utf8",
    cwd: repoRoot,
  });
  assert.equal(missing.status, 2, "a pack with no allow-list cannot be checked, and must say so");
  assert.match(missing.stderr, /no allow-list/);
});

test("verify runs it, so a reintroduced claim fails the gate rather than the next render", () => {
  const verify = fs.readFileSync(path.join(repoRoot, "scripts", "verify.mjs"), "utf8");
  assert.match(verify, /check-knowledge-drift\.mjs/);
});
