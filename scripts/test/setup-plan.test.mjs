#!/usr/bin/env node
/**
 * scripts/test/setup-plan.test.mjs — when preflight builds, and when it says why
 * it did not.
 *
 * The decision is small and the consequences are not: building when nothing is
 * unbuilt costs a minute for no change, and building on a machine with no JDK
 * produces a failure that reads as "setup is broken" when the answer is
 * "install a JDK". That is the wrong-advice-delivered-confidently that split
 * `unbuilt` from `absent` in the first place, and it would come back the moment
 * this ran unconditionally.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { planSetup } from "../lib/setup-plan.mjs";

const READY = { needsSetup: false, unbuilt: [], absent: [] };
const UNBUILT = {
  needsSetup: true,
  unbuilt: ["revisionManager", "visualDiff", "previewRenderer"],
  absent: [],
};

test("an unbuilt tree is built, and the reason names what is missing", () => {
  const plan = planSetup(UNBUILT);

  assert.equal(plan.run, true);
  assert.match(plan.reason, /revisionManager, visualDiff, previewRenderer/);
  assert.deepEqual(plan.blockedBy, []);
});

test("a ready tree is left alone", () => {
  const plan = planSetup(READY);

  // `setup` reinstalls and rebuilds every Node tool unconditionally, so this is
  // not a no-op it could be allowed to discover for itself.
  assert.equal(plan.run, false);
  assert.match(plan.reason, /everything that ships as source is built/);
});

test("--no-setup reports instead of building, and says that is why", () => {
  const plan = planSetup(UNBUILT, { optedOut: true });

  assert.equal(plan.run, false);
  assert.equal(plan.reason, "--no-setup");
});

test("a missing JDK or Maven stops the build before it starts", () => {
  for (const missing of ["java", "maven"]) {
    const plan = planSetup({ ...UNBUILT, absent: [missing] });

    assert.equal(plan.run, false, `${missing} absent should not build`);
    assert.deepEqual(plan.blockedBy, [missing]);
    assert.match(plan.reason, new RegExp(`stop at ${missing}`));
    assert.match(plan.reason, /install it first/);
  }
});

test("both missing are named together, and in the plural", () => {
  const plan = planSetup({ ...UNBUILT, absent: ["java", "maven"] });

  assert.deepEqual(plan.blockedBy, ["java", "maven"]);
  assert.match(plan.reason, /install them first/);
});

test("a missing ImageMagick does not stop the build", () => {
  // The gates need it; `setup` never looks at it and would build the tools
  // perfectly well without it. Blocking here would refuse a build for a reason
  // the build does not have.
  const plan = planSetup({ ...UNBUILT, absent: ["imagemagick"] });

  assert.equal(plan.run, true);
  assert.deepEqual(plan.blockedBy, []);
});

test("opting out wins over every other reason, so the flag always means the same thing", () => {
  assert.equal(planSetup(READY, { optedOut: true }).reason, "--no-setup");
  assert.equal(planSetup({ ...UNBUILT, absent: ["java"] }, { optedOut: true }).reason, "--no-setup");
  assert.equal(planSetup(UNBUILT, { optedOut: true, runWillStop: "no pack" }).reason, "--no-setup");
});

test("a run that is about to stop does not pay for a build first", () => {
  // An unsupported line exits 3 and a directory that is not a GraphCompose
  // project exits 4, both a few lines after the tools are read. Building first
  // spent a full `npm ci` and a Maven package to answer a question the caller
  // never gets to ask: a typo in --project-dir cost minutes and then said "not
  // a GraphCompose project".
  for (const why of ["this is not a GraphCompose project", "GraphCompose 9.9.9 has no skill pack"]) {
    const plan = planSetup(UNBUILT, { runWillStop: why });

    assert.equal(plan.run, false);
    assert.match(plan.reason, new RegExp(why.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(plan.reason, /stops before the tools are needed/);
  }
});

test("a run that will not stop still builds", () => {
  assert.equal(planSetup(UNBUILT, { runWillStop: null }).run, true);
});

test("a report with nothing in it is not read as a reason to build", () => {
  assert.equal(planSetup({}).run, false);
  assert.equal(planSetup(null).run, false);
});
