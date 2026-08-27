#!/usr/bin/env node
/**
 * scripts/test/probe-build.test.mjs — which build a probe measures.
 *
 * The failure: a run pinned to 2.2.1-SNAPSHOT asked the probes whether the
 * engine still laid a layered row out horizontally. The probes were built
 * against the diagnostics pom's pinned release and answered about 2.2.1. The
 * run took the answer as a fact about its own build, wrote it up as a
 * regression, and rewrote a page architecture around the workaround.
 *
 * Measured afterwards with the fix in place: the escape holds on 2.2.2 and does
 * not on that local 2.2.1-SNAPSHOT. Both were true the whole time; nothing
 * could ask the second question.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { selectBuild } from "../lib/probe-build.mjs";

const LINES = ["2.2", "1.9"];

test("with nothing requested, the newest line runs against the pom's pin", () => {
  const chosen = selectBuild({ availableLines: LINES });
  assert.equal(chosen.line, "2.2");
  assert.equal(chosen.build, null, "no build means the pom decides, as it always did");
  assert.equal(chosen.warning, null);
});

test("a requested build picks the line it belongs to", () => {
  const chosen = selectBuild({
    requested: { version: "2.2.1-SNAPSHOT", source: "workspace" },
    availableLines: LINES,
  });
  assert.equal(chosen.line, "2.2");
  assert.equal(chosen.build.version, "2.2.1-SNAPSHOT", "a SNAPSHOT is measured as itself");
});

test("an explicit line and a build on that line agree", () => {
  const chosen = selectBuild({
    requested: { version: "2.2.2", source: "--build" },
    requestedLine: "2.2",
    availableLines: LINES,
  });
  assert.equal(chosen.line, "2.2");
  assert.equal(chosen.build.version, "2.2.2");
  assert.equal(chosen.warning, null);
});

test("a build from another line is dropped, loudly, rather than answered about", () => {
  // Running the 2.2 probes and reporting the number as 1.9.0's behaviour is the
  // same substitution one level up.
  const chosen = selectBuild({
    requested: { version: "1.9.0", source: "--build" },
    requestedLine: "2.2",
    availableLines: LINES,
  });
  assert.equal(chosen.line, "2.2");
  assert.equal(chosen.build, null);
  assert.match(chosen.warning, /1\.9\.0 is on the 1\.9 line/);
  assert.match(chosen.warning, /measuring the pom's pin instead/);
});

test("a line with no diagnostics project is still named, not silently swapped", () => {
  const chosen = selectBuild({
    requested: { version: "3.0.0", source: "--build" },
    availableLines: LINES,
  });
  // The line comes from the build, so the caller reports "no probes for 3.0"
  // rather than quietly measuring 2.2.
  assert.equal(chosen.line, "3.0");
  assert.equal(chosen.build.version, "3.0.0");
});
