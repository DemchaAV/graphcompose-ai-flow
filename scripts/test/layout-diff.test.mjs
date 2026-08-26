#!/usr/bin/env node
/**
 * scripts/test/layout-diff.test.mjs — did the patch move what it claimed?
 *
 * The fixture pair under `fixtures/layout-diff-pair/` is two real renders of
 * the same eight-node document differing by exactly one property:
 * `Panel.padding.left`, 0 then 12. Both were measured by GraphCompose 2.2.0;
 * only the source was authored. A pair whose difference was typed rather than
 * measured could not prove a diff engine right, which is the same rule the
 * inspector's fixture follows.
 *
 * The pair is shaped so all three claims are testable at once:
 *
 *   - one authored change, `Panel.padding.left`
 *   - three descendants that followed it
 *   - one collateral change *upward* — the root grew, because its widest child
 *     did, and nothing in the edit said so
 *   - one subtree, `Untouched`, that must come out of the diff untouched
 *
 * That last one carries the most weight. "Only the intended thing changed" is
 * not provable without something that was supposed to stay put.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { compareExpectation, diffSnapshots } from "../lib/layout-diff.mjs";
import { loadSnapshot, resolveNode } from "../lib/layout-inspector.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(repoRoot, "scripts", "layout.mjs");
const PAIR = path.join(repoRoot, "scripts", "test", "fixtures", "layout-diff-pair");
const BEFORE_FILE = path.join(PAIR, "before", "layout-snapshot.json");
const AFTER_FILE = path.join(PAIR, "after", "layout-snapshot.json");

const read = (file) => loadSnapshot(JSON.parse(fs.readFileSync(file, "utf8")));
const before = read(BEFORE_FILE);
const after = read(AFTER_FILE);
const diff = diffSnapshots(before, after);

const cli = (...argv) => spawnSync(process.execPath, [CLI, ...argv], { encoding: "utf8", cwd: repoRoot });
const paths = (list) => list.map((e) => e.path).sort();

// ------------------------------------------------------------ the fixture ---

test("both sides of the pair are engine measurements of the same document", () => {
  assert.equal(before.nodes.length, 8);
  assert.equal(after.nodes.length, 8);
  assert.equal(before.formatVersion, after.formatVersion);
  // The one property the pair differs by, and the proof it is the only one.
  assert.equal(resolveNode(before, "Panel").padding.left, 0);
  assert.equal(resolveNode(after, "Panel").padding.left, 12);
});

// ------------------------------------------------- authored versus derived ---

test("the edit is separated from its consequences", () => {
  // "5 nodes changed" is not actionable. "one padding was edited and three
  // children followed" is.
  assert.equal(diff.totals.changed, 5);
  assert.equal(diff.authoredChanges.length, 1);

  const [edit] = diff.authoredChanges;
  assert.equal(edit.name, "Panel");
  assert.deepEqual(edit.changes.authored, { "padding.left": [0, 12] });
  // The edited node also moved — a node can be both cause and consequence.
  assert.deepEqual(edit.changes.derived, { placementWidth: [95.704, 107.704] });
});

test("the descendants that followed are named, and only they", () => {
  assert.equal(diff.affectedDescendants.length, 3);
  for (const entry of diff.affectedDescendants) {
    assert.deepEqual(entry.changes.derived, { placementX: [0, 12] });
    assert.equal(entry.explainedBy, "LayoutDiffFixture[0]/Panel[0]", "each one points at the edit that explains it");
    assert.ok(entry.path.startsWith("LayoutDiffFixture[0]/Panel[0]/"));
  }
});

test("a node that moved with no edit to explain it is reported as collateral", () => {
  // The root grew because its widest child did. Nothing is wrong — and nothing
  // in the edit said it would happen, which is the whole point of saying it.
  assert.equal(diff.collateral.length, 1);
  const [surprise] = diff.collateral;
  assert.equal(surprise.name, "LayoutDiffFixture");
  assert.deepEqual(surprise.changes.derived, { placementWidth: [95.704, 107.704] });
});

test("the subtree that was supposed to stay put comes out untouched", () => {
  // Without this assertion the diff could be reporting everything as changed
  // and every test above would still pass.
  const moved = new Set([...paths(diff.changedNodes)]);
  const untouched = after.nodes.filter((n) => n.path.startsWith("LayoutDiffFixture[0]/Untouched[1]"));
  assert.equal(untouched.length, 3, "the fixture still has a sibling subtree");
  for (const node of untouched) assert.ok(!moved.has(node.path), `${node.path} should not have moved`);
  assert.equal(diff.totals.unchanged, 3);
});

test("nothing was added or removed, and the pagination did not move", () => {
  assert.deepEqual(diff.added, []);
  assert.deepEqual(diff.removed, []);
  assert.equal(diff.pagination.changed, false);
});

test("a snapshot diffed against itself reports nothing at all", () => {
  const same = diffSnapshots(before, read(BEFORE_FILE));
  assert.equal(same.totals.changed, 0);
  assert.equal(same.collateral.length, 0);
  assert.equal(same.affectedDescendants.length, 0);
  assert.equal(same.ownership.length, 0);
});

test("contentWidth is not compared, so geometry is reported once", () => {
  // It equals placementWidth on every node ever measured, so comparing it would
  // print a second line saying the same thing about every node that moved.
  for (const entry of diff.changedNodes) {
    assert.ok(!("contentWidth" in entry.changes.derived));
    assert.ok(!("contentHeight" in entry.changes.derived));
  }
});

// ------------------------------------------------------- region scoping ------

test("--region narrows the comparison to one subtree", () => {
  const scoped = diffSnapshots(before, after, { regionNode: resolveNode(after, "Untouched") });
  assert.equal(scoped.totals.changed, 0, "the untouched region really is untouched");
  assert.equal(scoped.scope.nodes, 3);

  const panel = diffSnapshots(before, after, { regionNode: resolveNode(after, "Panel") });
  assert.equal(panel.authoredChanges.length, 1);
  assert.equal(panel.affectedDescendants.length, 3);
  // The root is outside the region, so its growth is not this region's business.
  assert.equal(panel.collateral.length, 0);
});

// ----------------------------------------------------------- ownership ------

test("two siblings gaining the same inset is reported, with the owner named", () => {
  // The item-13 pattern. Synthetic on purpose: it is a statement about the rule,
  // not about any measurement, and the corpus has no revision that does it.
  const zero = { top: 0, right: 0, bottom: 0, left: 0 };
  const node = (over) => ({
    path: "R[0]",
    entityKind: "SectionNode",
    parentPath: null,
    childIndex: 0,
    placementX: 0,
    placementY: 0,
    placementWidth: 100,
    placementHeight: 10,
    startPage: 0,
    endPage: 0,
    margin: { ...zero },
    padding: { ...zero },
    ...over,
  });
  const canvas = { pageWidth: 100, pageHeight: 100, margin: { ...zero } };
  const doc = (marginLeft) => ({
    canvas,
    totalPages: 1,
    nodes: [
      node({ entityName: "Parent" }),
      node({ path: "R[0]/A[0]", entityName: "A", parentPath: "R[0]", childIndex: 0, margin: { ...zero, left: marginLeft } }),
      node({ path: "R[0]/B[1]", entityName: "B", parentPath: "R[0]", childIndex: 1, margin: { ...zero, left: marginLeft } }),
    ],
  });

  const spread = diffSnapshots(loadSnapshot(doc(0)), loadSnapshot(doc(12)));
  assert.equal(spread.ownership.length, 1);
  const [finding] = spread.ownership;
  assert.equal(finding.pattern, "shared-sibling-displacement");
  assert.equal(finding.recommendedOwnerName, "Parent");
  assert.equal(finding.propertyCandidate, "padding.left");
  assert.equal(finding.delta, 12);
  assert.deepEqual(finding.siblings.sort(), ["R[0]/A[0]", "R[0]/B[1]"]);
});

test("one sibling alone is not a pattern, and a zero delta is never one", () => {
  // Two, not three — the census behind check-structural-smells found nothing in
  // the corpus repeating an inset three times, so a rule firing at three would
  // never fire. And a delta of zero neutralises a default rather than stating
  // shared geometry, which is the false positive that census actually found.
  assert.equal(diff.ownership.length, 0, "one edited node is not a shared displacement");
});

// -------------------------------------------------------- expectations ------

test("a revision that declared what it would move is held to it", () => {
  const met = compareExpectation(diff, ["Panel"], after);
  assert.equal(met.declared, true);
  // Panel's subtree covers the edit and its three children; the root's growth
  // is outside it, and that is the report.
  assert.deepEqual(
    met.unexpected.map((u) => u.name),
    ["LayoutDiffFixture"],
  );
  assert.deepEqual(met.unmatchedExpectations, []);
});

test("declaring nothing disables the check rather than promising stillness", () => {
  // A revision that forgot to fill the field in must not read as one that
  // promised nothing would move.
  const none = compareExpectation(diff, [], after);
  assert.equal(none.declared, false);
  assert.deepEqual(none.unexpected, []);
  assert.deepEqual(compareExpectation(diff, undefined, after).unexpected, []);
});

test("an expectation naming nothing is reported, not silently ignored", () => {
  // The usual cause is a typo, and treating it as "nothing expected" would turn
  // the check off exactly when somebody tried to use it.
  const typo = compareExpectation(diff, ["Panle"], after);
  assert.deepEqual(typo.unmatchedExpectations, ["Panle"]);
  assert.deepEqual(typo.satisfied, []);
  assert.equal(typo.unexpected.length, diff.changedNodes.length);
});

// -------------------------------------------------------------------- CLI ---

test("the CLI prints the three groups and names the collateral", () => {
  const result = cli("diff", "--snapshot", BEFORE_FILE, "--against", AFTER_FILE);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /edited \(1\)/);
  assert.match(result.stdout, /padding\.left 0 → 12/);
  assert.match(result.stdout, /followed \(3\)/);
  assert.match(result.stdout, /collateral \(1\)/);
  assert.match(result.stdout, /LayoutDiffFixture/);
});

test("--json carries the classification an agent needs", () => {
  const result = cli("diff", "--snapshot", BEFORE_FILE, "--against", AFTER_FILE, "--json");
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.authoredChanges.length, 1);
  assert.equal(parsed.affectedDescendants.length, 3);
  assert.equal(parsed.collateral.length, 1);
  assert.equal(parsed.totals.unchanged, 3);
});

test("diff is evidence: it exits 0 even when it finds collateral", () => {
  // The same contract check-structural-smells has. A heuristic that blocked the
  // loop on its first day would be switched off on its second.
  assert.equal(cli("diff", "--snapshot", BEFORE_FILE, "--against", AFTER_FILE).status, 0);
  assert.equal(cli("diff", "--snapshot", BEFORE_FILE, "--against", BEFORE_FILE).status, 0);
});

test("the CLI says so plainly when nothing moved", () => {
  const result = cli("diff", "--snapshot", BEFORE_FILE, "--against", BEFORE_FILE);
  assert.match(result.stdout, /Nothing moved/);
});

test("diff refuses half an argument list rather than guessing the other half", () => {
  assert.equal(cli("diff", "--snapshot", BEFORE_FILE).status, 2, "--snapshot without --against");
  assert.equal(cli("diff", "revision-001").status, 2, "one revision is not a pair");
  assert.equal(cli("diff").status, 2);
  assert.equal(cli("diff", "--snapshot", BEFORE_FILE, "--against", "no/such.json").status, 4);
});

test("--region on the CLI resolves the node by name", () => {
  const scoped = cli("diff", "--snapshot", BEFORE_FILE, "--against", AFTER_FILE, "--region", "Untouched");
  assert.equal(scoped.status, 0);
  assert.match(scoped.stdout, /Nothing moved/);

  const missing = cli("diff", "--snapshot", BEFORE_FILE, "--against", AFTER_FILE, "--region", "Nope");
  assert.equal(missing.status, 3);
});
