#!/usr/bin/env node
/**
 * scripts/test/telemetry-baseline.test.mjs — what the corpus looked like before
 * the diagnostics work, recountable by anyone.
 *
 * A run report can only be produced while the host's hooks are running, so it
 * cannot be re-derived later and cannot cover projects authored months ago.
 * This counts what is on disk instead, which is the property a baseline needs:
 * a comparison a year from now has to be able to recompute the "before".
 *
 * The assertions that matter most are the ones about *not* measuring. Two of
 * the metrics the plan asks for cannot be derived from a revision folder, and
 * reporting an approximation of them would be worse than reporting nothing —
 * it would be quoted later as if it were the real thing.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { projectBaseline, workspaceBaseline } from "../telemetry/baseline.mjs";

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcbase-${label}-`));
  process.on("exit", () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
  return dir;
}

function write(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof contents === "string" ? contents : JSON.stringify(contents, null, 2), "utf8");
}

/** A project whose revisions carry whatever each case needs. */
function projectWith(revisions, label = "proj") {
  const dir = path.join(tempDir(label), "sample");
  revisions.forEach((revision, index) => {
    const id = `revision-${String(index + 1).padStart(3, "0")}`;
    const revisionDir = path.join(dir, "revisions", id);
    write(path.join(revisionDir, "revision.json"), {
      id,
      status: revision.status ?? "DRAFT",
      createdAt: revision.createdAt ?? null,
      ...(revision.iteration ? { iteration: revision.iteration } : {}),
    });
    if (revision.template !== undefined) {
      write(path.join(revisionDir, "generated-template.java"), revision.template);
    }
    if (revision.rendered !== false) write(path.join(revisionDir, "output.pdf"), "%PDF");
  });
  return dir;
}

const TEMPLATE = (inset) => `
class T {
    private void render(SectionBuilder section) {
        section.addParagraph(p -> p.text("A").margin(${inset}));
        section.addParagraph(p -> p.text("B").margin(${inset}));
    }
}
`;

test("a project with no revisions counts as zero rather than breaking the sum", () => {
  // projectCounters returned no `failedRevisions` on its empty branch, so a
  // workspace roll-up produced NaN the moment one project had no revisions.
  const root = tempDir("empty-ws");
  fs.mkdirSync(path.join(root, "blank"), { recursive: true });

  const { totals } = workspaceBaseline(root);
  assert.equal(totals.projects, 1);
  assert.equal(totals.revisions, 0);
  assert.equal(totals.failedRevisions, 0, "an empty project must contribute 0, not undefined");
  assert.ok(Number.isFinite(totals.failedRevisions));
});

test("revisions, renders and FAILED come off disk", () => {
  const dir = projectWith([
    { status: "SUPERSEDED" },
    { status: "FAILED", rendered: false },
    { status: "APPROVED" },
  ]);
  const b = projectBaseline(dir);

  assert.equal(b.revisions, 3);
  assert.equal(b.renders, 2);
  assert.equal(b.failedRevisions, 1);
  assert.equal(b.approved, 1);
});

test("a Java edit is counted when the template actually changed", () => {
  const dir = projectWith([
    { template: TEMPLATE("0, 0, 5, 0") },
    { template: TEMPLATE("0, 0, 5, 0") }, // untouched
    { template: TEMPLATE("0, 0, 9, 0") }, // edited
  ]);
  const b = projectBaseline(dir);
  assert.equal(b.javaEdits, 1, "an identical template between revisions is not an edit");
});

test("inset churn measures how much geometry moved, and is zero when nothing did", () => {
  const still = projectBaseline(
    projectWith([{ template: TEMPLATE("0, 0, 5, 0") }, { template: TEMPLATE("0, 0, 5, 0") }], "still"),
  );
  assert.equal(still.insetChurnPerRevision, 0);

  // Two calls change value: two removed, two added.
  const moved = projectBaseline(
    projectWith([{ template: TEMPLATE("0, 0, 5, 0") }, { template: TEMPLATE("0, 0, 9, 0") }], "moved"),
  );
  assert.equal(moved.insetChurnPerRevision, 4);
});

test("days to first approval come from the recorded timestamps, or stay null", () => {
  const dated = projectBaseline(
    projectWith(
      [
        { status: "DRAFT", createdAt: "2026-06-01T00:00:00.000Z" },
        { status: "APPROVED", createdAt: "2026-06-03T12:00:00.000Z" },
      ],
      "dated",
    ),
  );
  assert.equal(dated.daysToFirstApproved, 2.5);

  const undated = projectBaseline(projectWith([{ status: "APPROVED" }], "undated"));
  assert.equal(undated.daysToFirstApproved, null, "no timestamps means no answer, not a guess");
});

test("iteration counts are reported as coverage, because most revisions carry none", () => {
  // 9 of 53 revisions in this repository record one. An average over the ones
  // that happen to have it would read as an average over all of them.
  const dir = projectWith([{ iteration: 1 }, { iteration: 3 }, {}]);
  const b = projectBaseline(dir);
  assert.equal(b.iterationsRecorded, 2);
  assert.equal(b.maxIteration, 3);
});

test("structural smells are counted on the newest revision, which is the state to compare against", () => {
  const dir = projectWith([
    { template: TEMPLATE("0, 0, 5, 0") }, // smelly
    { template: "class T { private void render() {} }" }, // cleaned up
  ]);
  const b = projectBaseline(dir, { primitives: new Set(["addTimeline"]) });
  assert.equal(b.structuralSmells.total, 0, "an old revision's smell is not the project's current state");
});

test("the metrics that cannot be derived from disk are null, not approximated", () => {
  // The plan's two headline metrics need the loop to record what a pass was
  // trying to fix. A near-miss number would be quoted later as if it were the
  // real one, which is worse than a blank.
  const b = projectBaseline(projectWith([{ template: TEMPLATE("0, 0, 5, 0") }]));
  assert.equal(b.rendersPerGeometryCorrection, null);
  assert.equal(b.ownerCorrectOnFirstAttempt, null);
  assert.equal(b.collateralNodesPerRevision, null);
});

test("a workspace rolls its projects up and keeps the per-kind smell breakdown", () => {
  const root = tempDir("ws");
  for (const name of ["alpha", "beta"]) {
    const revisionDir = path.join(root, name, "revisions", "revision-001");
    write(path.join(revisionDir, "revision.json"), { id: "revision-001", status: "APPROVED" });
    write(path.join(revisionDir, "generated-template.java"), TEMPLATE("0, 0, 5, 0"));
    write(path.join(revisionDir, "output.pdf"), "%PDF");
  }

  const { projects, totals } = workspaceBaseline(root);
  assert.deepEqual(projects.map((p) => p.project), ["alpha", "beta"]);
  assert.equal(totals.revisions, 2);
  assert.equal(totals.structuralSmells, 2);
  assert.equal(totals.byKind["repeated-sibling-offset"], 2);
});

test("an unreadable revision costs the caller nothing", () => {
  // Telemetry never fails the work it measures.
  const dir = projectWith([{ status: "APPROVED" }]);
  fs.writeFileSync(path.join(dir, "revisions", "revision-001", "revision.json"), "{ not json", "utf8");
  const b = projectBaseline(dir);
  assert.equal(b.revisions, 1);
  assert.equal(b.approved, 0, "an unparseable record contributes nothing rather than throwing");
});
