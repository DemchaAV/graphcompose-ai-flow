#!/usr/bin/env node
/**
 * scripts/test/skill-validation-gate.test.mjs — the one thing in the gate that
 * depends on where the revision is: the link to the API-compatibility checklist
 * the report says it parsed coverage from.
 *
 * It was the constant `../../../../validation/…`, right for the harness's own
 * `examples/<project>/revisions/<id>/` and wrong for every workspace, which is
 * one level deeper. The repository-contract link check finds it the moment a
 * workspace sits inside a clone of the harness.
 *
 *   node --test "scripts/test/**\/*.test.mjs"
 */

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { retargetChecklistLink } from "../lib/skill-validation-gate.mjs";

const BODY =
  "Fixture coverage is parsed from\n" +
  "[validation/api-compatibility-checklist.md](validation/api-compatibility-checklist.md)\n" +
  "— rows whose `Fixture exists` column starts with `yes`.\n";

const HARNESS = path.resolve("C:", "harness");

/** Where the link points, as written in the report. */
function target(body) {
  return /\]\(([^)]*)\)/.exec(body)?.[1] ?? null;
}

test("the harness's own examples get the four levels they have always needed", () => {
  const revision = path.join(HARNESS, "examples", "cv-reference", "revisions", "revision-001");
  assert.equal(
    target(retargetChecklistLink(BODY, revision, HARNESS)),
    "../../../../validation/api-compatibility-checklist.md",
  );
});

test("a workspace inside the harness is one level deeper, and gets five", () => {
  const revision = path.join(
    HARNESS,
    "graphcompose-flow",
    "projects",
    "navy-gold-cv",
    "revisions",
    "revision-008",
  );
  assert.equal(
    target(retargetChecklistLink(BODY, revision, HARNESS)),
    "../../../../../validation/api-compatibility-checklist.md",
  );
});

test("a workspace in the user's own tree names the checklist instead of linking to it", () => {
  const revision = path.resolve(
    "C:",
    "Users",
    "someone",
    "app",
    "graphcompose-flow",
    "projects",
    "invoice",
    "revisions",
    "revision-001",
  );
  const written = retargetChecklistLink(BODY, revision, HARNESS);

  // A link out of the workspace and into a versioned plugin-cache directory
  // resolves on exactly one machine until the next update. A filename does not
  // pretend to.
  assert.equal(target(written), null);
  assert.match(written, /`validation\/api-compatibility-checklist\.md` \(in the harness install\)/);
});

test("a body replayed from the cache is retargeted for the revision it lands in", () => {
  // What every cached verdict written before this holds: the hardcoded four.
  const cached =
    "[validation/api-compatibility-checklist.md]" +
    "(../../../../validation/api-compatibility-checklist.md)\n";
  const revision = path.join(HARNESS, "graphcompose-flow", "projects", "x", "revisions", "revision-001");

  assert.equal(
    target(retargetChecklistLink(cached, revision, HARNESS)),
    "../../../../../validation/api-compatibility-checklist.md",
  );
});

test("a report with no checklist reference is left alone", () => {
  const body = "# Skill Validation Report\n\nverdict: pass\n";
  assert.equal(retargetChecklistLink(body, path.join(HARNESS, "examples", "x"), HARNESS), body);
});
