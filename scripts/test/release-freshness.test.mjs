#!/usr/bin/env node
/**
 * scripts/test/release-freshness.test.mjs — the gate fires on a new line, not
 * only on a new patch.
 *
 * ## The bug this pins
 *
 * `check-pack-freshness.mjs` filtered Maven Central's published versions to the
 * newest pack's own line before comparing anything. With a 2.2 pack it could
 * see 2.2.0, 2.2.1, 2.2.2 and nothing else — so when GraphCompose 2.3.0 shipped
 * it reported "current", and would have gone on reporting it. The one event the
 * gate exists to catch was the one event it could not see.
 *
 * It survived because the comparison and the network call were the same
 * function: nothing could ask "what would you say about a 2.2 pack and a
 * published 2.3.0" without a live fetch. The judgement is its own module now,
 * and these are the cases it has to get right.
 *
 * The line filter was not an accident, and it is still half there: a pack line
 * is frozen on purpose, so "a newer patch of my line" and "a newer line
 * entirely" stay separate verdicts. The first means repair this pack; the
 * second means there is no pack yet.
 *
 * Run with the built-in runner (no dependencies):
 *
 *   node --test scripts/test/
 */

import assert from "node:assert/strict";
import test from "node:test";

import { compareVersions, releaseFreshness } from "../lib/release-freshness.mjs";

/** Maven Central as it stood the day GraphCompose 2.3.0 shipped. */
const CENTRAL = ["2.0.0", "2.1.0", "2.1.1", "2.2.0", "2.2.1", "2.2.2", "2.3.0"];

test("a new line is caught — the case that used to read as current", () => {
  const verdict = releaseFreshness({ line: "2.2", verifiedAgainst: "2.2.2", published: CENTRAL });

  assert.equal(verdict.status, "line-behind", "a published 2.3.0 was invisible to a 2.2 pack");
  assert.equal(verdict.latestPublished, "2.3.0");
  // Named separately, because the pack is not wrong about its own line: the
  // message has to say "there is no pack for 2.3", not "repair the 2.2 one".
  assert.equal(verdict.latestInLine, "2.2.2");
});

test("a newer patch of the same line stays its own verdict", () => {
  const verdict = releaseFreshness({ line: "2.2", verifiedAgainst: "2.2.1", published: CENTRAL });

  assert.equal(verdict.status, "behind-in-line", "the original case regressed");
  assert.equal(verdict.latestInLine, "2.2.2");
});

test("in-line staleness wins when both are true", () => {
  // A 2.2 pack at 2.2.0 with 2.2.2 and 2.3.0 both published is behind twice
  // over. The nearer fix is reported: repairing the pack it has is a smaller
  // step than standing up the one it does not, and it is a prerequisite anyway.
  const verdict = releaseFreshness({ line: "2.2", verifiedAgainst: "2.2.0", published: CENTRAL });

  assert.equal(verdict.status, "behind-in-line");
  assert.equal(verdict.latestInLine, "2.2.2");
});

test("the newest pack for the newest release is current", () => {
  const verdict = releaseFreshness({ line: "2.3", verifiedAgainst: "2.3.0", published: CENTRAL });

  assert.equal(verdict.status, "current");
  assert.equal(verdict.latestPublished, "2.3.0");
});

test("a pack for a line nothing has published yet is ahead, not behind", () => {
  // How a pack gets built against a snapshot before the release exists. Failing
  // it would make the gate fire on the day someone does the right thing.
  const verdict = releaseFreshness({ line: "2.4", verifiedAgainst: "2.4.0-SNAPSHOT", published: CENTRAL });

  assert.equal(verdict.status, "unreleased-line");
  assert.equal(verdict.latestInLine, null);
});

test("pre-releases are not published releases", () => {
  const verdict = releaseFreshness({
    line: "2.3",
    verifiedAgainst: "2.3.0",
    published: [...CENTRAL, "2.4.0-SNAPSHOT", "2.4.0-rc1"],
  });

  assert.equal(verdict.status, "current", "a snapshot on Central was read as a release");
  assert.equal(verdict.latestPublished, "2.3.0");
});

test("a line is matched on its own boundary, not as a prefix", () => {
  // "2.2" must not swallow "2.20". The filter is a string prefix, so the dot is
  // what keeps a two-digit minor from being read as a patch of a one-digit one.
  const verdict = releaseFreshness({
    line: "2.2",
    verifiedAgainst: "2.2.2",
    published: ["2.2.0", "2.2.2", "2.20.0"],
  });

  assert.equal(verdict.latestInLine, "2.2.2", "2.20.0 was counted as part of the 2.2 line");
  assert.equal(verdict.status, "line-behind");
  assert.equal(verdict.latestPublished, "2.20.0");
});

test("versions compare by number, not by string", () => {
  // "2.10.0" < "2.9.0" alphabetically, which is how a sort that looks fine on
  // single-digit versions goes wrong at the tenth release of a line.
  assert.ok(compareVersions("2.10.0", "2.9.0") > 0);
  assert.equal(compareVersions("2.3", "2.3.0"), 0, "a missing component is not zero");
  assert.ok(compareVersions("2.2.2", "2.3.0") < 0);
});
