#!/usr/bin/env node
/**
 * scripts/test/attempts.test.mjs — every render on the record.
 *
 * The corpus this exists for: 50 revisions, 358 render-and-diff runs, and the
 * loop's bounds counting folders. These tests pin what one attempt records,
 * what a re-run of unchanged sources looks like, and what a stalled sweep
 * reads as.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ATTEMPTS_FILE,
  describeAttempts,
  readAttempts,
  recordAttempt,
  sourceFingerprint,
} from "../lib/attempts.mjs";

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcatt-${label}-`));
  process.on("exit", () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
  return dir;
}

function revisionWith(sources, label) {
  const dir = tempDir(label);
  for (const [name, body] of Object.entries(sources)) fs.writeFileSync(path.join(dir, name), body, "utf8");
  return dir;
}

test("the fingerprint covers the template and its data, and nothing else", () => {
  const dir = revisionWith(
    {
      "GeneratedCvTemplate.java": "class A {}",
      "cv-data.json": "{}",
      "cv-data.overflow.json": "{}",
      "asset-request.json": "{}",
      "GeneratedCvTemplateTest.java": "class T {}",
      "visual-review.json": "{}",
      "output.png": "x",
    },
    "fp",
  );
  const first = sourceFingerprint(dir);
  assert.deepEqual(first.files, [
    "GeneratedCvTemplate.java",
    "asset-request.json",
    "cv-data.json",
    "cv-data.overflow.json",
  ]);

  // A review or a render changing does not change the fingerprint…
  fs.writeFileSync(path.join(dir, "visual-review.json"), '{"verdict":"REVISE"}');
  fs.writeFileSync(path.join(dir, "output.png"), "y");
  assert.equal(sourceFingerprint(dir).fingerprint, first.fingerprint);
  // …a one-character edit to the template does.
  fs.writeFileSync(path.join(dir, "GeneratedCvTemplate.java"), "class A { }");
  assert.notEqual(sourceFingerprint(dir).fingerprint, first.fingerprint);
});

test("each render appends one entry, numbered, with its movement against the previous", () => {
  const dir = revisionWith({ "GeneratedCvTemplate.java": "v1", "cv-data.json": "{}" }, "seq");
  assert.deepEqual(readAttempts(dir), []);

  const a = recordAttempt(dir, { mismatchPx: 1000, percent: 6.5, against: "reference" });
  assert.equal(a.n, 1);
  assert.equal(a.moved, null);
  assert.equal(a.sameSourcesAsPrevious, false);

  fs.writeFileSync(path.join(dir, "GeneratedCvTemplate.java"), "v2");
  const b = recordAttempt(dir, {
    mismatchPx: 900,
    percent: 6.1,
    against: "reference",
    worstRegions: [{ id: "header", concentration: 2.4, percentOfRegion: 30 }],
    causes: [{ region: "header", cause: "GEOMETRY" }],
  });
  assert.equal(b.n, 2);
  assert.equal(b.moved, -0.4);
  assert.equal(b.sameSourcesAsPrevious, false);
  assert.deepEqual(b.worstRegions, [{ id: "header", concentration: 2.4, percentOfRegion: 30 }]);
  assert.deepEqual(b.causes, [{ region: "header", cause: "GEOMETRY" }]);

  const stored = JSON.parse(fs.readFileSync(path.join(dir, ATTEMPTS_FILE), "utf8"));
  assert.equal(stored.attempts.length, 2);
  assert.equal(readAttempts(dir).length, 2);
});

test("a render of unchanged sources is a re-run, not a try", () => {
  const dir = revisionWith({ "GeneratedCvTemplate.java": "v1", "cv-data.json": "{}" }, "rerun");
  recordAttempt(dir, { percent: 6.5, mismatchPx: 100 });
  const again = recordAttempt(dir, { percent: 6.5, mismatchPx: 100 });
  assert.equal(again.sameSourcesAsPrevious, true);

  const summary = describeAttempts(readAttempts(dir));
  assert.equal(summary.renders, 2);
  assert.equal(summary.distinctSources, 1);
  assert.equal(summary.reruns, 1);
});

test("a sweep whose last two renders moved under the material threshold reads as stalled", () => {
  const dir = revisionWith({ "GeneratedCvTemplate.java": "s1", "cv-data.json": "{}" }, "sweep");
  const values = [6.622, 6.651, 6.62, 6.598];
  values.forEach((percent, i) => {
    fs.writeFileSync(path.join(dir, "GeneratedCvTemplate.java"), `s${i}`);
    recordAttempt(dir, { percent, mismatchPx: Math.round(percent * 1000) });
  });
  const summary = describeAttempts(readAttempts(dir), 0.25);
  assert.equal(summary.renders, 4);
  assert.equal(summary.distinctSources, 4);
  assert.equal(summary.stalled, true, JSON.stringify(summary));
  assert.deepEqual(summary.trail, values);
  assert.equal(summary.netMoved, -0.024);

  // A real move at the end is not a stall.
  fs.writeFileSync(path.join(dir, "GeneratedCvTemplate.java"), "s-final");
  recordAttempt(dir, { percent: 5.2, mismatchPx: 5200 });
  assert.equal(describeAttempts(readAttempts(dir), 0.25).stalled, false);
});

test("a --skip-render re-measure is recorded as not rendered and not counted as a render", () => {
  const dir = revisionWith({ "GeneratedCvTemplate.java": "v1" }, "measure");
  recordAttempt(dir, { percent: 7, mismatchPx: 70, rendered: false });
  const summary = describeAttempts(readAttempts(dir));
  assert.equal(summary.renders, 0);
  assert.equal(readAttempts(dir)[0].rendered, false);
});
